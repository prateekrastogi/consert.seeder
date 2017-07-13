'use strict'

const Rx = require('rxjs')
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
      .concatMap(([spotifyApi, artistId]) => {
        const artist = Rx.Observable.fromPromise(spotifyApi.getArtist(artistId)).pluck('body')

        const artistTopTracks = Rx.Observable.fromPromise(spotifyApi.getArtistTopTracks(artistId, 'US')).pluck('body', 'tracks')

        const artistRelatedArtists = Rx.Observable.fromPromise(spotifyApi.getArtistRelatedArtists(artistId)).pluck('body', 'artists')

        const artistAlbums = Rx.Observable.range(0, 3).mergeMap((i) => {
          return Rx.Observable.fromPromise(spotifyApi.getArtistAlbums(artistId, {
            market: 'US',
            limit: 50,
            offset: (i * 50),
          })).pluck('body', 'items')
        }, 3)

        const album = artistAlbums.concatMap((albums) => {
          return Rx.Observable.from(albums)
        })

        const albumTracks = album.pluck('id').concatMap((id) => {
          return Rx.Observable.fromPromise(spotifyApi.getAlbumTracks(id, {limit: 50}))
        }).pluck('body', 'items')

        const albumTrack = albumTracks.concatMap((tracks) => {
          return Rx.Observable.from(tracks)
        })

        const timeDelayedAlbumTrackId = Rx.Observable.zip(albumTrack.pluck('id'), Rx.Observable.interval(350), (id, interval) => {
          return id
        })

        const trackAudioFeature = timeDelayedAlbumTrackId
          .concatMap((id) => {
            return Rx.Observable.fromPromise(spotifyApi.getAudioFeaturesForTrack(id)).pluck('body')
          })

        const albumTrackWithAudioFeature = Rx.Observable.zip(albumTrack, trackAudioFeature, (albumTrack, trackAudioAnalysis) => {
          return {albumTrack, trackAudioAnalysis}
        })

        const albumWithFeatureAnalyzedTracks = Rx.Observable.zip(album, albumTrackWithAudioFeature.toArray(), (album, albumTracksWithAudioFeature) => {
          return {album, albumTracksWithAudioFeature}
        })

        return Rx.Observable.merge(album)
      })
      .subscribe(x => console.log(x))

//    const combinedApiArtist = Rx.Observable.zip(spotifyApi, artistList)

    // combinedApiArtist.subscribe(x => console.log(x))
    // TODO
    callback(null, isSuccess)
  }
}
