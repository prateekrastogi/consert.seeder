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
    const truncatedTracks = _.map(_.compact(tracks), ({name, popularity}) => {
      return {name, popularity}
    })

    const albums = _.flatMapDeep(artists, (artist) => artist.albums)
    const truncatedAlbums = _.map(_.compact(albums), ({name, popularity}) => {
      return {name, popularity}
    })

    const art = _.compact(_.filter(truncatedAlbums, (track) => track.popularity > 70 && track.popularity < 100))

    console.log(JSON.stringify(art, null, 1))
    // TODO
    callback(null)
  }
}
