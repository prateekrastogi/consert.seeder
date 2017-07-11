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
      .mergeMap(([spotifyApi, artist]) => Rx.Observable.fromPromise(spotifyApi.getArtistAlbums(artist)).pluck('body', 'items'))
      .subscribe(x => console.log(x))

    const combinedApiArtist = Rx.Observable.zip(spotifyApi, artistList)

    //combinedApiArtist.subscribe(x => console.log(x))
    // TODO
    callback(null, isSuccess)
  }
}
