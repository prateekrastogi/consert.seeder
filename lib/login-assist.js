/**
 * Created by rprat on 03-07-2017.
 */
'use strict'

const SpotifyWebApi = require('spotify-web-api-node')
const Youtube = require('youtube-node-custom')
const predictionio = require('predictionio-driver')

const spotifyClientDetails = require('../client-secrets').spotifyClientDetails
const ytAccessTokens = require('../client-secrets').ytAccessTokens
const ytBroadcastAccessTokens = require('../client-secrets').ytBroadcastAccessTokens

const _ = require('lodash')
const app = require('../server/server')

let spotifyTokenIndex = 0
let spotifyTokens = []
let ytTokenIndex = 0
let ytBroadcastTokenIndex = 0

module.exports = {

  spotifyLogin: async function spotifyLogin () {
    let selectionIndex = (spotifyTokenIndex % 3)
    const clientId = spotifyClientDetails[selectionIndex].clientId
    const clientSecret = spotifyClientDetails[selectionIndex].clientSecret

    // For generating the access token from different application to enhance the rate limits imposed by spotify
    spotifyTokenIndex++

    // Create the api object with the credentials
    const spotifyApi = new SpotifyWebApi({
      clientId: clientId,
      clientSecret: clientSecret
    })

    // If token for the selection index is already acquired and its staleness is less than 30 minutes, return that token
    if (spotifyTokens[selectionIndex] !== undefined) {
      const previousTokenGenerationTime = spotifyTokens[selectionIndex].generationTimestamp
      const elapsedTime = _.now() - previousTokenGenerationTime
      if (elapsedTime < 1000 * 60 * 30) {
        return spotifyTokens[selectionIndex].spotifyApi
      } else { console.log('Generating new token') }
    }

    // Else retrieve an access token.
    await spotifyApi.clientCredentialsGrant()
      .then(function (data) {
        console.log('The access token expires in ' + data.body['expires_in'])
        // Save the access token so that it's used in future calls
        spotifyApi.setAccessToken(data.body['access_token'])
      }, function (err) {
        console.log('Something went wrong when retrieving an access token')
        throw (err)
      })
    spotifyTokens[selectionIndex] = { spotifyApi: spotifyApi, generationTimestamp: _.now() }

    return spotifyApi
  },

  ytLogin: function ytLogin () {
    const youtube = this.ytKeyRotator(ytTokenIndex, ytAccessTokens)
    ytTokenIndex++
    return youtube
  },

  ytBroadcastLogin: function ytBroadcastLogin () {
    const youtube = this.ytKeyRotator(ytBroadcastTokenIndex, ytBroadcastAccessTokens)
    ytBroadcastTokenIndex++
    return youtube
  },

  ytKeyRotator: function ytKeyRotator (tokenIndex, accessTokens) {
    const youtube = new Youtube()
    const key = accessTokens[tokenIndex % accessTokens.length]
    youtube.setKey(key)
    return youtube
  },

  predictionioLogin: function predictionioLogin () {
    return (app.get('env') === 'production') ? new predictionio.Events({ appId: 1, accessKey: 'prod-access-key' }) : new predictionio.Events({ appId: 1, accessKey: 'yiN9Q2_jmOEcouMJ0_eLXtJ1wQvYMkPLrsPKkOrh089yjoALTa5F2R0jL7RPNIvK' })
  }
}
