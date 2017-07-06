'use strict'

const loginAssist = require('../../lib/login-assist')
const _ = require('lodash')
const async = require('async')

module.exports = function (artistSeed) {
  /**
   * Put the top N spotify artists of various spotify genre seeds
   * @param {Function(Error, boolean)} callback
   */

  artistSeed.putTopSpotifyArtists = async function (callback) {
    let isSuccess = true
    const spotifyApi = await loginAssist.spotifyLogin()
    const {genres} = (await spotifyApi.getAvailableGenreSeeds()).body
    let recommendedArtist

    async.eachSeries(genres, async (value) => {
      const genreRecommendedTracks = (await spotifyApi.getRecommendations({
        seed_genres: [value],
        limit: 100
      })).body.tracks

      const genreRecommendedArtists = _.flatMap(genreRecommendedTracks, (track) => {
        return track.artists
      })
      recommendedArtist = _.concat(recommendedArtist, genreRecommendedArtists)
    }, (err) => {
      console.log(recommendedArtist)
    })

    // TODO
    callback(null, isSuccess)
  }
}
