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

    artistList.mergeMap(artist => Rx.Observable.zip(spotifyApi, Rx.Observable.of(artist).pluck('id')))
      .mergeMap(([spotifyApi, artistId]) => {
        const artist = Rx.Observable.fromPromise(spotifyApi.getArtist(artistId)).pluck('body')

        const artistTopTracks = Rx.Observable.fromPromise(spotifyApi.getArtistTopTracks(artistId, 'US')).pluck('body', 'tracks')

        const artistRelatedArtist = Rx.Observable.fromPromise(spotifyApi.getArtistRelatedArtists(artistId)).pluck('body', 'artists')

        const artistAlbums = Rx.Observable.fromPromise(spotifyApi.getArtistAlbums(artistId, {limit: 50})).pluck('body', 'items')

        return Rx.Observable.merge(artistAlbums)
      })
      .subscribe(x => console.log(x))

    const combinedApiArtist = Rx.Observable.zip(spotifyApi, artistList)

    // combinedApiArtist.subscribe(x => console.log(x))
    // TODO
    callback(null, isSuccess)
  }
}
