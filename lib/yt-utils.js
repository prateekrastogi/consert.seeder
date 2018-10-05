'use strict'

const Rx = require('rxjs-compat')
const R = require('ramda')
const _ = require('lodash')
const loginAssist = require('./login-assist')
const classifier = require('./classifier').logClassifier()

const MAX_PER_REQUEST_ITEMS = 50
const MAGIC_SEED_FOR_ALL_POSSIBLE_PLAYLIST_SIZES = 100

// Building caches to minimize network calls and its associated cost
let searchCache = []
let playlistItemCache = []

// Using export.fn instead of module.exports format to avoid refrencing 'this' while calling functions of same objects
exports.searchYtVideos = function searchYtVideos (queries, maxresults, params) {
  const { eventType } = params

  /* Creating authenticated youtube closure in this function scope to use different access tokens for each
     search api call in a round-robin manner so as to bypass and extend yt quota limitations.
     Also, using different sets of tokens for live & past-live queries */
  const youtube = eventType === 'live' ? loginAssist.ytBroadcastLogin() : loginAssist.ytLogin()

  const queryObservable = Rx.Observable.from(queries)

  const ytVideos = queryObservable.mergeMap(query => searchYt(query, maxresults, params, youtube).filter(result => eventType === 'live' ? true : filterVideoByTitle(result)))
    .distinct(value => value.id.videoId)

  const videoContentDetailsAndStats = ytVideos.pluck('id', 'videoId').bufferCount(MAX_PER_REQUEST_ITEMS).concatMap((ids) => {
    return getVideos(ids.join(), [`contentDetails`, `statistics`, `liveStreamingDetails`], youtube)
  }).pluck('items').concatMap((item) => Rx.Observable.from(item))

  const detailedYtVideos = Rx.Observable.zip(ytVideos, videoContentDetailsAndStats, (video, detailedStat) => {
    detailedStat.snippet = video.snippet
    return detailedStat
  })
  return detailedYtVideos
}

function searchYt (query, maxresults, params, youtube) {
  /* Each independent execution of observable issues separate api calls so we are incurring calls while zipping and getting video stats.
   * Cache for the a query expires after just single hit coz zipping involves only two independent executions, if needed more in future change here
   *  Sort of we are managing the side effect arising from calling function here */
  const cachedResult = _.remove(searchCache, ['query', query])
  if (cachedResult.length !== 0) {
    return cachedResult[0].result
  }

  const resultModules = maxresults % MAX_PER_REQUEST_ITEMS
  const resultDivision = _.floor(maxresults / MAX_PER_REQUEST_ITEMS)
  let nextPageToken
  const searchObservable = Rx.Observable.bindNodeCallback(youtube.search)

  const moduloResults = searchObservable(query, resultModules, params).do((result) => {
    nextPageToken = result.nextPageToken
  }).pluck('items').concatMap((results) => Rx.Observable.from(results))

  const divisionResults = Rx.Observable.zip(Rx.Observable.range(1, resultDivision), Rx.Observable.timer(0, 100))
    .concatMap(([range, timer]) => {
      const searchResults = searchObservable(query, MAX_PER_REQUEST_ITEMS, {
        pageToken: nextPageToken,
        ...params
      }).do((result) => {
        nextPageToken = result.nextPageToken
      }).concatMap(result => Rx.Observable.from(result.items))
      return searchResults
    })
  const searchResult = Rx.Observable.concat(moduloResults, divisionResults)

  // Building the cache
  searchCache = _.concat(searchCache, { query: query, result: searchResult })

  return searchResult
}

exports.getBroadcastsByIds = function getBroadcastsByIds (arrIds) {
  const youtube = loginAssist.ytBroadcastLogin()
  return getVideos(arrIds.join(), [`snippet`, `contentDetails`, `statistics`, `liveStreamingDetails`], youtube)
}

exports.getVideoIdsByVideoIds = function getVideoIdsByVideoIds (arrIds) {
  const youtube = loginAssist.ytLogin()
  return getVideos(arrIds.join(), [`id`], youtube)
}

