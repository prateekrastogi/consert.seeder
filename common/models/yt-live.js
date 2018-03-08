'use strict'

const R = require('ramda')
const Rx = require('rxjs')
const ytUtils = require('../../lib/yt-utils')
const loginAssist = require('../../lib/login-assist')

const RETRY_COUNT = 3
const MAX_RESULTS = 300
const THRESHOLD_CONCURRENT_VIEWERS = 50
const THRESHOLD_CHANNEL_SUBSCRIBERS = 1000
const BUFFER_SIZE = 50

module.exports = function (ytLive) {
/**
 * It syncs recently live Youtube music events with recombee & elasticsearch
 */

  ytLive.syncYtLiveEvents = function () {
    const baseParams = { type: `video`, eventType: `live`, regionCode: `US`, safeSearch: `none`, videoEmbeddable: `true`, videoSyndicated: `true` }

    const dateParams = {...baseParams, order: `date`}
    const dateSearch = ytUtils.searchYtVideos([`music | song | radio -news -politics -sports`], MAX_RESULTS, dateParams).retry(RETRY_COUNT)

    const tmep = dateSearch.bufferCount(BUFFER_SIZE).concatMap((bufferedBroadcasts) => {
      const channelIdPlucker = R.compose(R.pluck('channelId'), R.pluck('snippet'))
      const channelIds = R.compose(R.join(','), channelIdPlucker)(bufferedBroadcasts)

      const listChannels = Rx.Observable.bindNodeCallback(loginAssist.ytLiveLogin().listChannels)

      const channelStatistics = listChannels({id: `${channelIds}`}, [`statistics`], {}).retry(RETRY_COUNT).pluck('items')
        .concatMap(channels => Rx.Observable.from(channels))

      const eligibleBroadcastsObservable = channelStatistics.filter(({statistics}) => {
        const {subscriberCount} = statistics
        return parseInt(subscriberCount) >= THRESHOLD_CHANNEL_SUBSCRIBERS
      }).bufferCount(BUFFER_SIZE)
        .map((filteredChannels) => {
          const filteredChannelsId = R.pluck('id')(filteredChannels)
          const filter = R.compose(R.not, R.isNil, R.find(channelIdPlucker(R.__), filteredChannelsId))

          const eligibleBroadcasts = R.filter(filter, bufferedBroadcasts)

          return eligibleBroadcasts
        })

      return eligibleBroadcastsObservable
    })

    const allSearch = Rx.Observable.merge(tmep)

    allSearch.do(x => console.log(x)).count()
      .subscribe(x => console.log(x))

    return new Promise((resolve, reject) => resolve())
  }
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
