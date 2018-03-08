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

    const viewCountMusicTopicParams = {...params}
    const viewCountEntertainmentTopicParams = {...params, topicId: `/m/02jjt`}

    const viewCountMusicTopicSearch = ytUtils.searchYtVideos([`music | song | radio`], MAX_RESULTS, viewCountMusicTopicParams).retry(RETRY_COUNT)
    const viewCountEntertainmentTopicSearch = ytUtils.searchYtVideos([`music | song | radio`], MAX_RESULTS, viewCountEntertainmentTopicParams).retry(RETRY_COUNT)

    const viewCountAllSearch = Rx.Observable.merge(viewCountMusicTopicSearch)

    viewCountAllSearch.filter(({liveStreamingDetails}) => {
      const {concurrentViewers} = liveStreamingDetails
      return parseInt(concurrentViewers) >= MIN_CONCURRENT_VIEWERS
    })
      .subscribe(x => console.log(x.snippet.title))

    return new Promise((resolve, reject) => resolve())
  }
}

/* const filters = {id: `UCl6ZTRWElpb5wE1zCgSDkGg`}
    const channelsList = Rx.Observable.bindNodeCallback(loginAssist.ytLiveLogin().listChannels)

    channelsList(filters, [`statistics`, `topicDetails`], params)
 */
