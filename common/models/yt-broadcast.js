'use strict'

const R = require('ramda')
const ytUtils = require('../../lib/yt-utils')
const loginAssist = require('../../lib/login-assist')
const { from, concat, timer, merge, bindNodeCallback } = require('rxjs')
const { concatMap, bufferCount, retry, pluck, filter, map, distinct } = require('rxjs/operators')

const getAllDbItemsObservable = require('../../lib/misc-utils').getAllDbItemsObservable
const recursiveTimeOutDeferredObservable = require('../../lib/misc-utils').recursiveTimeOutDeferredObservable
const terminateAllActiveInterferingSubscriptions = require('../../lib/misc-utils').terminateAllActiveInterferingSubscriptions

const RETRY_COUNT = 3
const MAX_RESULTS = 300
const MAX_BATCH = 5000
const THRESHOLD_CONCURRENT_VIEWERS = 50
const THRESHOLD_CHANNEL_SUBSCRIBERS = 10000
const REQUEST_BUFFER_SIZE = 50
const WAIT_TILL_NEXT_REQUEST = 5000
const SHORT_POLLING_INTERVAL = 60 * 1000
const LONG_POLLING_INTERVAL = 5 * 60 * 1000

let activeSubscriptions = []

module.exports = function (ytBroadcast) {
  ytBroadcast.syncYtBroadcasts = function () {
    const safeSearchAndSyncLiveEvents = concat(terminateAllActiveInterferingSubscriptions(activeSubscriptions), searchAndSyncLiveEvents()).pipe(
      retry(RETRY_COUNT)
    )

    const syncYtBroadcastsSubscription = safeSearchAndSyncLiveEvents.subscribe(x => console.log(`Setting for sync: ${x.snippet.title}`),
      err => console.error(err))

    activeSubscriptions.push(syncYtBroadcastsSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  function searchAndSyncLiveEvents () {
    const baseParams = { type: `video`, eventType: `live`, regionCode: `US`, safeSearch: `none`, videoEmbeddable: `true`, videoSyndicated: `true` }

    const dateSortedSearch = timer(0, SHORT_POLLING_INTERVAL).pipe(concatMap(i => dateSearch(baseParams)))
    const defaultAndViewCountSortedSearch = timer(0, LONG_POLLING_INTERVAL).pipe(concatMap(i => defaultAndViewCountSearch(baseParams)))
    const liveBroadCastsUpdater = recursiveTimeOutDeferredObservable(liveNowBroadcastsUpdater(), LONG_POLLING_INTERVAL)

    const allSearchResultsSynced = merge(dateSortedSearch, defaultAndViewCountSortedSearch, liveBroadCastsUpdater).pipe(
      concatMap(event => from(ytBroadcast.replaceOrCreate(event)))
    )

    return allSearchResultsSynced
  }

  function dateSearch (baseParams) {
    const dateParams = { ...baseParams, order: `date` }
    const dateSearch = ytUtils.searchYtVideos([`music | song | radio -news -politics -sports`], MAX_RESULTS, dateParams).pipe(retry(RETRY_COUNT))

    const dateSearchFilteredByChannelPopularity = dateSearch.pipe(
      bufferCount(REQUEST_BUFFER_SIZE),

      concatMap((bufferedBroadcasts) => {
        const channelIds = R.compose(R.join(','), R.pluck('channelId'), R.pluck('snippet'))(bufferedBroadcasts)

        const listChannels = bindNodeCallback(loginAssist.ytBroadcastLogin().listChannels)

        const channelStatistics = listChannels({ id: `${channelIds}` }, [`statistics`], {}).pipe(
          retry(RETRY_COUNT),
          pluck('items'),
          concatMap(channels => from(channels))
        )

        const eligibleBroadcastsObservable = channelStatistics.pipe(
          filter(({ statistics }) => {
            const { subscriberCount } = statistics
            return parseInt(subscriberCount) >= THRESHOLD_CHANNEL_SUBSCRIBERS
          }),
          bufferCount(REQUEST_BUFFER_SIZE),
          map((filteredChannels) => {
            const filteredChannelsId = R.pluck('id')(filteredChannels)

            const eligibleBroadcasts = R.innerJoin(
              (broadcast, channelId) => broadcast.snippet.channelId === channelId,
              bufferedBroadcasts,
              filteredChannelsId
            )
            return eligibleBroadcasts
          }),
          concatMap(broadcasts => from(broadcasts))
        )

        return eligibleBroadcastsObservable
      })
    )

    return dateSearchFilteredByChannelPopularity
  }

  function defaultAndViewCountSearch (baseParams) {
    const viewCountParams = { ...baseParams, order: `viewCount` }

    const defaultSearch = ytUtils.searchYtVideos([`music | song | radio -news -politics -sports`], MAX_RESULTS, baseParams).pipe(retry(RETRY_COUNT))
    const viewCountSearch = ytUtils.searchYtVideos([`music | song | radio -news -politics -sports`], MAX_RESULTS, viewCountParams).pipe(retry(RETRY_COUNT))

    const mergedSearch = merge(defaultSearch, viewCountSearch).pipe(
      distinct(value => value.id),
      filter(({ liveStreamingDetails }) => {
        const { concurrentViewers } = liveStreamingDetails
        return parseInt(concurrentViewers) >= THRESHOLD_CONCURRENT_VIEWERS
      })
    )

    return mergedSearch
  }

  function liveNowBroadcastsUpdater () {
    const updatedBroadCasts = getAllDbItemsObservable(findLiveNowBroadcastsInBatch, WAIT_TILL_NEXT_REQUEST, MAX_BATCH).pipe(
      concatMap(liveNowBroadcasts => {
        const broadcastNow = ytUtils.mapYtItems(ytUtils.getBroadcastsByIds, liveNowBroadcasts, RETRY_COUNT, REQUEST_BUFFER_SIZE).pipe(
          concatMap(mappedItems => from(mappedItems))
        )

        const removedBroadCasts = ytUtils.mapUnmappedYtItems(ytUtils.getBroadcastsByIds, liveNowBroadcasts,
          RETRY_COUNT, REQUEST_BUFFER_SIZE, MAX_BATCH).pipe(
          concatMap(missingBroadcasts => from(missingBroadcasts)),
          map(missingBroadcast => {
            missingBroadcast.isRemoved = true
            return missingBroadcast
          })
        )

        const mergedUpdatedBroadCasts = merge(broadcastNow, removedBroadCasts)

        return mergedUpdatedBroadCasts
      })
    )

    return updatedBroadCasts
  }

  async function findLiveNowBroadcastsInBatch (maxResults, offset) {
    const filter = {
      where: {
        and: [
          { 'snippet.liveBroadcastContent': 'live' },
          { or: [{ isRemoved: false }, { isRemoved: { exists: false } }] }
        ] },
      limit: maxResults,
      skip: offset
    }
    const liveNowBroadcasts = await ytBroadcast.find(filter)
    return liveNowBroadcasts
  }
}
