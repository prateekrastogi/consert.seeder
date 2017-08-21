'use strict'

const app = require('../../server/server')
const loginAssist = require('../../lib/login-assist')
const dbQueries = require('../../lib/db-queries')
const recombeeQueries = require('../../lib/recombee-queries')
const recombeeRqs = require('recombee-api-client').requests
const Rx = require('rxjs')
const _ = require('lodash')

const MAX_BATCH = 10000
const WAIT_TILL_NEXT_REQUEST = 10000
let count = 0

module.exports = function (recombee) {
  const recombeeClient = loginAssist.recombeeLogin()
  /**
   * Seeds the past recorded concerts in recombee for recommendations
   * @param {Function(Error)} callback
   */

  recombee.seedPastShows = async function (callback) {
    const ytVideos = app.models.ytVideos
    const videos = Rx.Observable.interval(WAIT_TILL_NEXT_REQUEST).concatMap((i) => {
      return Rx.Observable.fromPromise(dbQueries.findRecombeeUnSyncedYtVideosInBatches(MAX_BATCH, i * MAX_BATCH))
        .concatMap(unsyncedVideos => Rx.Observable.from(unsyncedVideos))
    })

    videos.map(video => {
      const {id} = video
      const recombeeItem = recombeeQueries.convertVideoToRecombeeVideo(video)
      return {recombeeItem, id}
    }).bufferCount(MAX_BATCH).concatMap(bufferedItems => recombeeQueries.writeBufferedItemsToRecommbee(bufferedItems, ytVideos)).subscribe(x => {
      console.log(`Total videoItems added to Recombee: ${count}`)
      count++
    })

    callback(null)
  }

  /**
   * seeds the artist pseudo-types for recommendation engine
   * @param {Function(Error)} callback
   */

  recombee.seedArtists = function (lowerBound, upperBound, callback) {
    const enrichedArtists = app.models.enrichedArtists
    const artists = Rx.Observable.fromPromise(dbQueries.findRecombeeUnSyncedArtistsByPopularity(lowerBound, upperBound))

    artists.concatMap(artists => Rx.Observable.from(artists)).map(value => {
      const {artist, id} = value
      const recombeeItem = recombeeQueries.convertArtistToRecombeeArtist(artist)

      return {recombeeItem, id}
    }).bufferCount(MAX_BATCH).concatMap(bufferedItems => recombeeQueries.writeBufferedItemsToRecommbee(bufferedItems, enrichedArtists)).subscribe()

    callback(null)
  }

  /**
   * sets the itemProperties of recombee database items
   * @param {Function(Error, boolean)} callback
   */

  recombee.setItemProperties = function (callback) {
    recombeeQueries.setItemProperties().subscribe(x => console.log(x), e => console.error(e))
    callback(null)
  }

  /**
   * sets the artists in a popularity for re-sync with recombee item catalog
   * @param {Function(Error)} callback
   */

  recombee.setArtistsForRecombeeReSyncByPopularity = function (lowerBound, upperBound, callback) {
    const enrichedArtists = app.models.enrichedArtists

    const artists = Rx.Observable.fromPromise(dbQueries.findRecombeeSyncedArtistsByPopularity(lowerBound, upperBound))

    recombeeQueries.setModelItemsForReSync(artists, enrichedArtists)
      .subscribe(({artist}) => console.log(`Artist marked for Recombee Re-sync: ${artist.name}`))

    callback(null)
  }

  /**
   *
   * @param {Function(Error)} callback
   */

  recombee.setVideosForRecombeeReSync = function (callback) {
    const ytVideos = app.models.ytVideos

    const syncedVideos = Rx.Observable.interval(WAIT_TILL_NEXT_REQUEST).concatMap((i) => {
      return Rx.Observable.fromPromise(dbQueries.findRecombeeSyncedYtVideosInBatches(MAX_BATCH, i * MAX_BATCH))
        .concatMap(syncedVideos => Rx.Observable.from(syncedVideos))
    }).bufferCount(MAX_BATCH)

    recombeeQueries.setModelItemsForReSync(syncedVideos, ytVideos)
      .subscribe(({snippet}) => console.log(`Video marked for Recombee Re-sync: ${snippet.title}`))

    callback(null)
  }

  /**
   * Remote method for performaing miscelleneous operations in recombee
   * @param {Function(Error)} callback
   */

  recombee.miscOperations = function (callback) {
    recombeeClient.send(new recombeeRqs.ListItems(), (err, result) =>
    {
      console.log(err)
      console.log(result)
    })
    callback(null)
  }
}