function getVideos (ids, parts, youtube) {
  const videoCaller = Rx.Observable.bindNodeCallback(youtube.getById)
  const allParts = [...parts]

  return videoCaller(ids, allParts)
}

function filterVideoByTitle (video) {
  let canAccept = false
  const classification = classifier.getClassifications(video.snippet.title)
  _.forEach(classification, (result) => {
    if (result.label === 'accept' && result.value >= 0.5) {
      canAccept = true
    }
  })
  return canAccept
}

function getYtPlaylistItems (id, youtube) {
  const cachedResult = _.remove(playlistItemCache, ['id', id])
  if (cachedResult.length !== 0) {
    return cachedResult[0].items
  }

  let nextPageToken
  const itemsFunction = Rx.Observable.bindNodeCallback(youtube.getPlayListsItemsById)
  const itemInitialResult = itemsFunction(id, MAX_PER_REQUEST_ITEMS).do(x => {
    nextPageToken = x.nextPageToken
  }).pluck('items').concatMap(result => Rx.Observable.from(result))

  const itemSubsequentResults = Rx.Observable.range(1, MAGIC_SEED_FOR_ALL_POSSIBLE_PLAYLIST_SIZES).concatMap(x => {
    const itemResult = itemsFunction(id, MAX_PER_REQUEST_ITEMS, { pageToken: nextPageToken }).takeWhile(x => nextPageToken).do(x => { nextPageToken = x.nextPageToken })
    return itemResult
  }).pluck('items').concatMap(result => Rx.Observable.from(result))

  const playlistItems = Rx.Observable.concat(itemInitialResult, itemSubsequentResults).filter(result => filterVideoByTitle(result))

  // Building the cache
  playlistItemCache = _.concat(playlistItemCache, { id: id, items: playlistItems })

  return playlistItems
}

exports.getYtPlaylistVideos = function getYtPlaylistVideos (id) {
  const youtube = loginAssist.ytLogin()

  const playlistItems = getYtPlaylistItems(id, youtube)

  const playlistIds = getYtPlaylistItems(id, youtube).pluck('snippet', 'resourceId', 'videoId').bufferCount(MAX_PER_REQUEST_ITEMS)

  const videoContentDetailsAndStats = playlistIds.concatMap((ids) => {
    return getVideos(ids.join(), [`contentDetails`, `statistics`, `liveStreamingDetails`], youtube)
  }).pluck('items').concatMap((item) => Rx.Observable.from(item))

  const playlistVideos = Rx.Observable.zip(playlistItems, videoContentDetailsAndStats, (playlistItem, detailedStat) => {
    detailedStat.snippet = playlistItem.snippet
    return detailedStat
  })
  return playlistVideos
}

function mapYtItems (mapperFn, ytItems, MAP_RETRY_COUNT, REQUEST_BUFFER_SIZE) {
  return Rx.Observable.from(ytItems).pluck('id').bufferCount(REQUEST_BUFFER_SIZE)
    .mergeMap(ids => mapperFn(ids).retry(MAP_RETRY_COUNT), 4).pluck('items')
}

exports.mapYtItems = mapYtItems

exports.mapUnmappedYtItems = function mapUnmappedYtItems (mapperFn, ytItems, MAP_RETRY_COUNT, REQUEST_BUFFER_SIZE, ITEMS_MAX_BATCH_SIZE) {
  return mapYtItems(mapperFn, ytItems, MAP_RETRY_COUNT, REQUEST_BUFFER_SIZE)
    .concatMap(mappedItems => Rx.Observable.from(mappedItems))
    .bufferCount(ITEMS_MAX_BATCH_SIZE).map(mappedItems => {
      const missingItems = R.differenceWith(
        (ytItem, mappedItem) => ytItem.id === mappedItem.id,
        ytItems,
        mappedItems
      )
      return missingItems
    })
}
