'use strict'

const app = require('../../server/server')
const Rx = require('rxjs')
const R = require('ramda')

const MAX_BATCH = 500
const WAIT_TILL_NEXT_REQUEST = 1000

module.exports = function (elasticVideo) {
/**
 * Synchronizes ytVideos data with elasticsearch
 * @param {Function(Error)} callback
 */

  elasticVideo.syncYtVideosWithElastic = function () {
    getAllDbItemsObservable(findElasticUnsyncedYtVideosInBatches)
    .concatMap(video => Rx.Observable.fromPromise(elasticVideo.replaceOrCreate(video)))
    .subscribe(x => console.log(x))

    return Promise.resolve()
  }

  elasticVideo.setYtVideosForElasticReSync = function () {
    const ytVideo = app.models.ytVideo

    const resyncSetter = getAllDbItemsObservable(findElasticSyncedYtVideosInBatches).concatMap(video => {
      video.isVideoElasticSearchSynced = false
      return Rx.Observable.fromPromise(ytVideo.replaceOrCreate(video))
    })

    resyncSetter.subscribe(x => console.log(x), err => console.log(err))
    return Promise.resolve()
  }

  function getAllDbItemsObservable (filterFunction) {
    return Rx.Observable.interval(WAIT_TILL_NEXT_REQUEST).concatMap((i) => {
      return Rx.Observable.fromPromise(filterFunction(MAX_BATCH, i * MAX_BATCH))
  .catch(err => Rx.Observable.empty()).concatMap(items => Rx.Observable.from(items))
    })
  }

  async function findElasticUnsyncedYtVideosInBatches (maxResults, offset) {
    const ytVideo = app.models.ytVideo
    const filter = {
      where: {or: [{isVideoElasticSearchSynced: false}, {isVideoElasticSearchSynced: {exists: false}}]},
      fields: {id: true,
        artists: true,
        tracks: false,
        albums: false,
        isVideoElasticSearchSynced: false,
        isVideoRecombeeSynced: false,
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

    R.zipWith(zipArtistAndVideo, videos, videoArtistsIdExtractor(videos))

    return videos
  }

  async function findElasticSyncedYtVideosInBatches (maxResults, offset) {
    const ytVideo = app.models.ytVideo
    const filter = {
      where: {isVideoElasticSearchSynced: true},
      limit: maxResults,
      skip: offset
    }
    const videos = await ytVideo.find(filter)

    return videos
  }
}
