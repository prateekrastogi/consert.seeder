/**
 * Created by rprat on 03-07-2017.
 */
'use strict';

var SpotifyWebApi = require('spotify-web-api-node');

module.exports = {

  spotifyLogin: function spotifyLogin() {
    var clientId = '5084d28ce6924d7b98884323abc76109';
    var clientSecret = 'd1f1a832f28d41c685eda422249da094';

    // Create the api object with the credentials
    var spotifyApi = new SpotifyWebApi({
      clientId: clientId,
      clientSecret: clientSecret,
    });

    // Retrieve an access token.
    var authPromise = spotifyApi.clientCredentialsGrant()
      .then(function(data) {
        console.log('The access token expires in ' + data.body['expires_in']);

        // Save the access token so that it's used in future calls
        spotifyApi.setAccessToken(data.body['access_token']);
      }, function(err) {
        console.log('Something went wrong when retrieving an access token');
      });

    return { authPromise, spotifyApi };
  },

};
