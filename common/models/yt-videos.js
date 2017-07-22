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
      where: {and: [{or: [{isCrawled: false}, {isCrawled: {exists: false}}]}, {'artist.popularity': {'gte': 20}}, {'artist.popularity': {'lt': 100}}]},
      fields: {id: true, artist: true, topTracks: true}
    }

    const artists = await enrichedArtists.find(filter)
    const tracks = _.flatMapDeep(artists, (artist) => {
      const track = _.flatMap(_.compact(artist.topTracks), track => track.track)
      return track
    })

    const truncateTracks = _.map(_.compact(tracks), (track) => {
      return track
    })

    const art = _.compact(_.filter(truncateTracks, (track) => track.popularity > 20 && track.popularity < 40))

    console.log(JSON.stringify(art, null, 1))
    // TODO
    callback(null)
  }
}
