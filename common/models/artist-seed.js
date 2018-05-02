'use strict'

const loginAssist = require('../../lib/login-assist')
const _ = require('lodash')
const async = require('async')
const Rx = require('rxjs')

const RETRY_COUNT = 10
const MAX_CONCURRENCY = 2

module.exports = function (artistSeed) {
  artistSeed.putTopSpotifyArtists = async function () {
    const spotifyApi = await loginAssist.spotifyLogin()
    const {genres} = (await spotifyApi.getAvailableGenreSeeds()).body

    async.waterfall([getRecommendedArtists, getRelatedArtists, saveToDb, getRelatedArtists, saveToDb])

    function getRecommendedArtists (cb) {
      let recommendedArtists
      // Gets the artists recommended for each genre from the genre seed
      async.eachLimit(genres, MAX_CONCURRENCY, async (value) => {
        const resilientGetRecommendationsPromise = Rx.Observable.fromPromise(spotifyApi.getRecommendations({
          seed_genres: [value],
          limit: 100
        })).retry(RETRY_COUNT).toPromise()

        const genreRecommendedTracks = (await resilientGetRecommendationsPromise).body.tracks

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
      async.eachLimit(recommendedArtists, MAX_CONCURRENCY, async (artist) => {
        const spotifyApi = await loginAssist.spotifyLogin()

        const resilientGetArtistRelatedArtistsPromise = Rx.Observable.fromPromise(spotifyApi.getArtistRelatedArtists(artist.id))
          .retry(RETRY_COUNT).toPromise()
        const relatedArtists = (await resilientGetArtistRelatedArtistsPromise).body.artists

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
