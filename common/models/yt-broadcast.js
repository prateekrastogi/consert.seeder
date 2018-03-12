'use strict'

const R = require('ramda')
const Rx = require('rxjs')
const ytUtils = require('../../lib/yt-utils')
const loginAssist = require('../../lib/login-assist')

const getAllDbItemsObservable = require('../../lib/misc-utils').getAllDbItemsObservable

const RETRY_COUNT = 3
const MAX_RESULTS = 300
const MAX_BATCH = 5000
const THRESHOLD_CONCURRENT_VIEWERS = 50
const THRESHOLD_CHANNEL_SUBSCRIBERS = 100
const REQUEST_BUFFER_SIZE = 50
const WAIT_TILL_NEXT_REQUEST = 5000

module.exports = function (ytBroadcast) {
/**
 * It syncs recently live Youtube music events with recombee & elasticsearch
 */

  ytBroadcast.syncYtBroadcasts = function () {
    const baseParams = { type: `video`, eventType: `live`, regionCode: `US`, safeSearch: `none`, videoEmbeddable: `true`, videoSyndicated: `true` }

    let counter = 0
    liveNowBroadcastsUpdater()
      .do(x => console.log(++counter)).count()
      .subscribe(x => console.log(x))

    return new Promise((resolve, reject) => resolve())
  }

  function searchAndSyncLiveEvents () {
    const baseParams = { type: `video`, eventType: `live`, regionCode: `US`, safeSearch: `none`, videoEmbeddable: `true`, videoSyndicated: `true` }

    const dateSortedSearch = dateSearch(baseParams)
    const defaultAndViewCountSortedSearch = defaultAndViewCountSearch(baseParams)

    const allSearchResultsSynced = Rx.Observable.merge(dateSortedSearch, defaultAndViewCountSortedSearch)
      .concatMap(event => Rx.Observable.fromPromise(ytBroadcast.replaceOrCreate(event)))

    return allSearchResultsSynced
  }

  function dateSearch (baseParams) {
    const dateParams = {...baseParams, order: `date`}
    const dateSearch = ytUtils.searchYtVideos([`music | song | radio -news -politics -sports`], MAX_RESULTS, dateParams).retry(RETRY_COUNT)

    const dateSearchFilteredByChannelPopularity = dateSearch.bufferCount(REQUEST_BUFFER_SIZE).concatMap((bufferedBroadcasts) => {
      const channelIds = R.compose(R.join(','), R.pluck('channelId'), R.pluck('snippet'))(bufferedBroadcasts)

      const listChannels = Rx.Observable.bindNodeCallback(loginAssist.ytBroadcastLogin().listChannels)

      const channelStatistics = listChannels({id: `${channelIds}`}, [`statistics`], {}).retry(RETRY_COUNT).pluck('items')
        .concatMap(channels => Rx.Observable.from(channels))

      const eligibleBroadcastsObservable = channelStatistics.filter(({statistics}) => {
        const {subscriberCount} = statistics
        return parseInt(subscriberCount) >= THRESHOLD_CHANNEL_SUBSCRIBERS
      }).bufferCount(REQUEST_BUFFER_SIZE)
        .map((filteredChannels) => {
          const filteredChannelsId = R.pluck('id')(filteredChannels)

          const eligibleBroadcasts = R.innerJoin(
            (broadcast, channelId) => broadcast.snippet.channelId === channelId,
            bufferedBroadcasts,
            filteredChannelsId
          )
          return eligibleBroadcasts
        }).concatMap(broadcasts => Rx.Observable.from(broadcasts))

      return eligibleBroadcastsObservable
    })

    return dateSearchFilteredByChannelPopularity
  }

  function defaultAndViewCountSearch (baseParams) {
    const viewCountParams = {...baseParams, order: `viewCount`}

    const defaultSearch = ytUtils.searchYtVideos([`music | song | radio -news -politics -sports`], MAX_RESULTS, baseParams).retry(RETRY_COUNT)
    const viewCountSearch = ytUtils.searchYtVideos([`music | song | radio -news -politics -sports`], MAX_RESULTS, viewCountParams).retry(RETRY_COUNT)

    const mergedSearch = Rx.Observable.merge(defaultSearch, viewCountSearch)
      .distinct(value => value.id).filter(({liveStreamingDetails}) => {
        const {concurrentViewers} = liveStreamingDetails
        return parseInt(concurrentViewers) >= THRESHOLD_CONCURRENT_VIEWERS
      })

    return mergedSearch
  }

  function liveNowBroadcastsUpdater () {
    const updatedBroadCasts = getAllDbItemsObservable(findLiveNowBroadcasts, WAIT_TILL_NEXT_REQUEST, MAX_BATCH)
      .bufferCount(MAX_BATCH)
      .concatMap(liveNowBroadcasts => {
        const broadcastNow = Rx.Observable.from(liveNowBroadcasts).pluck('id').bufferCount(REQUEST_BUFFER_SIZE)
          .concatMap(ids => ytUtils.getBroadcastsByIds(ids)).pluck('items')
          .concatMap(broadcasts => Rx.Observable.from(broadcasts))

        const removedBroadCasts = broadcastNow.bufferCount(MAX_BATCH).concatMap(broadcasts => {
          const missingBroadcasts = R.differenceWith(
            (liveNowBroadcast, broadcast) => liveNowBroadcast.id === broadcast.id,
            liveNowBroadcasts,
            broadcasts
          )
          return Rx.Observable.from(missingBroadcasts)
        }).map(missingBroadcast => {
          missingBroadcast.isBroadcastRemoved = true
          return missingBroadcast
        })

        const mergedUpdatedBroadCasts = Rx.Observable.merge(broadcastNow, removedBroadCasts)

        return mergedUpdatedBroadCasts
      })

    return updatedBroadCasts
  }

  async function findLiveNowBroadcasts (maxResults, offset) {
    const filter = {
      where: {'snippet.liveBroadcastContent': 'live'},
      limit: maxResults,
      skip: offset
    }
    const liveNowBroadcasts = await ytBroadcast.find(filter)
    return liveNowBroadcasts
  }
}

/*
.concatMap(ids => Rx.Observable.from(ids)).pluck('id')
      .bufferCount(BUFFER_SIZE).concatMap(ids => ytUtils.getBroadcastsByIds(ids)).pluck('items').concatMap(broadcasts => Rx.Observable.from(broadcasts))
      .filter(x => x.snippet.liveBroadcastContent === 'none')
*/
