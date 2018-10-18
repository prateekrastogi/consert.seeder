'use strict'

const genreDataObject = require('../../lib/genreData.json')
const _ = require('lodash')
const { from, concat, iif } = require('rxjs')
const { concatMap } = require('rxjs/operators')

const recommenderUtils = require('../../lib/recommender-utils')

const terminateAllActiveInterferingSubscriptions = require('../../lib/misc-utils').terminateAllActiveInterferingSubscriptions

let activeSubscriptions = []

module.exports = function (genre) {
  genre.syncGenreItemsToRecommender = function () {
    let count = 0

    let genres = []
    _.forIn(Object.assign({}, genreDataObject.genreTree), (value, key) => {
      genres = _.concat(genres, { key, value })
    })

    const syncDoneWarning = from(['Genre items are already synced. If re-sync is necessary, please set genre items for re-sync, hence, creating extra $set events in recommender system'])

    const genreItemsSyncer = from(genres).pipe(
      concatMap(({ key, value }) => {
        const recommenderItem = convertGenreToRecommenderGenreItem(value)

        return recommenderUtils.writeBufferedItemsToRecommender([{ id: key, recommenderItem }], {})
      })
    )

    const safeGenreItemsSyncer = concat(terminateAllActiveInterferingSubscriptions(activeSubscriptions),
      iif(() => genreDataObject.areGenresRecSysSynced, syncDoneWarning, genreItemsSyncer))

    const genreSyncerSubscription = safeGenreItemsSyncer
      .subscribe(x => _.isString(x) ? console.log(x) : console.log(`Total genre items seeded in this invocation: ${++count}`), err => console.log(err), () => console.log(`Finished execution of syncGenreItemsToRecommender function invocation.`))

    activeSubscriptions.push(genreSyncerSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  function convertGenreToRecommenderGenreItem (genre) {
    const recommenderGenre = {
      'itemType': 'genre',
      'genres': genre.leaves,
      'childrenItems': genre.children,
      'snippet-thumbnails': genre.thumbnails
    }

    return recommenderGenre
  }
}
