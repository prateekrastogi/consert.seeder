'use strict';

var loginAssist = require('../../lib/loginAssist');

module.exports = function(artistSeed) {
  /**
   * Put the top N spotify artists of various spotify genre seeds
   * @param {Function(Error, boolean)} callback
   */

  artistSeed.putTopSpotifyArtists = function(callback) {
    var isSuccess = true;
    var {authPromise, spotifyApi} = loginAssist.spotifyLogin();

    authPromise.then(function(data) {
      return spotifyApi.getAvailableGenreSeeds();
    }).then(function(data) {
      console.log(data.body['genres']);
    });
    // TODO
    callback(null, isSuccess);
  };
};
