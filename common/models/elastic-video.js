'use strict'

const app = require('../../server/server')
const Rx = require('rxjs')
const R = require('ramda')

const getAllDbItemsObservable = require('../../lib/misc-utils').getAllDbItemsObservable
const terminateAllActiveInterferingSubscriptions = require('../../lib/misc-utils').terminateAllActiveInterferingSubscriptions
const recursiveDeferredObservable = require('../../lib/misc-utils').recursiveDeferredObservable
const recursiveTimeOutDeferredObservable = require('../../lib/misc-utils').recursiveTimeOutDeferredObservable

const MAX_BATCH = 5000
const WAIT_TILL_NEXT_REQUEST = 5000

let activeSubscriptions = []

module.exports = function (elasticVideo) {
/**
 * Synchronizes ytVideos data with elasticsearch
 */

  elasticVideo.syncYtVideosWithElastic = function () {
    const ytVideo = app.models.ytVideo

    const elasticSyncer = getAllDbItemsObservable(findElasticUnsyncedYtVideosInBatches, WAIT_TILL_NEXT_REQUEST, MAX_BATCH)
      .concatMap((video) => {
        const {id} = video

        const crawlRecorder = Rx.Observable.fromPromise(ytVideo.findById(id))
          .map((intactVideo) => {
            intactVideo.isVideoElasticSearchSynced = true
            return intactVideo
          }).concatMap(intactVideo => Rx.Observable.fromPromise(ytVideo.replaceOrCreate(intactVideo)))

        const elasticWriter = Rx.Observable.fromPromise(elasticVideo.upsert(video))

        return Rx.Observable.concat(elasticWriter, crawlRecorder)
      })

    const safeRecursiveSyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(activeSubscriptions), recursiveDeferredObservable(elasticSyncer))

    const elasticSyncerSubscription = safeRecursiveSyncer
      .subscribe(x => console.log(`Working on syncing with es: ${x.snippet.title}`),
        err => console.log(err))

    activeSubscriptions.push(elasticSyncerSubscription)

    return Promise.resolve()
  }

  elasticVideo.setYtVideosForElasticReSync = function () {
    const ytVideo = app.models.ytVideo

    const resyncSetter = getAllDbItemsObservable(findElasticSyncedYtVideosInBatches, WAIT_TILL_NEXT_REQUEST, MAX_BATCH)
      .concatMap(video => {
        video.isVideoElasticSearchSynced = false
        return Rx.Observable.fromPromise(ytVideo.replaceOrCreate(video))
      })

    const safeRecursiveResyncer = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(activeSubscriptions), recursiveTimeOutDeferredObservable(resyncSetter, WAIT_TILL_NEXT_REQUEST))

    const elasticReSyncerSubscription = safeRecursiveResyncer
      .subscribe(x => console.log(`Setting for re-sync with es: ${x.snippet.title}`),
        err => console.log(err),
        () => console.log('Setting for re-sync with es completed'))

    activeSubscriptions.push(elasticReSyncerSubscription)

    return Promise.resolve()
  }

  async function findElasticUnsyncedYtVideosInBatches (maxResults, offset) {
    const ytVideo = app.models.ytVideo

    const filter = {
      where: {
        and: [
          {or: [{isVideoElasticSearchSynced: false}, {isVideoElasticSearchSynced: {exists: false}}]},
          {or: [{isVideoRemoved: false}, {isVideoRemoved: {exists: false}}]}
        ]},
      fields: {id: true,
        artists: true,
        tracks: false,
        albums: false,
        isVideoElasticSearchSynced: false,
        isVideoRecombeeSynced: false,
        isVideoRemoved: false,
        kind: false,
        etag: false,
        contentDetails: true,
        statistics: true,
        snippet: true},
      limit: maxResults,
      skip: offset
    }
    const videos = await ytVideo.find(filter)

    const videoArtistsIdExtractor = R.compose(R.map(R.chain((id) => { return {id: id} })), R.pluck('artists'))

    const artistsId = R.compose(R.flatten, videoArtistsIdExtractor)(videos)

    const enrichedArtist = app.models.enrichedArtist
    const artistsFilter = {
      where: {or: artistsId},
      fields: {id: true, artist: true, topTracks: false, albums: false, relatedArtists: false}
    }
    const artists = await enrichedArtist.find(artistsFilter)

    function zipArtistAndVideo (video, artistsId) {
      const findArtist = R.compose(R.map(R.compose(R.find(R.__, artists), R.propEq('id'))), R.pluck('id'))

      const artistNames = R.compose(R.pluck('name'), R.pluck('artist'), findArtist)(artistsId)
      video.artists = artistNames
      return video
    }

    const augmentedVideos = R.zipWith(zipArtistAndVideo, videos, videoArtistsIdExtractor(videos))

    return augmentedVideos
  }

  async function findElasticSyncedYtVideosInBatches (maxResults, offset) {
    const ytVideo = app.models.ytVideo

    const filter = {
      where: {
        and: [
          {isVideoElasticSearchSynced: true},
          {or: [{isVideoRemoved: false}, {isVideoRemoved: {exists: false}}]}
        ]},
      limit: maxResults,
      skip: offset
    }
    const videos = await ytVideo.find(filter)

    return videos
  }
}
