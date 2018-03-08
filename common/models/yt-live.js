'use strict'

const R = require('ramda')
const Rx = require('rxjs')
const ytUtils = require('../../lib/yt-utils')
const loginAssist = require('../../lib/login-assist')

const RETRY_COUNT = 3
const MAX_RESULTS = 300
const MIN_CONCURRENT_VIEWERS = 50

module.exports = function (ytLive) {
/**
 * It syncs recently live Youtube music events with recombee & elasticsearch
 */

  ytLive.syncYtLiveEvents = function () {
    const params = { type: `video`, eventType: `live`, regionCode: `US`, safeSearch: `none`, videoEmbeddable: `true`, videoSyndicated: `true` }
    const viewCountParams = {...params, order: `viewCount`}

    const defaultSearch = ytUtils.searchYtVideos([`music | song | radio -news -politics`], MAX_RESULTS, params)
    const viewCountSearch = ytUtils.searchYtVideos([`music | song | radio -news -politics`], MAX_RESULTS, viewCountParams).retry(RETRY_COUNT)

    const viewCountAllSearch = Rx.Observable.merge(defaultSearch, viewCountSearch)

    viewCountAllSearch.distinct(value => value.id).filter(({liveStreamingDetails}) => {
      const {concurrentViewers} = liveStreamingDetails
      return parseInt(concurrentViewers) >= MIN_CONCURRENT_VIEWERS
    }).do(x => console.log(x.snippet.title)).count()
      .subscribe(x => console.log(x))

    return new Promise((resolve, reject) => resolve())
  }
}

/* const filters = {id: `UCl6ZTRWElpb5wE1zCgSDkGg`}
    const channelsList = Rx.Observable.bindNodeCallback(loginAssist.ytLiveLogin().listChannels)

    channelsList(filters, [`statistics`, `topicDetails`], params)
 */
