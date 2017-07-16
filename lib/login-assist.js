/**
 * Created by rprat on 03-07-2017.
 */
'use strict'

const SpotifyWebApi = require('spotify-web-api-node')
const clientDetails = require('../spotify-client-id-secret').clientDetails

module.exports = {

  spotifyLogin: async function spotifyLogin (selectionIndex = 0) {
    const clientId = clientDetails[selectionIndex].clientId
    const clientSecret = clientDetails[selectionIndex].clientSecret

    console.log(clientId, clientSecret)
    // Create the api object with the credentials
    const spotifyApi = new SpotifyWebApi({
      clientId: clientId,
      clientSecret: clientSecret
    })

    // Retrieve an access token.
    await spotifyApi.clientCredentialsGrant()
      .then(function (data) {
        console.log('The access token expires in ' + data.body['expires_in'])
        // Save the access token so that it's used in future calls
        spotifyApi.setAccessToken(data.body['access_token'])
      }, function (err) {
        console.log('Something went wrong when retrieving an access token')
        throw (err)
      })

    return spotifyApi
  }

}
