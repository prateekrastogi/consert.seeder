'use strict'

const app = require('../../server/server')
const recombeeClient = require('../../lib/login-assist').recombeeLogin()
const recombeeRqs = require('recombee-api-client').requests
const Rx = require('rxjs')
const _ = require('lodash')

const MAX_BATCH = 1
const WAIT_TILL_NEXT_REQUEST = 10000
let count = 0

module.exports = function (recombee) {
  /**
   * Seeds the past recorded concerts in recombee for recommendations
   * @param {Function(Error)} callback
   */

  recombee.seedPastShows = async function (callback) {
    const ytVideos = app.models.ytVideos
    const videos = Rx.Observable.interval(WAIT_TILL_NEXT_REQUEST).concatMap((i) => {
      return Rx.Observable.fromPromise(findRecombeeUnSyncedYtVideosInBatches(MAX_BATCH, i * MAX_BATCH))
        .concatMap(unsyncedVideos => Rx.Observable.from(unsyncedVideos))
    })

    videos.map(video => {
      const {id} = video
      const recombeeItem = convertVideoToRecombeeVideo(video)
      return {recombeeItem, id}
    }).bufferCount(MAX_BATCH).concatMap(bufferedItems => writeBufferedItemsToRecommbee(bufferedItems, ytVideos)).subscribe(x => {
      console.log(`Total videoItems added to Recombee: ${count}`)
      count++
    })

    callback(null)
  }

  /**
   * seeds the artist pseudo-types for recommendation engine
   * @param {Function(Error)} callback
   */

  recombee.seedArtists = function (lowerBound, upperBound, callback) {
    const enrichedArtists = app.models.enrichedArtists
    const artists = Rx.Observable.fromPromise(findRecombeeUnSyncedArtistsByPopularity(lowerBound, upperBound))

    artists.concatMap(artists => Rx.Observable.from(artists)).map(value => {
      const {artist, id, relatedArtists} = value
      const recombeeItem = convertArtistToRecombeeArtist(artist, relatedArtists)

      return {recombeeItem, id}
    }).bufferCount(MAX_BATCH).concatMap(bufferedItems => writeBufferedItemsToRecommbee(bufferedItems, enrichedArtists)).subscribe()

    callback(null)
  }

  /**
   * sets the itemProperties of recombee database items
   * @param {Function(Error, boolean)} callback
   */

  recombee.setItemProperties = function (callback) {
    setItemProperties().subscribe(x => console.log(x), e => console.error(e))
    callback(null)
  }

  /**
   * sets the artists in a popularity for re-sync with recombee item catalog
   * @param {Function(Error)} callback
   */

  recombee.setArtistsForRecombeeReSyncByPopularity = function (lowerBound, upperBound, callback) {
    const enrichedArtists = app.models.enrichedArtists

    const artists = Rx.Observable.fromPromise(findRecombeeSyncedArtistsByPopularity(lowerBound, upperBound))

    setModelItemsForReSync(artists, enrichedArtists)
      .subscribe(({artist}) => console.log(`Artist marked for Recombee Re-sync: ${artist.name}`))

    callback(null)
  }

  /**
   *
   * @param {Function(Error)} callback
   */

  recombee.setVideosForRecombeeReSync = function (callback) {
    const ytVideos = app.models.ytVideos

    const syncedVideos = Rx.Observable.interval(WAIT_TILL_NEXT_REQUEST).concatMap((i) => {
      return Rx.Observable.fromPromise(findRecombeeSyncedYtVideosInBatches(MAX_BATCH, i * MAX_BATCH))
        .concatMap(syncedVideos => Rx.Observable.from(syncedVideos))
    }).bufferCount(MAX_BATCH)

    setModelItemsForReSync(syncedVideos, ytVideos)
      .subscribe(({snippet}) => console.log(`Video marked for Recombee Re-sync: ${snippet.title}`))

    callback(null)
  }

  /**
   * Remote method for performing miscellaneous operations in recombee
   * @param {Function(Error)} callback
   */

  recombee.miscOperations = function (callback) {
    const clientSendAsObservable = Rx.Observable.bindNodeCallback(recombeeClient.send.bind(recombeeClient))
    const result = clientSendAsObservable(new recombeeRqs.ListItems({
      'filter': `"video"  in 'itemType'`,
      'returnProperties': false
    }))
    result.subscribe(x => console.log(x), e => console.error(e))

    callback(null)
  }

  async function findRecombeeUnSyncedArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtists = app.models.enrichedArtists
    const filter = {
      where: {and: [{or: [{isArtistRecombeeSynced: false}, {isArtistRecombeeSynced: {exists: false}}]}, {areArtistVideosCrawled: true}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: true, topTracks: false, albums: false, relatedArtists: true}
    }
    const artists = await enrichedArtists.find(filter)

    const artistWithRelatedArtists = _.map(artists, (artist) => {
      const {relatedArtists} = artist
      artist.relatedArtists = _.map(relatedArtists, 'id')
      return artist
    })
    return artistWithRelatedArtists
  }

  async function findRecombeeSyncedArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtists = app.models.enrichedArtists
    const filter = {
      where: {and: [{'isArtistRecombeeSynced': true}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: true, topTracks: false, albums: false}
    }
    const artists = await enrichedArtists.find(filter)
    return artists
  }

  async function findRecombeeUnSyncedYtVideosInBatches (maxResults, offset) {
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
      fields: {id: true, artist: true, topTracks: false, albums: false, relatedArtists: true}
    }

    const detailedArtists = await enrichedArtists.find(artistFilter)

    const artistWithRelatedArtists = _.map(detailedArtists, (artist) => {
      const {relatedArtists} = artist
      artist.relatedArtists = _.map(relatedArtists, 'id')
      return artist
    })

    const videoWithArtistsExtractedAndProcessed = _.map(videos, video => {
      const videoArtistsInDetail = _.map(video.artists, (artistId) => _.find(artistWithRelatedArtists, ['id', artistId]))

      video.ArtistsIds = _.uniq(_.flatMapDeep(videoArtistsInDetail, (artist) => artist.artist.id))
      video.ArtistsGenres = _.uniq(_.flatMapDeep(videoArtistsInDetail, artist => artist.artist.genres))
      video.ArtistsNames = _.uniq(_.flatMapDeep(videoArtistsInDetail, artist => artist.artist.name))
      video.ArtistsPopularity = _.uniq(_.flatMapDeep(videoArtistsInDetail, artist => artist.artist.popularity))
      video.ArtistsFollowers = _.uniq(_.flatMapDeep(videoArtistsInDetail, artist => artist.artist.followers.total))
      video.ArtistsType = _.uniq(_.flatMap(videoArtistsInDetail, artist => artist.artist.type))
      video.relatedArtists = _.uniq(_.flatMapDeep(videoArtistsInDetail, artist => artist.relatedArtists))
      return video
    })
    return videoWithArtistsExtractedAndProcessed
  }

  async function findRecombeeSyncedYtVideosInBatches (maxResults, offset) {
    const ytVideos = app.models.ytVideos
    const filter = {
      where: {isVideoRecombeeSynced: true},
      limit: maxResults,
      skip: offset
    }
    const videos = await ytVideos.find(filter)

    return videos
  }

  function resetDatabase () {
    recombeeClient.send(new recombeeRqs.ResetDatabase(), (err, result) => err ? console.log('Some error occurred while resetting db') : console.log('Database reset successful'))
  }

  function setItemProperties () {
    const itemType = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('itemType', 'string')))
    const kind = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('kind', 'string')))
    const etag = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('etag', 'string')))
    const contentDetailsDuration = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-duration', 'string')))
    const contentDetailsDimension = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-dimension', 'string')))
    const contentDetailsDefinition = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-definition', 'string')))
    const contentDetailsCaption = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-caption', 'string')))
    const contentDetailsLicensedContent = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-licensedContent', 'boolean')))
    const contentDetailsProjection = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-projection', 'string')))
    const statisticsViewCount = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('statistics-viewCount', 'string')))
    const statisticsLikeCount = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('statistics-likeCount', 'string')))
    const statisticsDisLikeCount = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('statistics-dislikeCount', 'string')))
    const statisticsFavoriteCount = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('statistics-favoriteCount', 'string')))
    const statisticsCommentCount = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('statistics-commentCount', 'string')))
    const snippetPublishedAt = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-publishedAt', 'timestamp')))
    const snippetChannelId = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-channelId', 'string')))
    const snippetTitle = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-title', 'string')))
    const snippetDescription = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-description', 'string')))
    const snippetChannelTitle = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-channelTitle', 'string')))
    const snippetThumbnails = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-thumbnails', 'string')))
    const snippetliveBroadcastContent = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-liveBroadcastContent', 'string')))
    const artistsIds = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-ids', 'set')))
    const artistsGenres = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('genres', 'set')))
    const artistsNames = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-names', 'set')))
    const artistsPopularity = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-popularity', 'set')))
    const artistsFollowers = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-followers', 'set')))
    const artistsRelatedArtists = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-relatedArtists', 'set')))
    const artistsType = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-type', 'set')))

    const result = Rx.Observable.concat(itemType, kind, etag, contentDetailsDuration, contentDetailsDimension, contentDetailsDefinition, contentDetailsLicensedContent, contentDetailsCaption, contentDetailsProjection,
      statisticsViewCount, statisticsLikeCount, statisticsDisLikeCount, statisticsFavoriteCount, statisticsCommentCount, snippetPublishedAt, snippetChannelId,
      snippetTitle, snippetDescription, snippetChannelTitle, snippetThumbnails, snippetliveBroadcastContent, artistsIds, artistsGenres, artistsNames,
      artistsPopularity, artistsFollowers, artistsRelatedArtists, artistsType)

    return result
  }

  function convertArtistToRecombeeArtist (artist, relatedArtists) {
    const recombeeArtist = {
      'itemType': 'artist',
      'artists-ids': [artist.id],
      'genres': artist.genres,
      'artists-names': [artist.name],
      'artists-popularity': [`${artist.popularity}`],     // https://github.com/Recombee/node-api-client/issues/3
      'artists-followers': [`${artist.followers.total}`],
      'artists-relatedArtists': relatedArtists,
      'artists-type': [artist.type]
    }
    return recombeeArtist
  }

  function convertVideoToRecombeeVideo (video) {
    const recombeeVideo = {
      'itemType': 'video',
      'kind': video.kind,
      'etag': video.etag,
      'contentDetails-duration': video.contentDetails.duration,
      'contentDetails-dimension': video.contentDetails.dimension,
      'contentDetails-definition': video.contentDetails.definition,
      'contentDetails-caption': video.contentDetails.caption,
      'contentDetails-licensedContent': video.contentDetails.licensedContent,
      'contentDetails-projection': video.contentDetails.projection,
      'statistics-viewCount': video.statistics.viewCount,
      'statistics-likeCount': video.statistics.likeCount,
      'statistics-dislikeCount': video.statistics.dislikeCount,
      'statistics-favoriteCount': video.statistics.favoriteCount,
      'statistics-commentCount': video.statistics.commentCount,
      'snippet-publishedAt': video.snippet.publishedAt,
      'snippet-channelId': video.snippet.channelId,
      'snippet-title': video.snippet.title,
      'snippet-description': video.snippet.description,
      'snippet-channelTitle': video.snippet.channelTitle,
      'snippet-thumbnails': video.snippet.thumbnails,
      'snippet-liveBroadcastContent': video.snippet.liveBroadcastContent,
      'artists-ids': video.ArtistsIds,
      'genres': video.ArtistsGenres,
      'artists-names': video.ArtistsNames,
      'artists-popularity': _.map(video.ArtistsPopularity, popularity => `${popularity}`),  // https://github.com/Recombee/node-api-client/issues/3
      'artists-followers': _.map(video.ArtistsFollowers, followers => `${followers}`),
      'artists-relatedArtists': video.relatedArtists,
      'artists-type': video.ArtistsType
    }

    return recombeeVideo
  }

  function writeBufferedItemsToRecommbee (bufferedItems, model) {
    const rqs = _.map(bufferedItems, ({recombeeItem, id}) => new recombeeRqs.SetItemValues(id, recombeeItem, {'cascadeCreate': true}))
    const itemPropertyAddBatchRequest = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.Batch(rqs)))

    const ids = _.map(bufferedItems, ({id}) => id)

    const dbUpdateBatchRequest = Rx.Observable.from(ids).concatMap(id => {
      const dbUpdateRequest = Rx.Observable.fromPromise(model.findById(id)).map(item => {
        switch (model.modelName) {
          case 'enrichedArtists':
            item.isArtistRecombeeSynced = true
            break
          case 'ytVideos':
            item.isVideoRecombeeSynced = true
            break
        }
        return item
      }).concatMap(item => Rx.Observable.fromPromise(model.replaceOrCreate(item))).map((item) => {
        switch (model.modelName) {
          case 'enrichedArtists':
            const {artist} = item
            console.log(`Adding in Recombee, artistItem: ${artist.name}`)
            break
          case 'ytVideos':
            const {snippet} = item
            console.log(`Adding in Recombee, videoItem: ${snippet.title}`)
            break
        }
      })
      return dbUpdateRequest
    })

    const result = Rx.Observable.concat(itemPropertyAddBatchRequest, dbUpdateBatchRequest)
    return result
  }

  function setModelItemsForReSync (itemsObservable, model) {
    return itemsObservable.concatMap(items => Rx.Observable.from(items)).concatMap(({id}) => Rx.Observable.fromPromise(model.findById(id)))
      .map((item) => {
        switch (model.modelName) {
          case 'enrichedArtists':
            item.isArtistRecombeeSynced = false
            break
          case 'ytVideos':
            item.isVideoRecombeeSynced = false
            break
        }
        return item
      }).concatMap(item => Rx.Observable.fromPromise(model.replaceOrCreate(item)))
  }
}
