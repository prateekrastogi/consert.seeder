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
    let sample = [{id: '6tOsSffQQIXmK8TqsDck8t', name: 'Chico Buarque'},
      {id: '7rPqFVgJYARiFsLDlN6W6y', name: 'Toquinho'},
      {id: '77ZUbcdoU5KCPHNUl8bgQy', name: 'João Gilberto'},
      {id: '6FNc1pq9apWBGVjGUEd9tK', name: 'Danilo Caymmi'},
      {id: '6fV3ZNUY8BCP45yuCWWDez', name: 'Dori Caymmi'},
      {id: '55ya732YIbmYcA2E9foMJe', name: 'Zimbo Trio'},
      {id: '77vmpZSXPhTHwJiE8xE5KX', name: 'Agostinho'},
      {id: '3uklMDgeG3LyfnlHeDH3M5', name: 'Ale Vanzella'},
      {id: '2nB77EV6Al8aHXfxa6YfrW', name: 'Bossacucanova'},
      {id: '1q66oVc7ZO3bFndFCAuOOd', name: 'Cris Delanno'},
      {id: '6rM2yY0GnVcOHMU5GD3y9E', name: 'Martinho Da Vila'},
      {id: '1YH1UiJmk1kXqtibDstKK7', name: 'Bossa Jazz Trio'},
      {id: '3LokxmaXXZpL7sLZASDzCS', name: 'Carlos Lyra'},
      {id: '1FbL4RGqW5gvZ2kZNGdfpA', name: 'Os Cariocas'},
      {id: '6tOsSffQQIXmK8TqsDck8t', name: 'Chico Buarque'},
      {id: '0VSgciOd32tP2Yna1w4vDr', name: 'Baden Powell'}]

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

      async.eachLimit(recommendedArtists, 3, async (artist) => {
        const spotifyApi = await loginAssist.spotifyLogin()
        const relatedArtists = (await spotifyApi.getArtistRelatedArtists(artist.id)).body.artists

        _.map(relatedArtists, (artist) => {
          const {id, name} = artist

          allRelevantArtists = _.concat(allRelevantArtists, {id, name})
          console.log(`Total Artist Added: ${allRelevantArtists.length}`)
        })
      }, (err) => {
        if (err) {
          console.log('Error in putTopSpotifyArtists.getRelatedArtists () ', err)
        } else {
          // Don't use lodash uniq to get unique here due to very high processing time.
          console.log('Completed Relevant Artists api calls.')
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

    // TODO
    callback(null, isSuccess)
  }
}
