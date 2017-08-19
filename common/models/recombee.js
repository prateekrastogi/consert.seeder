'use strict'

const loginAssist = require('../../lib/login-assist')
const dbQueries = require('../../lib/enrichedArtists-db-queries')
const recombeeQueries = require('../../lib/recombee-queries')
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
    /*
       recombeeClient.send(new recombeeRqs.AddItem('ss2'), (err, result) => {
          console.log(err)
          console.log(result)
        })
    recombeeClient.send(new recombeeRqs.AddItemProperty('random-detail', 'int'), (err, result) => {
      console.log(err)
      console.log(result)
    })

    recombeeClient.send(new recombeeRqs.SetItemValues('ss2', {'das': 70, 'fuck': 'alka'}, {
      'cascadeCreate': true
    }), (err, result) => {
      console.log(err)
      console.log(result)
    })
    recombeeClient.send(new recombeeRqs.GetItemValues('ss0'), (err, result) => {
      console.log(err)
      console.log(result)
    })
*/
    recombeeQueries.resetDatabase()
    callback(null)
  }

  /**
   * sets the itemProperties of recombee database items
   * @param {Function(Error, boolean)} callback
   */

  Recombee.setItemProperties = function (callback) {
    recombeeQueries.setItemProperties().subscribe(x => console.log(x), e => console.error(e))
    callback(null)
  }
}
