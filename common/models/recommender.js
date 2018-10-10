'use strict'

const app = require('../../server/server')
const Rx = require('rxjs-compat')
const _ = require('lodash')
const R = require('ramda')
const recombeeUtils = require('../../lib/recommender-utils')

const getAllDbItemsObservable = require('../../lib/misc-utils').getAllDbItemsObservable
const terminateAllActiveInterferingSubscriptions = require('../../lib/misc-utils').terminateAllActiveInterferingSubscriptions
const recursiveDeferredObservable = require('../../lib/misc-utils').recursiveDeferredObservable
const recursiveTimeOutDeferredObservable = require('../../lib/misc-utils').recursiveTimeOutDeferredObservable

const MAX_BATCH = 5000
const WAIT_TILL_NEXT_REQUEST = 10000

let artistRelatedActiveSubscriptions = []
let videoRelatedActiveSubscriptions = []
let broadcastRelatedActiveSubscriptions = []

module.exports = function (recommender) {
  recommender.syncPastShows = function () {
    const ytVideo = app.models.ytVideo

    const safeRecursiveSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(videoRelatedActiveSubscriptions),
      recursiveDeferredObservable(recombeeBatchSyncer(ytVideo, findRecombeeUnSyncedYtVideosInBatch)))

    const recombeeVideoSyncerSubscription = safeRecursiveSyncer.subscribe({
      error: err => console.error(err)
    })

    videoRelatedActiveSubscriptions.push(recombeeVideoSyncerSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  recommender.syncArtists = function (lowerBound, upperBound) {
    const enrichedArtist = app.models.enrichedArtist
    const artists = Rx.Observable.fromPromise(findRecombeeUnSyncedArtistsByPopularity(lowerBound, upperBound))

    const artistSyncer = artists.concatMap(artists => Rx.Observable.from(artists)).map(value => {
      const { artist, id, relatedArtists } = value
      const recombeeItem = recombeeUtils.convertArtistToRecombeeArtist(artist, relatedArtists)

      return { recombeeItem, id }
    }).bufferCount(MAX_BATCH)
      .concatMap(bufferedItems => recombeeUtils.writeBufferedItemsToRecommbee(bufferedItems, enrichedArtist))

    const safeArtistSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(artistRelatedActiveSubscriptions), recursiveTimeOutDeferredObservable(artistSyncer, 4 * WAIT_TILL_NEXT_REQUEST))

    const artistSyncerSubscription = safeArtistSyncer.subscribe({
      error: err => console.error(err)
    })

    artistRelatedActiveSubscriptions.push(artistSyncerSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  recommender.syncBroadcasts = function () {
    const ytBroadcast = app.models.ytBroadcast

    const safeRecursiveSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(broadcastRelatedActiveSubscriptions),
      recursiveDeferredObservable(recombeeBatchSyncer(ytBroadcast, findRecombeeUnSyncedYtBroadcastsInBatch)))

    const recombeeBroadcastSyncerSubscription = safeRecursiveSyncer.subscribe({
      error: err => console.error(err)
    })

    broadcastRelatedActiveSubscriptions.push(recombeeBroadcastSyncerSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  recommender.setArtistsByPopularityForRecommenderReSync = function (lowerBound, upperBound) {
    const enrichedArtist = app.models.enrichedArtist

    const artists = Rx.Observable.fromPromise(findRecombeeSyncedArtistsByPopularity(lowerBound, upperBound))

    const safeArtistReSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(artistRelatedActiveSubscriptions), setModelItemsForReSync(artists, enrichedArtist))

    const artistReSyncerSubscription = safeArtistReSyncer
      .subscribe(({ artist }) => console.log(`Artist marked for Recombee Re-sync: ${artist.name}`), err => console.error(err))

    artistRelatedActiveSubscriptions.push(artistReSyncerSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  recommender.setVideosForRecommenderReSync = function () {
    const ytVideo = app.models.ytVideo

    const safeRecursiveReSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(videoRelatedActiveSubscriptions),
      recursiveTimeOutDeferredObservable(recombeeBatchReSyncer(ytVideo, findRecombeeSyncedYtVideosInBatch), 4 * WAIT_TILL_NEXT_REQUEST))

    const recombeeVideoReSyncerSubscription = safeRecursiveReSyncer
      .subscribe(({ snippet }) => console.log(`Video marked for Recombee Re-sync: ${snippet.title}`), err => console.error(err))

    videoRelatedActiveSubscriptions.push(recombeeVideoReSyncerSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  recommender.setBroadcastsForRecommenderReSync = function () {
    const ytBroadcast = app.models.ytBroadcast

    const safeRecursiveReSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(broadcastRelatedActiveSubscriptions),
      recursiveTimeOutDeferredObservable(recombeeBatchReSyncer(ytBroadcast, findRecombeeSyncedYtBroadcastsInBatch), 4 * WAIT_TILL_NEXT_REQUEST))

    const recombeeBroadcastReSyncerSubscription = safeRecursiveReSyncer
      .subscribe(({ snippet }) => console.log(`Broadcast marked for Recombee Re-sync: ${snippet.title}`), err => console.error(err))

    broadcastRelatedActiveSubscriptions.push(recombeeBroadcastReSyncerSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  function recombeeBatchSyncer (model, filterFunction) {
    const mediaItems = getAllDbItemsObservable(filterFunction, WAIT_TILL_NEXT_REQUEST, MAX_BATCH)

    const recombeeSyncer = mediaItems.map((items) => {
      const mapperFn = (mediaItem) => {
        const { id } = mediaItem
        const recombeeItem = recombeeUtils.convertMediaItemToRecombeeItem(mediaItem)
        return { recombeeItem, id }
      }

      return R.map(mapperFn, items)
    }).concatMap(bufferedItems => recombeeUtils.writeBufferedItemsToRecommbee(bufferedItems, model))

    return recombeeSyncer
  }

  function recombeeBatchReSyncer (model, filterFunction) {
    const syncedItems = getAllDbItemsObservable(filterFunction, WAIT_TILL_NEXT_REQUEST, MAX_BATCH)

    return setModelItemsForReSync(syncedItems, model)
  }

  async function findRecombeeUnSyncedArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtist = app.models.enrichedArtist
    const filter = {
      where: { and: [{ or: [{ isArtistRecSysSynced: false }, { isArtistRecSysSynced: { exists: false } }] }, { areArtistVideosCrawled: true }, { 'artist.popularity': { 'gte': lowerBound } }, { 'artist.popularity': { 'lt': upperBound } }] },
      fields: { id: true, artist: true, topTracks: false, albums: false, relatedArtists: true }
    }
    const artists = await enrichedArtist.find(filter)

    const artistWithRelatedArtists = _.map(artists, (artist) => {
      const { relatedArtists } = artist
      artist.relatedArtists = _.map(relatedArtists, 'id')
      return artist
    })
    return artistWithRelatedArtists
  }

  async function findRecombeeSyncedArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtist = app.models.enrichedArtist
    const filter = {
      where: { and: [{ 'isArtistRecSysSynced': true }, { 'artist.popularity': { 'gte': lowerBound } }, { 'artist.popularity': { 'lt': upperBound } }] },
      fields: { id: true, artist: true, topTracks: false, albums: false }
    }
    const artists = await enrichedArtist.find(filter)
    return artists
  }

  async function findRecombeeUnSyncedYtVideosInBatch (maxResults, offset) {
    const ytVideo = app.models.ytVideo
    const filter = {
      where: {
        and: [
          { or: [{ isVideoRecSysSynced: false }, { isVideoRecSysSynced: { exists: false } }] }
        ] },
      limit: maxResults,
      skip: offset
    }
    const videos = await ytVideo.find(filter)

    const artists = _.uniq(_.flatMap(videos, (video) => video.artists))
    const artistsFilter = _.map(artists, (id) => {
      return { id: id }
    })

    const enrichedArtist = app.models.enrichedArtist
    const artistFilter = {
      where: { or: artistsFilter },
      fields: { id: true, artist: true, topTracks: false, albums: false, relatedArtists: true }
    }

    const detailedArtists = await enrichedArtist.find(artistFilter)

    const artistWithRelatedArtists = _.map(detailedArtists, (artist) => {
      const { relatedArtists } = artist
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

  async function findRecombeeSyncedYtVideosInBatch (maxResults, offset) {
    const ytVideo = app.models.ytVideo
    const filter = {
      where: {
        and: [
          { isVideoRecSysSynced: true }
        ] },
      limit: maxResults,
      skip: offset
    }
    const videos = await ytVideo.find(filter)

    return videos
  }

  async function findRecombeeUnSyncedYtBroadcastsInBatch (maxResults, offset) {
    const ytBroadcast = app.models.ytBroadcast

    const filter = {
      where: {
        and: [
          { or: [{ isBroadcastRecSysSynced: false }, { isBroadcastRecSysSynced: { exists: false } }] }
        ] },
      limit: maxResults,
      skip: offset
    }
    const broadcasts = await ytBroadcast.find(filter)

    return broadcasts
  }

  async function findRecombeeSyncedYtBroadcastsInBatch (maxResults, offset) {
    const ytBroadcast = app.models.ytBroadcast

    const filter = {
      where: {
        and: [
          { isBroadcastRecSysSynced: true }
        ] },
      limit: maxResults,
      skip: offset
    }
    const broadcasts = await ytBroadcast.find(filter)

    return broadcasts
  }

  function setModelItemsForReSync (itemsObservable, model) {
    return itemsObservable.concatMap(items => Rx.Observable.from(items)).concatMap(({ id }) => Rx.Observable.fromPromise(model.findById(id)))
      .map((item) => {
        switch (model.modelName) {
          case 'enrichedArtist':
            item.isArtistRecSysSynced = false
            break
          case 'ytVideo':
            item.isVideoRecSysSynced = false
            break
          case 'ytBroadcast':
            item.isBroadcastRecSysSynced = false
            break
        }
        return item
      }).concatMap(item => Rx.Observable.fromPromise(model.replaceOrCreate(item)))
  }
}
