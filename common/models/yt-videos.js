'use strict'

const app = require('../../server/server')
const Rx = require('rxjs')
const _ = require('lodash')
const loginAssist = require('../../lib/login-assist')

module.exports = function (ytVideos) {
  const youtube = loginAssist.ytLogin()

  ytVideos.putArtistsLive = async function (callback) {
    const enrichedArtists = app.models.enrichedArtists

    const filter = {
      where: {and: [{or: [{isCrawled: false}, {isCrawled: {exists: false}}]}, {'artist.popularity': {'gte': 70}}, {'artist.popularity': {'lt': 100}}]},
      fields: {artist: true}
    }

    const artists = await enrichedArtists.find(filter)
    console.log(artists)
    // TODO
    callback(null)
  }
}
