'use strict'

const app = require('../../server/server')
const Rx = require('rxjs')
const _ = require('lodash')
const loginAssist = require('../../lib/login-assist')

module.exports = function (ytVideos) {
  const enrichedArtists = app.models.enrichedArtists
  const youtube = loginAssist.ytLogin()

  ytVideos.putArtistsLive = function (callback) {
    // TODO
    callback(null)
  }
}
