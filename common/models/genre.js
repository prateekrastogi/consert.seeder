'use strict'

const genresList = require('../../lib/genres')
const _ = require('lodash')
const Rx = require('rxjs')
const recombeeClient = require('../../lib/login-assist').recombeeLogin()
const recombeeRqs = require('recombee-api-client').requests

const terminateAllActiveInterferingSubscriptions = require('../../lib/misc-utils').terminateAllActiveInterferingSubscriptions

let activeSubscriptions = []

module.exports = function (genre) {
  genre.getGenres = function () {
    let genres = ['All']

    const genreSerialized = serializeGenres(genresList.genres)
    genres = _.concat(genres, _.sortBy(genreSerialized))

    return new Promise((resolve, reject) => resolve(genres))
  }

  genre.seedGenreItemsToRecombee = function () {
    let genres = []
    _.forIn(Object.assign({}, genresList.genres, genresList.spotifyGenres), (value, key) => {
      genres = _.concat(genres, {key, value})
    })

    const genreItemsSyncer = Rx.Observable.from(genres).concatMap(({key, value}) => {
      const genreItem = convertGenreToRecombeeGenre(value)

      return Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.SetItemValues(key, genreItem, {'cascadeCreate': true})))
    })

    const safeGenreItemsSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(activeSubscriptions),
      genreItemsSyncer)

    const seedGenreItemsToRecombeeSubscription = safeGenreItemsSyncer
      .subscribe(x => console.log(x), err => console.log(err), () => console.log(`All genre items seeded`))

    activeSubscriptions.push(seedGenreItemsToRecombeeSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  function convertGenreToRecombeeGenre (genre) {
    const recombeeGenre = {
      'itemType': 'genre',
      'genres': genre
    }

    return recombeeGenre
  }

  function serializeGenres (genres) {
    const serializedGenres = _.map(_.keys(genres), genres => {
      const genre = _.replace(genres, 'And', ' & ')
      return _.replace(genre, 'dash', '-')
    })
    return serializedGenres
  }
}
