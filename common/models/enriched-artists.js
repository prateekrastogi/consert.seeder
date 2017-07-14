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

        const artistTopTracks = Rx.Observable.fromPromise(spotifyApi.getArtistTopTracks(artistId, 'US')).pluck('body', 'tracks')

        const artistRelatedArtists = Rx.Observable.fromPromise(spotifyApi.getArtistRelatedArtists(artistId)).pluck('body', 'artists')

        const artistAlbums = Rx.Observable.range(0, 3).concatMap((i) => {
          return Rx.Observable.fromPromise(spotifyApi.getArtistAlbums(artistId, {
            market: 'US',
            limit: 50,
            offset: (i * 50)
          })).pluck('body', 'items')
        })

        const album = artistAlbums.concatMap((albums) => {
          return Rx.Observable.from(albums)
        })

        const albumTracks = album.pluck('id').concatMap((id) => {
          return Rx.Observable.fromPromise(spotifyApi.getAlbumTracks(id, {limit: 50}))
        }).pluck('body', 'items')

        const albumTracksWithAudioFeatures = albumTracks.concatMap((tracks) => {
          const albumTrack = Rx.Observable.from(tracks)

          const trackId = albumTrack.pluck('id')

          const trackAudioFeature = trackId
            .concatMap((id) => {
              return Rx.Observable.fromPromise(spotifyApi.getAudioFeaturesForTrack(id)).pluck('body')
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

        const enrichedArtist = Rx.Observable.zip(artist, albums, artistTopTracks, artistRelatedArtists, (artist, albums, topTracks, relatedArtists) => {
          return {artist, albums, topTracks, relatedArtists}
        })

        return enrichedArtist
      }, 2)
      .subscribe(x => console.log(x.artist.name))

//    const combinedApiArtist = Rx.Observable.zip(spotifyApi, artistList)

    // combinedApiArtist.subscribe(x => console.log(x))
    // TODO
    callback(null, isSuccess)
  }
}
