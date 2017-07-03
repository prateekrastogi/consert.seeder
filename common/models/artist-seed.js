'use strict'

const loginAssist = require('../../lib/loginAssist')

module.exports = function (artistSeed) {
  /**
   * Put the top N spotify artists of various spotify genre seeds
   * @param {Function(Error, boolean)} callback
   */

  artistSeed.putTopSpotifyArtists = async function (callback) {
    let isSuccess = true
    const spotifyApi = await loginAssist.spotifyLogin()
    let data = await spotifyApi.getAvailableGenreSeeds()
    console.log(data)

    // TODO
    callback(null, isSuccess)
  }
}
