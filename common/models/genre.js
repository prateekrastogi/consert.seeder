'use strict'

const genresList = require('../../lib/genres')
const _ = require('lodash')
const { from, concat } = require('rxjs')
const { concatMap } = require('rxjs/operators')

const recommenderUtils = require('../../lib/recommender-utils')

const terminateAllActiveInterferingSubscriptions = require('../../lib/misc-utils').terminateAllActiveInterferingSubscriptions

let activeSubscriptions = []

module.exports = function (genre) {
  genre.seedGenreItemsToRecommender = function () {
    let count = 0

    let genres = []
    _.forIn(Object.assign({}, genresList.genreTree), (value, key) => {
      genres = _.concat(genres, { key, value })
    })

    const genreItemsSyncer = from(genres).pipe(
      concatMap(({ key, value }) => {
        const recommenderItem = convertGenreToRecommenderGenreItem(value)

        return recommenderUtils.writeBufferedItemsToRecommender([{ id: key, recommenderItem }], {})
      })
    )

    const safeGenreItemsSyncer = concat(terminateAllActiveInterferingSubscriptions(activeSubscriptions), genreItemsSyncer)

    const genreSyncerSubscription = safeGenreItemsSyncer
      .subscribe(x => console.log(`Total genre items seeded in this invocation: ${++count}`), err => console.log(err), () => console.log(`All genre items seeded`))

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
