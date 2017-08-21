'use strict'

const app = require('../server/server')
const _ = require('lodash')

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
      where: {and: [{or: [{isArtistRecombeeSynced: false}, {isArtistRecombeeSynced: {exists: false}}]}, {areArtistVideosCrawled: true}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: true, topTracks: false, albums: false}
    }
    const artists = await enrichedArtists.find(filter)
    return artists
  },

  findRecombeeSyncedArtistsByPopularity: async function findRecombeeSyncedArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtists = app.models.enrichedArtists
    const filter = {
      where: {and: [{'isArtistRecombeeSynced': true}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: true, topTracks: false, albums: false}
    }
    const artists = await enrichedArtists.find(filter)
    return artists
  },

  findRecombeeUnSyncedYtVideosInBatches: async function findRecombeeUnSyncedVideosInBatches (maxResults, offset) {
    const ytVideos = app.models.ytVideos
    const filter = {
      where: {and: [{or: [{isVideoRecombeeSynced: false}, {isVideoRecombeeSynced: {exists: false}}]}]},
      limit: maxResults,
      skip: offset
    }
    const videos = await ytVideos.find(filter)

    const artists = _.uniq(_.flatMap(videos, (video) => video.artists))
    const artistsFilter = _.map(artists, (id) => {
      return {id: id}
    })

    const enrichedArtists = app.models.enrichedArtists
    const artistFilter = {
      where: {or: artistsFilter},
      fields: {id: true, artist: true, topTracks: false, albums: false}
    }

    const detailedArtists = await enrichedArtists.find(artistFilter)

    const videoWithArtistsExtractedAndProcessed = _.map(videos, video => {
      const videoArtistsInDetail = _.map(video.artists, (artistId) => _.find(detailedArtists, ['id', artistId]))

      video.ArtistsIds = _.uniq(_.flatMapDeep(videoArtistsInDetail, (artist) => artist.artist.id))
      video.ArtistsGenres = _.uniq(_.flatMapDeep(videoArtistsInDetail, artist => artist.artist.genres))
      video.ArtistsNames = _.uniq(_.flatMapDeep(videoArtistsInDetail, artist => artist.artist.name))
      video.ArtistsPopularity = _.uniq(_.flatMapDeep(videoArtistsInDetail, artist => artist.artist.popularity))
      video.ArtistsFollowers = _.uniq(_.flatMapDeep(videoArtistsInDetail, artist => artist.artist.followers.total))
      video.ArtistsType = _.uniq(_.flatMap(videoArtistsInDetail, artist => artist.artist.type))

      return video
    })
    return videoWithArtistsExtractedAndProcessed
  },

  findRecombeeSyncedYtVideosInBatches: async function findRecombeeSyncedYtVideosInBatches (maxResults, offset) {
    const ytVideos = app.models.ytVideos
    const filter = {
      where: {isVideoRecombeeSynced: true},
      limit: maxResults,
      skip: offset
    }
    const videos = await ytVideos.find(filter)

    return videos
  }
}
