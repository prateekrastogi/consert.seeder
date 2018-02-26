'use strict'

const R = require('ramda')
const Rx = require('rxjs')

module.exports = function (ytLive) {
/**
 * It syncs recently live Youtube music events with recombee & elasticsearch
 */

  ytLive.syncYtLiveEvents = function () {
    return new Promise((resolve, reject) => resolve())
  }
}
