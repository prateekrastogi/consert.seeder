'use strict'

const genresList = require('../../lib/genres')
const _ = require('lodash')
const Rx = require('rxjs-compat')
const recombeeClient = require('../../lib/login-assist').recombeeLogin()
const recombeeRqs = require('recombee-api-client').requests

const terminateAllActiveInterferingSubscriptions = require('../../lib/misc-utils').terminateAllActiveInterferingSubscriptions

let activeSubscriptions = []

module.exports = function (genre) {
  genre.seedGenreItemsToRecombee = function () {
    let genres = []
    _.forIn(Object.assign({}, genresList.genreTree), (value, key) => {
      genres = _.concat(genres, {key, value})
    })

    const genreItemsSyncer = Rx.Observable.from(genres).concatMap(({key, value}) => {
      const genreItem = convertGenreToRecombeeGenreItem(value)

      return Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.SetItemValues(key, genreItem, {'cascadeCreate': true})))
    })

    const safeGenreItemsSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(activeSubscriptions),
      genreItemsSyncer)

    const seedGenreItemsToRecombeeSubscription = safeGenreItemsSyncer
      .subscribe(x => console.log(x), err => console.log(err), () => console.log(`All genre items seeded`))

    activeSubscriptions.push(seedGenreItemsToRecombeeSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  function convertGenreToRecombeeGenreItem (genre) {
    const recombeeGenre = {
      'itemType': 'genre',
      'genres': genre.leaves,
      'childrenItems': genre.children,
      'snippet-thumbnails': genre.thumbnails
    }

    return recombeeGenre
  }
}
