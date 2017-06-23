'use strict';

var SpotifyWebApi = require('spotify-web-api-node');


module.exports = function (artistSeed) {

  /**
   * Put the top N spotify artists of various spotify genre seeds
   * @param {Function(Error, boolean)} callback
   */

  artistSeed.putTopSpotifyArtists = function (callback) {

    var isSuccess = true;
    var clientId = '5084d28ce6924d7b98884323abc76109',
      clientSecret = 'd1f1a832f28d41c685eda422249da094';

// Create the api object with the credentials
    var spotifyApi = new SpotifyWebApi({
      clientId: clientId,
      clientSecret: clientSecret
    });

// Retrieve an access token.
    var callkey = spotifyApi.clientCredentialsGrant()
      .then(function (data) {
        console.log('The access token expires in ' + data.body['expires_in']);
        console.log('The access token is ' + data.body['access_token']);
        // Save the access token so that it's used in future calls
        spotifyApi.setAccessToken(data.body['access_token']);
      }, function (err) {
        console.log('Something went wrong when retrieving an access token', err);
      });

    callkey.then(function (data) {
      console.log(spotifyApi.getAccessToken());
    });

    // TODO
    callback(null, isSuccess);
  };

};
