'use strict'

const app = require('../../server/server')
const recombeeClient = require('../../lib/login-assist').recombeeLogin()
const recombeeRqs = require('recombee-api-client').requests
const Rx = require('rxjs')
const _ = require('lodash')
const recombeeUtils = require('../../lib/recombee-utils')

const getAllDbItemsObservable = require('../../lib/misc-utils').getAllDbItemsObservable
const terminateAllActiveInterferingSubscriptions = require('../../lib/misc-utils').terminateAllActiveInterferingSubscriptions
const recursiveDeferredObservable = require('../../lib/misc-utils').recursiveDeferredObservable
const recursiveTimeOutDeferredObservable = require('../../lib/misc-utils').recursiveTimeOutDeferredObservable

const MAX_BATCH = 5000
const WAIT_TILL_NEXT_REQUEST = 10000

let artistRelatedActiveSubscriptions = []
let videoRelatedActiveSubscriptions = []

module.exports = function (recombee) {
  /**
   * Synchronizes the past recorded concerts with recombee for recommendations
   */

  recombee.syncPastShows = function () {
    const ytVideo = app.models.ytVideo

    const videos = getAllDbItemsObservable(findRecombeeUnSyncedYtVideosInBatches, WAIT_TILL_NEXT_REQUEST, MAX_BATCH)
      .concatMap(items => Rx.Observable.from(items))

    const recombeeSyncer = videos.map(video => {
      const {id} = video
      const recombeeItem = recombeeUtils.convertVideoToRecombeeVideo(video)
      return {recombeeItem, id}
    }).bufferCount(MAX_BATCH).concatMap(bufferedItems => recombeeUtils.writeBufferedItemsToRecommbee(bufferedItems, ytVideo))

    const safeRecursiveSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(videoRelatedActiveSubscriptions), recursiveDeferredObservable(recombeeSyncer))

    const recombeeVideoSyncerSubscription = safeRecursiveSyncer.subscribe({
      error: err => console.log(err)
    })

    videoRelatedActiveSubscriptions.push(recombeeVideoSyncerSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  /**
   * Synchronizes the artist, whose yt videos
   *  has already been fetched, pseudo-types with the recommendation engine
   * @param {Function(Error)} callback
   */

  recombee.syncArtists = function (lowerBound, upperBound) {
    const enrichedArtist = app.models.enrichedArtist
    const artists = Rx.Observable.fromPromise(findRecombeeUnSyncedArtistsByPopularity(lowerBound, upperBound))

    const artistSyncer = artists.concatMap(artists => Rx.Observable.from(artists)).map(value => {
      const {artist, id, relatedArtists} = value
      const recombeeItem = recombeeUtils.convertArtistToRecombeeArtist(artist, relatedArtists)

      return {recombeeItem, id}
    }).bufferCount(MAX_BATCH)
      .concatMap(bufferedItems => recombeeUtils.writeBufferedItemsToRecommbee(bufferedItems, enrichedArtist))

    const safeArtistSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(artistRelatedActiveSubscriptions), recursiveTimeOutDeferredObservable(artistSyncer, 4 * WAIT_TILL_NEXT_REQUEST))

    const artistSyncerSubscription = safeArtistSyncer.subscribe({
      error: err => console.log(err)
    })

    artistRelatedActiveSubscriptions.push(artistSyncerSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  recombee.syncBroadcasts = function () {}

  /**
   * sets the itemProperties of recombee database items
   * @param {Function(Error, boolean)} callback
   */

  recombee.setItemProperties = function () {
    setItemProperties().subscribe(x => console.log(x), e => console.error(e))
    return new Promise((resolve, reject) => resolve())
  }

  /**
   * sets the userProperties of recombee user type
   * @param {Function(Error)} callback
   */

  recombee.setUserProperties = function () {
    setUserProperties().subscribe(x => console.log(x), e => console.error(e))
    return new Promise((resolve, reject) => resolve())
  }

  /**
   * sets the artists in a popularity for re-sync with recombee item catalog
   * @param {Function(Error)} callback
   */

  recombee.setArtistsByPopularityForRecombeeReSync = function (lowerBound, upperBound) {
    const enrichedArtist = app.models.enrichedArtist

    const artists = Rx.Observable.fromPromise(findRecombeeSyncedArtistsByPopularity(lowerBound, upperBound))

    const safeArtistReSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(artistRelatedActiveSubscriptions), setModelItemsForReSync(artists, enrichedArtist))

    const artistReSyncerSubscription = safeArtistReSyncer
      .subscribe(({artist}) => console.log(`Artist marked for Recombee Re-sync: ${artist.name}`), err => console.log(err))

    artistRelatedActiveSubscriptions.push(artistReSyncerSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  /**
   *
   * @param {Function(Error)} callback
   */

  recombee.setVideosForRecombeeReSync = function () {
    const ytVideo = app.models.ytVideo

    const syncedVideos = getAllDbItemsObservable(findRecombeeSyncedYtVideosInBatches, WAIT_TILL_NEXT_REQUEST, MAX_BATCH)

    const safeRecursiveReSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(videoRelatedActiveSubscriptions), recursiveTimeOutDeferredObservable(setModelItemsForReSync(syncedVideos, ytVideo), 4 * WAIT_TILL_NEXT_REQUEST))

    const recombeeVideoReSyncerSubscription = safeRecursiveReSyncer
      .subscribe(({snippet}) => console.log(`Video marked for Recombee Re-sync: ${snippet.title}`), err => console.log(err))

    videoRelatedActiveSubscriptions.push(recombeeVideoReSyncerSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  recombee.setBroadcastsForRecombeeReSync = function () {}

  /**
   * Remote method for performing miscellaneous operations in recombee
   * @param {Function(Error)} callback
   */

  recombee.miscOperations = function () {
    const clientSendAsObservable = Rx.Observable.bindNodeCallback(recombeeClient.send.bind(recombeeClient))
    const result = clientSendAsObservable(new recombeeRqs.ListUserDetailViews('596806b770753032e85e1b6d'))
    result.subscribe(x => console.log(x), e => console.error(e))

    return new Promise((resolve, reject) => resolve())
  }

  async function findRecombeeUnSyncedArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtist = app.models.enrichedArtist
    const filter = {
      where: {and: [{or: [{isArtistRecombeeSynced: false}, {isArtistRecombeeSynced: {exists: false}}]}, {areArtistVideosCrawled: true}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: true, topTracks: false, albums: false, relatedArtists: true}
    }
    const artists = await enrichedArtist.find(filter)

    const artistWithRelatedArtists = _.map(artists, (artist) => {
      const {relatedArtists} = artist
      artist.relatedArtists = _.map(relatedArtists, 'id')
      return artist
    })
    return artistWithRelatedArtists
  }

  async function findRecombeeSyncedArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtist = app.models.enrichedArtist
    const filter = {
      where: {and: [{'isArtistRecombeeSynced': true}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: true, topTracks: false, albums: false}
    }
    const artists = await enrichedArtist.find(filter)
    return artists
  }

  async function findRecombeeUnSyncedYtVideosInBatches (maxResults, offset) {
    const ytVideo = app.models.ytVideo
    const filter = {
      where: {
        and: [
          {or: [{isVideoRecombeeSynced: false}, {isVideoRecombeeSynced: {exists: false}}]},
          {or: [{isVideoRemoved: false}, {isVideoRemoved: {exists: false}}]}
        ]},
      limit: maxResults,
      skip: offset
    }
    const videos = await ytVideo.find(filter)

    const artists = _.uniq(_.flatMap(videos, (video) => video.artists))
    const artistsFilter = _.map(artists, (id) => {
      return {id: id}
    })

    const enrichedArtist = app.models.enrichedArtist
    const artistFilter = {
      where: {or: artistsFilter},
      fields: {id: true, artist: true, topTracks: false, albums: false, relatedArtists: true}
    }

    const detailedArtists = await enrichedArtist.find(artistFilter)

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
    const ytVideo = app.models.ytVideo
    const filter = {
      where: {
        and: [
          {isVideoRecombeeSynced: true},
          {or: [{isVideoRemoved: false}, {isVideoRemoved: {exists: false}}]}
        ]},
      limit: maxResults,
      skip: offset
    }
    const videos = await ytVideo.find(filter)

    return videos
  }

  function resetDatabase () {
    if (app.get('env') !== 'production') {
      recombeeClient.send(new recombeeRqs.ResetDatabase(), (err, result) => err ? console.log('Some error occurred while resetting db') : console.log('Database reset successful'))
    }
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
    const contentDetailsRegionRestriction = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-regionRestriction', 'string')))
    const contentDetailsContentRating = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-contentRating', 'string')))
    const contentDetailsProjection = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-projection', 'string')))
    const contentDetailsHasCustomThumbnail = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-hasCustomThumbnail', 'boolean')))
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
    const snippetTags = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-tags', 'set')))
    const snippetCategoryId = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-categoryId', 'string')))
    const snippetLiveBroadcastContent = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-liveBroadcastContent', 'string')))
    const snippetDefaultLanguage = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-defaultLanguage', 'string')))
    const snippetLocalized = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-localized', 'string')))
    const snippetDefaultAudioLanguage = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-defaultAudioLanguage', 'string')))
    const liveStreamingDetailsActualStartTime = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('liveStreamingDetails-actualStartTime', 'timestamp')))
    const liveStreamingDetailsActualEndTime = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('liveStreamingDetails-actualEndTime', 'timestamp')))
    const liveStreamingDetailsScheduledStartTime = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('liveStreamingDetails-scheduledStartTime', 'timestamp')))
    const liveStreamingDetailsScheduledEndTime = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('liveStreamingDetails-scheduledEndTime', 'timestamp')))
    const liveStreamingDetailsConcurrentViewers = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('liveStreamingDetails-concurrentViewers', 'string')))
    const liveStreamingDetailsActiveLiveChatId = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('liveStreamingDetails-activeLiveChatId', 'string')))
    const artistsIds = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-ids', 'set')))
    const artistsGenres = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('genres', 'set')))
    const artistsNames = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-names', 'set')))
    const artistsPopularity = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-popularity', 'set')))
    const artistsFollowers = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-followers', 'set')))
    const artistsRelatedArtists = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-relatedArtists', 'set')))
    const artistsType = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-type', 'set')))

    const result = Rx.Observable.concat(itemType, kind, etag, contentDetailsDuration, contentDetailsDimension, contentDetailsDefinition, contentDetailsLicensedContent,
      contentDetailsRegionRestriction, contentDetailsContentRating, contentDetailsCaption, contentDetailsProjection, contentDetailsHasCustomThumbnail,
      statisticsViewCount, statisticsLikeCount, statisticsDisLikeCount, statisticsFavoriteCount, statisticsCommentCount, snippetPublishedAt, snippetChannelId,
      snippetTitle, snippetDescription, snippetChannelTitle, snippetThumbnails, snippetTags, snippetCategoryId, snippetLiveBroadcastContent,
      snippetDefaultLanguage, snippetLocalized, snippetDefaultAudioLanguage, liveStreamingDetailsActualStartTime,
      liveStreamingDetailsActualEndTime, liveStreamingDetailsScheduledStartTime, liveStreamingDetailsScheduledEndTime,
      liveStreamingDetailsConcurrentViewers, liveStreamingDetailsActiveLiveChatId, artistsIds, artistsGenres, artistsNames,
      artistsPopularity, artistsFollowers, artistsRelatedArtists, artistsType)

    return result
  }

  function setUserProperties () {
    const clientSendAsObservable = Rx.Observable.bindNodeCallback(recombeeClient.send.bind(recombeeClient))
    const userType = clientSendAsObservable(new recombeeRqs.AddUserProperty('userType', 'string'))
    const browserIds = clientSendAsObservable(new recombeeRqs.AddUserProperty('browser-ids', 'set'))

    const result = Rx.Observable.concat(userType, browserIds)
    return result
  }

  function setModelItemsForReSync (itemsObservable, model) {
    return itemsObservable.concatMap(items => Rx.Observable.from(items)).concatMap(({id}) => Rx.Observable.fromPromise(model.findById(id)))
      .map((item) => {
        switch (model.modelName) {
          case 'enrichedArtist':
            item.isArtistRecombeeSynced = false
            break
          case 'ytVideo':
            item.isVideoRecombeeSynced = false
            break
        }
        return item
      }).concatMap(item => Rx.Observable.fromPromise(model.replaceOrCreate(item)))
  }
}
