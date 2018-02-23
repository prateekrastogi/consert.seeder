'use strict'

const loginAssist = require('../../lib/login-assist')
const _ = require('lodash')
const async = require('async')

module.exports = function (artistSeed) {
  /**
   * Put the top N spotify artists of various spotify genre seeds
   * @param {Function(Error, boolean)} callback
   */

  artistSeed.putTopSpotifyArtists = async function () {
    const spotifyApi = await loginAssist.spotifyLogin()
    const {genres} = (await spotifyApi.getAvailableGenreSeeds()).body

    async.waterfall([getRecommendedArtists, getRelatedArtists, saveToDb, getRelatedArtists, saveToDb])

    function getRecommendedArtists (cb) {
      let recommendedArtists
      // Gets the artists recommended for each genre from the genre seed
      async.eachLimit(genres, 10, async (value) => {
        const genreRecommendedTracks = (await spotifyApi.getRecommendations({
          seed_genres: [value],
          limit: 100
        })).body.tracks

        const genreRecommendedArtists = _.flatMap(genreRecommendedTracks, (track) => {
          return _.map(track.artists, (artist) => {
            const {id, name} = artist
            return {id, name}
          })
        })
        recommendedArtists = _.concat(recommendedArtists, genreRecommendedArtists)
      }, (err) => {
        if (err) {
          console.log('Error in putTopSpotifyArtists.getRecommendedArtists () ', err)
          cb(err)
        } else {
          console.log('Completed Recommended Artists api calls. Filtering unique artists among them....')
          const recommendedUniqueArtists = _.uniqWith(_.compact(recommendedArtists), _.isEqual)
          console.log('Finished filtering unique artists')
          cb(null, recommendedUniqueArtists)
        }
      })
    }

    function getRelatedArtists (recommendedArtists, cb) {
      let allRelevantArtists = _.cloneDeep(recommendedArtists)

      console.log(`Fetching list of related artists...`)
      async.eachLimit(recommendedArtists, 3, async (artist) => {
        const spotifyApi = await loginAssist.spotifyLogin()
        const relatedArtists = (await spotifyApi.getArtistRelatedArtists(artist.id)).body.artists

        _.map(relatedArtists, (artist) => {
          const {id, name} = artist

          allRelevantArtists = _.concat(allRelevantArtists, {id, name})
          process.stdout.write(`Total Artist fetched: ${allRelevantArtists.length}\r`)
        })
      }, (err) => {
        if (err) {
          console.log('Error in putTopSpotifyArtists.getRelatedArtists () ', err)
        } else {
          // Don't use lodash uniq to get unique here due to very high processing time.
          console.log(`Completed fetching related artists.`)
          cb(null, _.compact(allRelevantArtists))
        }
      })
    }

    function saveToDb (allRelevantArtists, cb) {
      console.log('Starting mongo replaceOrCreate operations for artists')

      // Performing unique check here by using replaceOrCreate
      async.eachSeries(allRelevantArtists, async (artist) => {
        await artistSeed.replaceOrCreate(artist)
      }, (err) => {
        if (err) {
          console.log('Error in putTopSpotifyArtists.saveToDb ', err)
        } else {
          console.log('Successfully written all the data in mongodb')
          artistSeed.find((err, result) => {
            (err) ? console.log('Error in artistSeed.find ', err) : cb(null, result)
          })
        }
      })
    }

    return new Promise((resolve, reject) => resolve())
  }
}
