'use strict'

const R = require('ramda')
const Rx = require('rxjs')
const ytUtils = require('../../lib/yt-utils')
const loginAssist = require('../../lib/login-assist')

const RETRY_COUNT = 3

module.exports = function (ytLive) {
/**
 * It syncs recently live Youtube music events with recombee & elasticsearch
 */

  ytLive.syncYtLiveEvents = function () {
    const params = { type: `video`, order: `viewCount`, topicId: `/m/04rlf`, eventType: `live`, regionCode: `US`, safeSearch: `none`, videoEmbeddable: `true`, videoSyndicated: `true` }

    const filters = {id: `UCl6ZTRWElpb5wE1zCgSDkGg`}
    const channelsList = Rx.Observable.bindNodeCallback(loginAssist.ytLiveLogin().listChannels)

    channelsList(filters, [`statistics`, `topicDetails`], params).subscribe(x => console.log(x))

    ytUtils.searchYtVideos([``], 200, params)

    return new Promise((resolve, reject) => resolve())
  }
}
