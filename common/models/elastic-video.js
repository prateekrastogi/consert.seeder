'use strict'

const app = require('../../server/server')
const Rx = require('rxjs')
const R = require('ramda')

const MAX_BATCH = 5000
const WAIT_TILL_NEXT_REQUEST = 5000
const REPEAT_ATTEMPTS = 2

module.exports = function (elasticVideo) {
/**
 * Synchronizes ytVideos data with elasticsearch
 * @param {Function(Error)} callback
 */

  elasticVideo.syncYtVideosWithElastic = function () {
    const ytVideo = app.models.ytVideo

    const elasticSyncer = getAllDbItemsObservable(findElasticUnsyncedYtVideosInBatches)
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

    // Had to do this due to back-pressure resulting in ignored items
    elasticSyncer.repeat(REPEAT_ATTEMPTS)
    .subscribe(x => console.log(`Working on syncing with es: ${x.snippet.title}`),
     err => console.log(err))

    return Promise.resolve()
  }

  elasticVideo.setYtVideosForElasticReSync = function () {
    const ytVideo = app.models.ytVideo

    const resyncSetter = getAllDbItemsObservable(findElasticSyncedYtVideosInBatches).concatMap(video => {
      video.isVideoElasticSearchSynced = false
      return Rx.Observable.fromPromise(ytVideo.replaceOrCreate(video))
    })

    // Had to do this due to back-pressure resulting in ignored items
    resyncSetter.timeoutWith(4 * WAIT_TILL_NEXT_REQUEST, resyncSetter)
    .subscribe(x => console.log(`Setting for re-sync with es: ${x.snippet.title}`),
    err => console.log(err),
  () => console.log('complte'))

    return Promise.resolve()
  }

  function getAllDbItemsObservable (filterFunction) {
    const dbItems = Rx.Observable.interval(WAIT_TILL_NEXT_REQUEST).concatMap((i) => {
      const items = Rx.Observable.defer(() => Rx.Observable.fromPromise(filterFunction(MAX_BATCH, i * MAX_BATCH)))
      .concatMap(items => Rx.Observable.from(items))
      return items
    }).catch(err => {
      if (err.name === 'MongoError' && err.code === 2) {
        const nextItems = Rx.Observable.fromPromise(filterFunction(MAX_BATCH, 0))
        return nextItems.count > 0 ? dbItems : Rx.Observable.empty()
      }
    })

    return dbItems
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

    const augmentedVideos = R.zipWith(zipArtistAndVideo, videos, videoArtistsIdExtractor(videos))

    return augmentedVideos
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
