'use strict'

const app = require('../server/server')

module.exports = {

  findVideoUnCrawledArtistsByPopularity: async function findVideoUnCrawledArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtists = app.models.enrichedArtists
    const filter = {
      where: {and: [{or: [{areArtistVideosCrawled: false}, {areArtistVideosCrawled: {exists: false}}]}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: true, topTracks: false, albums: false}
    }
    const artists = await enrichedArtists.find(filter)
    return artists
  },

  findVideoCrawledArtistsByPopularity: async function findVideoCrawledArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtists = app.models.enrichedArtists
    const filter = {
      where: {and: [{'areArtistVideosCrawled': true}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: true, topTracks: false, albums: false}
    }
    const artists = await enrichedArtists.find(filter)
    return artists
  },

  findRecombeeUnSyncedArtistsByPopularity: async function findRecombeeUnSyncedArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtists = app.models.enrichedArtists
    const filter = {
      where: {and: [{or: [{areArtistRecombeeSynced: false}, {areArtistRecombeeSynced: {exists: false}}]}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: true, topTracks: false, albums: false}
    }
    const artists = await enrichedArtists.find(filter)
    return artists
  }
}
