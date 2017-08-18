'use strict'

const loginAssist = require('../../lib/login-assist')
const dbQueries = require('../../lib/reusable-db-queries')
const recombeeRqs = require('recombee-api-client').requests
const Rx = require('rxjs')
const _ = require('lodash')

module.exports = function (Recombee) {
  const recombeeClient = loginAssist.recombeeLogin()
  /**
   * Seeds the past recorded concerts in recombee for recommendations
   * @param {Function(Error)} callback
   */

  Recombee.seedPastShows = async function (lowerBound, upperBound, callback) {
    const artists = await dbQueries.findVideoCrawledArtistsByPopularity(lowerBound, upperBound)

    // TODO
    callback(null)
  }

  /**
   * seeds the artist pseudo-types for recommendation engine
   * @param {Function(Error)} callback
   */

  Recombee.seedArtists = async function (lowerBound, upperBound, callback) {
    const artists = await dbQueries.findVideoCrawledArtistsByPopularity(lowerBound, upperBound)

    callback(null)
  }
}
