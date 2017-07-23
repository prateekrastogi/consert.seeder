'use strict'

const app = require('../../server/server')
const Rx = require('rxjs')
const _ = require('lodash')
const loginAssist = require('../../lib/login-assist')

module.exports = function (ytVideos) {
  const youtube = loginAssist.ytLogin()

  ytVideos.putArtistsLive = async function (callback) {
    const artists = await findArtistsByPopularity(70, 100)
    putArtistsAlbumsLive(artists)
    /* */
    // TODO
    callback(null)
  }

  function putArtistsTopTracksLive (artists) {
    const tracks = _.flatMapDeep(artists, (artist) => {
      const track = _.flatMap(_.compact(artist.topTracks), track => track.track)
      return track
    })
    const truncatedTracks = _.map(_.compact(tracks), ({id, name, popularity}) => {
      return {id, name, popularity}
    })

    const uniqueTruncatedTracks = _.uniqBy(truncatedTracks, 'id')
    console.log(JSON.stringify(uniqueTruncatedTracks, null, 1))
  }

  function putArtistsAlbumsLive (artists) {
    const albums = _.flatMapDeep(artists, artist => artist.albums)
    const truncatedAlbums = _.map(_.compact(albums), ({name, popularity, id}) => {
      return {name, popularity, id}
    })
    const uniqueTruncatedAlbums = _.uniqBy(truncatedAlbums, 'id')
    // const topAlbums = _.filter(uniqueTruncatedAlbums, album => album.popularity >= 26 && album.popularity < 40)
    console.log(JSON.stringify(uniqueTruncatedAlbums, null, 1))
  }

  async function findArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtists = app.models.enrichedArtists
    const filter = {
      where: {and: [{or: [{isCrawled: false}, {isCrawled: {exists: false}}]}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artists: true, topTracks: true, albums: true}
    }
    const artists = await enrichedArtists.find(filter)
    return artists
  }
}
