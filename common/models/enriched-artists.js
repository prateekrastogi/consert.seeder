'use strict'

const Rx = require('rxjs')
const _ = require('lodash')
const loginAssist = require('../../lib/login-assist')
const app = require('../../server/server')
const sample = require('../test/sample-data')

module.exports = function (enrichedArtists) {
  enrichedArtists.putEnrichedArtists = async function (callback) {
    let isSuccess
    let count = 0
    const artistSeed = app.models.artistSeed
    const uncrawledArtists = await artistSeed.find({where: {or: [{isCrawled: false}, {isCrawled: {exists: false}}]}})

    const spotifyApi = Rx.Observable.timer(0, 1000).concatMap((i) => Rx.Observable.fromPromise(loginAssist.spotifyLogin()))
    const artistList = Rx.Observable.from(uncrawledArtists)

    const artistListWithSpotifyToken = Rx.Observable.zip(spotifyApi, artistList.pluck('id'))

    artistListWithSpotifyToken
      .mergeMap(([spotifyApi, artistId]) => {
        const artist = Rx.Observable.fromPromise(spotifyApi.getArtist(artistId)).pluck('body')
          .map((artist) => truncateFullArtist(artist))

        const id = artist.pluck('id')

        const artistTopTracks = Rx.Observable.fromPromise(spotifyApi.getArtistTopTracks(artistId, 'US')).pluck('body', 'tracks')
          .map((topTracks) => _.map(topTracks, (topTrack) => truncateFullTrack(topTrack))).concatMap((topTracks) => Rx.Observable.from(topTracks))

        const artistTopTrackFeatures = artistTopTracks.pluck('id').bufferCount(100)
          .concatMap((topTracksId) => Rx.Observable.fromPromise(spotifyApi.getAudioFeaturesForTracks(topTracksId))).pluck('body', 'audio_features')
          .concatMap(features => Rx.Observable.from(features))

        const artistTopTracksWithAudioFeatures = Rx.Observable.zip(artistTopTracks, artistTopTrackFeatures, (track, audioFeatures) => {
          return {track, audioFeatures}
        }).reduce((accum, curr) => _.concat(accum, curr))

        const artistRelatedArtists = Rx.Observable.fromPromise(spotifyApi.getArtistRelatedArtists(artistId)).pluck('body', 'artists')
          .map((relatedArtists) => _.map(relatedArtists, (relatedArtist) => truncateFullArtist(relatedArtist)))

        const artistAlbums = Rx.Observable.range(0, 3).concatMap((i) => {
          return Rx.Observable.fromPromise(spotifyApi.getArtistAlbums(artistId, {
            market: 'US',
            limit: 50,
            offset: (i * 50)
          })).pluck('body', 'items')
        })

        const artistDetailedAlbums = artistAlbums.concatMap((albums) => Rx.Observable.from(albums).pluck('id'))
          .bufferCount(20).concatMap((bufferedAlbums) => {
            return spotifyApi.getAlbums(bufferedAlbums)
          }).pluck('body', 'albums').map((albums) => _.map(albums, (album) => truncateFullAlbum(album)))
          .reduce((accum, curr) => _.concat(accum, curr))

        const enrichedArtist = Rx.Observable.zip(id, artist, artistDetailedAlbums, artistTopTracksWithAudioFeatures, artistRelatedArtists, (id, artist, albums, topTracks, relatedArtists) => {
          return {id, artist, albums, topTracks, relatedArtists}
        })

        return enrichedArtist
      }, 3)
      .subscribe(async (x) => {
        count++
        let artistSeedInstance = await artistSeed.findById(x.id)
        await enrichedArtists.replaceOrCreate(x)
        artistSeedInstance.isCrawled = true
        await artistSeed.replaceOrCreate(artistSeedInstance)
        console.log(`Successfully added/replaced the artist: ${x.artist.name}`)
        console.log(`Total artists added/replaced in the running execution: ${count}`)
      })

    // TODO
    callback(null, isSuccess)
  }

  enrichedArtists.setEnrichedArtistsForReCrawl = async function (callback) {
    let count = 0
    const isSuccess = true
    const artistSeed = app.models.artistSeed

    const uncrawledArtists = await artistSeed.find({where: {or: [{isCrawled: false}, {isCrawled: {exists: false}}]}})

    if (uncrawledArtists.length === 0) {
      let crawledArtists = await artistSeed.find()
      const tbCrawled = _.map(crawledArtists, ({id, name, isCrawled}) => {
        return {id, name, isCrawled: false}
      })

      Rx.Observable.from(tbCrawled).concatMap((artist) => {
        return Rx.Observable.fromPromise(artistSeed.replaceOrCreate(artist))
      }).subscribe(x => {
        count++
        console.log(`Added artist ${x.name} in pending crawl list`)
        console.log(`Total artists added in the pending crawl list: ${count}`)
      })
    }
    // TODO
    callback(null, isSuccess)
  }

  function truncateFullArtist ({followers, genres, id, name, popularity, type}) {
    return {followers, genres, id, name, popularity, type}
  }

  function truncateSimplifiedArtist ({id, name, type}) {
    return {id, name, type}
  }

  function truncateSimplifiedAlbum ({album_type, id, name, type, artists}) {
    const slimArtists = _.map(artists, (artist) => truncateSimplifiedArtist(artist))
    const slimAlbum = {
      album_type,
      id,
      name,
      type,
      artists: slimArtists
    }
    return slimAlbum
  }

  function truncateFullAlbum ({album_type, genres, id, name, popularity, release_date, tracks, artists}) {
    const slimArtists = _.map(artists, (artist) => truncateSimplifiedArtist(artist))
    // As tracks returned are wrqpped inside a paging objects (No need for next until 27 tracks for sure)
    // Also, dropping the track objects from the album to keep the size of output small i.e. not searching yt based on it
    const slimTracks = _.map((tracks.items), (track) => truncateSimplifiedTrack(track))
    const slimAlbum = {
      album_type,
      genres,
      id,
      name,
      popularity,
      release_date,
      artists: slimArtists
    }
    return slimAlbum
  }

  function truncateSimplifiedTrack ({artists, disc_number, duration_ms, explicit, id, name, track_number, type}) {
    const slimArtists = _.map(artists, (artist) => truncateSimplifiedArtist(artist))
    const slimTrack = {artists: slimArtists, disc_number, duration_ms, explicit, id, name, track_number, type}
    return slimTrack
  }

  function truncateFullTrack ({album, artists, disc_number, duration_ms, explicit, id, name, popularity, track_number, type}) {
    const slimAlbum = truncateSimplifiedAlbum(album)
    const slimArtists = _.map(artists, (artist) => truncateSimplifiedArtist(artist))
    const slimTrack = {
      album: slimAlbum,
      artists: slimArtists,
      disc_number,
      duration_ms,
      explicit,
      id,
      name,
      popularity,
      track_number,
      type
    }
    return slimTrack
  }

  function truncateTrackAudioFeature ({acousticness, danceability, duration_ms, energy, id, instrumentalness, key, liveness, loudness, mode, speechiness, tempo, time_signature, type, valence}) {
    return {
      acousticness,
      danceability,
      duration_ms,
      energy,
      id,
      instrumentalness,
      key,
      liveness,
      loudness,
      mode,
      speechiness,
      tempo,
      time_signature,
      type,
      valence
    }
  }
}
