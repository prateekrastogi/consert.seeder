'use strict'

const app = require('../../server/server')
const Rx = require('rxjs-compat')
const R = require('ramda')

const getAllDbItemsObservable = require('../../lib/misc-utils').getAllDbItemsObservable
const terminateAllActiveInterferingSubscriptions = require('../../lib/misc-utils').terminateAllActiveInterferingSubscriptions
const recursiveDeferredObservable = require('../../lib/misc-utils').recursiveDeferredObservable
const recursiveTimeOutDeferredObservable = require('../../lib/misc-utils').recursiveTimeOutDeferredObservable

const MAX_BATCH = 5000
const WAIT_TILL_NEXT_REQUEST = 5000

let videoRelatedActiveSubscriptions = []
let broadcastRelatedActiveSubscriptions = []

module.exports = function (elasticVideo) {
  elasticVideo.syncYtVideosWithElastic = function () {
    const ytVideo = app.models.ytVideo

    const safeRecursiveSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(videoRelatedActiveSubscriptions),
      recursiveDeferredObservable(elasticSyncer(ytVideo, findElasticUnsyncedYtVideosInBatch)))

    const elasticSyncerSubscription = safeRecursiveSyncer
      .subscribe(x => console.log(`Working on syncing with es: ${x.snippet.title}`),
        err => console.error(err))

    videoRelatedActiveSubscriptions.push(elasticSyncerSubscription)

    return Promise.resolve()
  }

  elasticVideo.syncYtBroadcastsWithElastic = function () {
    const ytBroadcast = app.models.ytBroadcast

    const safeRecursiveSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(broadcastRelatedActiveSubscriptions),
      recursiveDeferredObservable(elasticSyncer(ytBroadcast, findElasticUnsyncedYtBroadcastsInBatch)))

    const elasticSyncerSubscription = safeRecursiveSyncer
      .subscribe(x => console.log(`Working on syncing with es, the broadcast: ${x.snippet.title}`),
        err => console.error(err))

    broadcastRelatedActiveSubscriptions.push(elasticSyncerSubscription)

    return Promise.resolve()
  }

  elasticVideo.setYtVideosForElasticReSync = function () {
    const ytVideo = app.models.ytVideo

    const safeRecursiveResyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(videoRelatedActiveSubscriptions),
      recursiveTimeOutDeferredObservable(elasticReSyncer(ytVideo, findElasticSyncedYtVideosInBatch), 4 * WAIT_TILL_NEXT_REQUEST))

    const elasticReSyncerSubscription = safeRecursiveResyncer
      .subscribe(x => console.log(`Setting for re-sync with es: ${x.snippet.title}`),
        err => console.error(err),
        () => console.log('Setting for re-sync with es completed'))

    videoRelatedActiveSubscriptions.push(elasticReSyncerSubscription)

    return Promise.resolve()
  }

  elasticVideo.setYtBroadcastsForElasticReSync = function () {
    const ytBroadcast = app.models.ytBroadcast

    const safeRecursiveResyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(broadcastRelatedActiveSubscriptions),
      recursiveTimeOutDeferredObservable(elasticReSyncer(ytBroadcast, findElasticSyncedYtBroadcastsInBatch), 4 * WAIT_TILL_NEXT_REQUEST))

    const elasticReSyncerSubscription = safeRecursiveResyncer
      .subscribe(x => console.log(`Setting for re-sync with es, the broadcast: ${x.snippet.title}`),
        err => console.error(err),
        () => console.log('Setting for re-sync with es completed'))

    broadcastRelatedActiveSubscriptions.push(elasticReSyncerSubscription)

    return Promise.resolve()
  }

  function elasticSyncer (model, filterFunction) {
    const elasticSyncingObservable = getAllDbItemsObservable(filterFunction, WAIT_TILL_NEXT_REQUEST, MAX_BATCH)
      .concatMap(items => Rx.Observable.from(items))
      .concatMap((item) => {
        const { id } = item

        const crawlRecorder = Rx.Observable.fromPromise(model.findById(id))
          .map((intactItem) => {
            switch (model.modelName) {
              case 'ytBroadcast':
                intactItem.isBroadcastElasticSearchSynced = true
                break
              case 'ytVideo':
                intactItem.isVideoElasticSearchSynced = true
                break
            }
            return intactItem
          }).concatMap(modifiedItem => Rx.Observable.fromPromise(model.replaceOrCreate(modifiedItem)))

        const elasticWriter = Rx.Observable.fromPromise(elasticVideo.upsert(item))

        return Rx.Observable.concat(elasticWriter, crawlRecorder)
      })

    return elasticSyncingObservable
  }

  function elasticReSyncer (model, filterFunction) {
    const reSyncingObservable = getAllDbItemsObservable(filterFunction, WAIT_TILL_NEXT_REQUEST, MAX_BATCH)
      .concatMap(items => Rx.Observable.from(items))
      .concatMap(item => {
        switch (model.modelName) {
          case 'ytBroadcast':
            item.isBroadcastElasticSearchSynced = false
            break
          case 'ytVideo':
            item.isVideoElasticSearchSynced = false
            break
        }
        return Rx.Observable.fromPromise(model.replaceOrCreate(item))
      })

    return reSyncingObservable
  }

  async function findElasticUnsyncedYtVideosInBatch (maxResults, offset) {
    const ytVideo = app.models.ytVideo

    const filter = {
      where: {
        and: [
          { or: [{ isVideoElasticSearchSynced: false }, { isVideoElasticSearchSynced: { exists: false } }] }
        ] },
      fields: { id: true,
        artists: true,
        isRemoved: true,
        contentDetails: true,
        statistics: true,
        snippet: true },
      limit: maxResults,
      skip: offset
    }
    const videos = await ytVideo.find(filter)

    const videoArtistsIdExtractor = R.compose(R.map(R.chain((id) => { return { id: id } })), R.pluck('artists'))

    const artistsId = R.compose(R.flatten, videoArtistsIdExtractor)(videos)

    const enrichedArtist = app.models.enrichedArtist
    const artistsFilter = {
      where: { or: artistsId },
      fields: { id: true, artist: true, topTracks: false, albums: false, relatedArtists: false }
    }
    const artists = await enrichedArtist.find(artistsFilter)

    function zipArtistAndVideo (video, artistsId) {
      const findArtist = R.compose(R.map(R.compose(R.find(R.__, artists), R.propEq('id'))), R.pluck('id'))

      const artistNames = R.compose(R.pluck('name'), R.pluck('artist'), findArtist)(artistsId)

      // Not using uniq in last step of composition to preserve frequency information for elasticsearch
      const artistsGenres = R.compose(R.flatten, R.pluck('genres'), R.pluck('artist'), findArtist)(artistsId)

      let augmentedVideo = R.clone(video)
      augmentedVideo.artists = { names: artistNames }
      augmentedVideo.genres = artistsGenres
      return augmentedVideo
    }

    const augmentedVideos = R.zipWith(zipArtistAndVideo, videos, videoArtistsIdExtractor(videos))

    return augmentedVideos
  }

  async function findElasticSyncedYtVideosInBatch (maxResults, offset) {
    const ytVideo = app.models.ytVideo

    const filter = {
      where: {
        and: [
          { isVideoElasticSearchSynced: true }
        ] },
      limit: maxResults,
      skip: offset
    }
    const videos = await ytVideo.find(filter)

    return videos
  }

  async function findElasticUnsyncedYtBroadcastsInBatch (maxResults, offset) {
    const ytBroadcast = app.models.ytBroadcast

    const filter = {
      where: {
        and: [
          { or: [{ isBroadcastElasticSearchSynced: false }, { isBroadcastElasticSearchSynced: { exists: false } }] }
        ] },
      fields: { id: true,
        isRemoved: true,
        liveStreamingDetails: true,
        contentDetails: true,
        statistics: true,
        snippet: true },
      limit: maxResults,
      skip: offset
    }
    const broadcasts = await ytBroadcast.find(filter)

    return broadcasts
  }

  async function findElasticSyncedYtBroadcastsInBatch (maxResults, offset) {
    const ytBroadcast = app.models.ytBroadcast

    const filter = {
      where: {
        and: [
          { isBroadcastElasticSearchSynced: true }
        ] },
      limit: maxResults,
      skip: offset
    }
    const broadcasts = await ytBroadcast.find(filter)

    return broadcasts
  }
}
