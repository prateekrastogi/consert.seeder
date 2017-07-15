'use strict'

const Rx = require('rxjs')
const _ = require('lodash')
const loginAssist = require('../../lib/login-assist')
const app = require('../../server/server')
const sample = require('../test/sample-data')

module.exports = function (enrichedArtists) {
  enrichedArtists.putEnrichedArtists = function (callback) {
    let isSuccess
    const artistSeed = app.models.artistSeed

    const spotifyApi = Rx.Observable.fromPromise(loginAssist.spotifyLogin())
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

        return enrichedArtist
      }, 2)
      .subscribe(async (x) => {
        console.log(x)
        await enrichedArtists.create(x)
        console.log(`Successfully added/replaced the artist ${x.artist.name}`)
      })

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
