'use strict'

var loginAssist = require('../../lib/loginAssist')

module.exports = function (artistSeed) {
  /**
   * Put the top N spotify artists of various spotify genre seeds
   * @param {Function(Error, boolean)} callback
   */

  artistSeed.putTopSpotifyArtists = async function (callback) {
    var isSuccess = true
    var {authPromise, spotifyApi} = loginAssist.spotifyLogin()

    await authPromise
    var data = await spotifyApi.getAvailableGenreSeeds()
    console.log(data)

    // TODO
    callback(null, isSuccess)
  }
}
