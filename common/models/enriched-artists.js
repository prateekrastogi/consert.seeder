// To do Use uncrawled artist instead of sample artist while preparing for deployment in prod
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

    const spotifyApi = Rx.Observable.interval(333).concatMap((interval) => {
      const selectionIndex = (interval % 3)
      console.log(selectionIndex)
      return Rx.Observable.fromPromise(loginAssist.spotifyLogin(selectionIndex))
    })

    const artistList = Rx.Observable.from(sample.sampleData)

    artistList.concatMap(artist => Rx.Observable.zip(spotifyApi, Rx.Observable.of(artist).pluck('id')))
      .mergeMap(([spotifyApi, artistId]) => {
        const artist = Rx.Observable.fromPromise(spotifyApi.getArtist(artistId)).pluck('body')
          .map((artist) => truncateFullArtist(artist))

        const id = artist.pluck('id')

        const artistTopTracks = Rx.Observable.fromPromise(spotifyApi.getArtistTopTracks(artistId, 'US')).pluck('body', 'tracks')
          .map((topTracks) => _.map(topTracks, (topTrack) => truncateFullTrack(topTrack)))

        const artistRelatedArtists = Rx.Observable.fromPromise(spotifyApi.getArtistRelatedArtists(artistId)).pluck('body', 'artists')
          .map((relatedArtists) => _.map(relatedArtists, (relatedArtist) => truncateFullArtist(relatedArtist)))

        const artistAlbums = Rx.Observable.range(0, 3).concatMap((i) => {
          return Rx.Observable.fromPromise(spotifyApi.getArtistAlbums(artistId, {
            market: 'US',
            limit: 50,
            offset: (i * 50)
          })).pluck('body', 'items')
        })

        const album = artistAlbums.concatMap((albums) => {
          return Rx.Observable.from(albums)
        }).map((album) => truncateSimplifiedAlbum(album))

        const albumTracks = album.pluck('id').concatMap((id) => {
          return Rx.Observable.fromPromise(spotifyApi.getAlbumTracks(id, {limit: 50}))
        }).pluck('body', 'items')

        const albumTracksWithAudioFeatures = albumTracks.concatMap((tracks) => {
          const albumTrack = Rx.Observable.from(tracks).map((track) => truncateSimplifiedTrack(track))

          const trackId = albumTrack.pluck('id')

          const trackAudioFeature = trackId
            .concatMap((id) => {
              return Rx.Observable.fromPromise(spotifyApi.getAudioFeaturesForTrack(id)).pluck('body')
                .map((audioFeatures) => truncateTrackAudioFeature(audioFeatures))
            })

          const albumTrackWithAudioFeature = Rx.Observable.zip(albumTrack, trackAudioFeature, (albumTrack, trackAudioFeature) => {
            return {albumTrack, trackAudioFeature}
          })

          const albumTracksWithAudioFeatures = albumTrackWithAudioFeature.reduce((accum, curr) => _.concat(accum, curr))

          return albumTracksWithAudioFeatures
        })

        const albumWithFeatureAnalyzedTracks = Rx.Observable.zip(album, albumTracksWithAudioFeatures, (album, albumTracksWithAudioFeatures) => {
          return {album, albumTracksWithAudioFeatures}
        })

        const albums = albumWithFeatureAnalyzedTracks.reduce((accum, curr) => _.concat(accum, curr))

        const enrichedArtist = Rx.Observable.zip(id, artist, albums, artistTopTracks, artistRelatedArtists, (id, artist, albums, topTracks, relatedArtists) => {
          return {id, artist, albums, topTracks, relatedArtists}
        })

        return artist
      }, 2)
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
