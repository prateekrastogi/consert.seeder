'use strict'

const loginAssist = require('../../lib/login-assist')
const _ = require('lodash')
const async = require('async')
const { from, interval } = require('rxjs')
const { concatMap, take, tap, retry } = require('rxjs/operators')

const MAX_CONCURRENCY = 1
const RETRY_COUNT = 10
const REQUEST_INTERVAL = 50
const LOGGING_INTERVAL = 1000 * 60 * 5

module.exports = function (artistSeed) {
  artistSeed.putTopSpotifyArtists = async function () {
    const spotifyApi = await loginAssist.spotifyLogin()
    const { genres } = (await spotifyApi.getAvailableGenreSeeds()).body

    async.waterfall([pullRecommendedArtists,
      pullRelatedArtists, pullRelatedArtists, pullRelatedArtists,
      pullRelatedArtists, pullRelatedArtists, pullRelatedArtists])

    function pullRecommendedArtists (cb) {
      let recommendedArtists
      // Gets the artists recommended for each genre from the genre seed
      async.eachLimit(genres, MAX_CONCURRENCY, async (value) => {
        const resilientGetRecommendationsPromise = from(spotifyApi.getRecommendations({
          seed_genres: [value],
          limit: 100
        })).pipe(retry(RETRY_COUNT)).toPromise()

        const genreRecommendedTracks = (await resilientGetRecommendationsPromise).body.tracks

        const genreRecommendedArtists = _.flatMap(genreRecommendedTracks, (track) => {
          return _.map(track.artists, (artist) => {
            const { id, name } = artist
            return { id, name }
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

          saveToDb(recommendedUniqueArtists)

          artistSeed.find((err, uniqueArtists) => {
            (err) ? console.log('Error in artistSeed.find ', err) : cb(null, uniqueArtists)
          })
        }
      })
    }

    function pullRelatedArtists (recommendedArtists, cb) {
      console.log(`Fetching list of related artists...`)
      async.eachLimit(recommendedArtists, MAX_CONCURRENCY, async (artist) => {
        const spotifyApi = await loginAssist.spotifyLogin()

        const resilientGetArtistRelatedArtistsPromise =
        interval(REQUEST_INTERVAL).pipe(take(1),
          concatMap(i => from(spotifyApi.getArtistRelatedArtists(artist.id))),
          retry(RETRY_COUNT)).toPromise()
        const relatedArtists = (await resilientGetArtistRelatedArtistsPromise).body.artists

        _.map(relatedArtists, (artist) => {
          const { id, name } = artist
          saveToDb([{ id, name }])
        })
      }, (err) => {
        if (err) {
          console.log('Error in putTopSpotifyArtists.getRelatedArtists () ', err)
        } else {
          // Don't use lodash uniq to get unique here due to very high processing time.
          console.log(`Completed fetching related artists.`)

          artistSeed.find((err, relatedUniqueArtists) => {
            (err) ? console.log('Error in artistSeed.find ', err) : cb(null, relatedUniqueArtists)
          })
        }
      })
    }

    function saveToDb (artists) {
      // Performing unique check here by using replaceOrCreate
      async.eachSeries(artists, async (artist) => {
        await artistSeed.replaceOrCreate(artist)
      }, (err) => {
        if (err) {
          console.log('Error in putTopSpotifyArtists.saveToDb ', err)
        }
      })
    }

    interval(LOGGING_INTERVAL).pipe(tap(val => {
      artistSeed.find((err, result) => {
        (err) ? console.log('Error in artistSeed.find ', err) : process.stdout.write(`Total no. of artist seeds written in mongodb so far: ${result.length}\r`)
      })
    })).subscribe()

    return new Promise((resolve, reject) => resolve())
  }
}
