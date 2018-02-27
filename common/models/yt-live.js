'use strict'

const R = require('ramda')
const Rx = require('rxjs')
const ytUtils = require('../../lib/yt-utils')

module.exports = function (ytLive) {
/**
 * It syncs recently live Youtube music events with recombee & elasticsearch
 */

  ytLive.syncYtLiveEvents = function () {
    const params = { type: `video`, regionCode: `US`, safeSearch: `none`, videoEmbeddable: `true`, videoSyndicated: `true` }

    return new Promise((resolve, reject) => resolve())
  }
}
