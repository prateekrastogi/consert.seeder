'use strict'

const _ = require('lodash')
const R = require('ramda')
const moment = require('moment')
const predictionioClient = require('./login-assist').predictionioLogin()
const { from, bindNodeCallback, EMPTY } = require('rxjs')
const { concatMap, map, retry } = require('rxjs/operators')
const fs = require('fs')

const RETRY_COUNT = 3

const durationBinEdges = [30, 60, 90, 120, 150, 180, 210, 300, 420, 480, 600, 900, 1200, 1800, 3600, 7200, 21600]

const viewCountBinEdges = [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000, 100000000000]
const likeCountBinEdges = [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000, 100000000000]
const dislikeCountBinEdges = [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000, 100000000000]
const favoriteCountBinEdges = [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000, 100000000000]
const commentCountBinEdges = [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000, 100000000000]

const concurrentViewCountBinEdges = [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000, 100000000000]

const artistFollowersBinEdges = [10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000, 100000000000]
const artistPopularityBinEdges = [70, 60, 44]

exports.convertMediaItemToRecommenderMediaItem = function convertMediaItemToRecommenderMediaItem (mediaItem) {
  const recommenderMediaItem = {
    'itemType': mediaItem.liveStreamingDetails ? ['broadcast'] : ['video'],
    'kind': [mediaItem.kind],
    'etag': [mediaItem.etag],
    'contentDetails-duration': binningDelegate('contentDetails-duration', mediaItem.contentDetails.duration, durationBinEdges),
    'contentDetails-dimension': [mediaItem.contentDetails.dimension],
    'contentDetails-definition': [mediaItem.contentDetails.definition],
    'contentDetails-caption': [mediaItem.contentDetails.caption],
    'contentDetails-licensedContent': mediaItem.contentDetails.licensedContent ? ['true'] : ['false'],
    'contentDetails-regionRestriction': mediaItem.contentDetails.regionRestriction ? [JSON.stringify(mediaItem.contentDetails.regionRestriction)] : [],
    'contentDetails-contentRating': mediaItem.contentDetails.contentRating ? [JSON.stringify(mediaItem.contentDetails.contentRating)] : [],
    'contentDetails-projection': [mediaItem.contentDetails.projection],
    'statistics-viewCount': binningDelegate('statistics-viewCount', parseInt(mediaItem.statistics.viewCount), viewCountBinEdges),
    'statistics-likeCount': binningDelegate('statistics-likeCount', parseInt(mediaItem.statistics.likeCount), likeCountBinEdges),
    'statistics-dislikeCount': binningDelegate('statistics-dislikeCount', parseInt(mediaItem.statistics.dislikeCount), dislikeCountBinEdges),
    'statistics-favoriteCount': binningDelegate('statistics-favoriteCount', parseInt(mediaItem.statistics.favoriteCount), favoriteCountBinEdges),
    'statistics-commentCount': binningDelegate('statistics-commentCount', parseInt(mediaItem.statistics.commentCount), commentCountBinEdges),
    'snippet-publishedAt': mediaItem.snippet.publishedAt,
    'snippet-channelId': [mediaItem.snippet.channelId],
    'snippet-title': [mediaItem.snippet.title],
    'snippet-description': [mediaItem.snippet.description],
    'snippet-channelTitle': [mediaItem.snippet.channelTitle],
    'snippet-thumbnails': [JSON.stringify(mediaItem.snippet.thumbnails)],
    'snippet-tags': mediaItem.snippet.tags,
    'snippet-categoryId': mediaItem.snippet.categoryId,
    'snippet-liveBroadcastContent': [mediaItem.snippet.liveBroadcastContent],
    'snippet-defaultLanguage': mediaItem.snippet.defaultLanguage,
    'snippet-localized': mediaItem.snippet.localized ? [JSON.stringify(mediaItem.snippet.localized)] : [],
    'snippet-defaultAudioLanguage': mediaItem.snippet.defaultAudioLanguage ? [mediaItem.snippet.defaultAudioLanguage] : [],
    'liveStreamingDetails-actualStartTime': mediaItem.liveStreamingDetails ? [mediaItem.liveStreamingDetails.actualStartTime] : [],
    'liveStreamingDetails-actualEndTime': mediaItem.liveStreamingDetails ? [mediaItem.liveStreamingDetails.actualEndTime] : [],
    'liveStreamingDetails-scheduledStartTime': mediaItem.liveStreamingDetails ? [mediaItem.liveStreamingDetails.scheduledStartTime] : [],
    'liveStreamingDetails-scheduledEndTime': mediaItem.liveStreamingDetails ? [mediaItem.liveStreamingDetails.scheduledEndTime] : [],
    'liveStreamingDetails-concurrentViewers': mediaItem.liveStreamingDetails ? binningDelegate('liveStreamingDetails-concurrentViewers', parseInt(mediaItem.liveStreamingDetails.concurrentViewers), concurrentViewCountBinEdges) : [],
    'liveStreamingDetails-activeLiveChatId': mediaItem.liveStreamingDetails ? [mediaItem.liveStreamingDetails.activeLiveChatId] : [],
    'artists-ids': mediaItem.ArtistsIds,
    'genres': mediaItem.ArtistsGenres,
    'artists-names': mediaItem.ArtistsNames,
    'artists-popularity': _.map(mediaItem.ArtistsPopularity, popularity => `${popularity}`),
    'relatedItems': mediaItem.relatedArtists,
    'artists-type': mediaItem.ArtistsType,
    'item-isRemoved': mediaItem.isRemoved ? ['true'] : ['false']
  }

  return recommenderMediaItem
}

exports.convertArtistToRecommenderArtist = function convertArtistToRecommenderArtist (artist, relatedArtists) {
  const recommenderArtist = {
    'itemType': ['artist'],
    'artists-ids': [artist.id],
    'genres': artist.genres,
    'artists-names': [artist.name],
    'artists-popularity': binningDelegate('artists-popularity', [artist.popularity], artistPopularityBinEdges),
    'artists-followers': binningDelegate('artists-followers', artist.followers.total, artistFollowersBinEdges),
    'relatedItems': relatedArtists,
    'artists-type': [artist.type],
    'item-isRemoved': artist.isRemoved ? ['true'] : ['false']
  }
  return recommenderArtist
}

exports.convertGenreToRecommenderGenreItem = function convertGenreToRecommenderGenreItem (genre) {
  const recommenderGenre = {
    'itemType': ['genre'],
    'genres': genre.leaves,
    'childrenItems': genre.children,
    'snippet-thumbnails': ['genre.thumbnails'],
    'item-isRemoved': genre.isRemoved ? ['true'] : ['false']
  }

  return recommenderGenre
}

exports.writeBufferedItemsToRecommender = function writeBufferedItemsToRecommender (bufferedItems) {
  const itemPropertyAddRequest = from(bufferedItems).pipe(
    map(({ id, recommenderItem }) => {
      const serializedRecommenderItem = {
        iid: id,
        properties: {
          ...recommenderItem
        }
      }
      return serializedRecommenderItem
    }),
    concatMap(serializedRecommenderItem => from(predictionioClient.createItem(serializedRecommenderItem))),
    retry(RETRY_COUNT)
  )

  return itemPropertyAddRequest
}

exports.markBufferedItemsRecSysSynced = function markBufferedItemsRecSysSynced (bufferedItems, model) {
  const ids = _.map(bufferedItems, ({ id }) => id)

  const dbUpdateBatchRequest = from(ids).pipe(
    concatMap(id => {
      const dbUpdateRequest = from(model.findById(id)).pipe(
        map(item => {
          switch (model.modelName) {
            case 'enrichedArtist':
              item.isArtistRecSysSynced = true
              break
            case 'ytVideo':
              item.isVideoRecSysSynced = true
              break
            case 'ytBroadcast':
              item.isBroadcastRecSysSynced = true
              break
          }
          return item
        }),
        concatMap(item => from(model.replaceOrCreate(item))),
        map((item) => {
          let snippet
          switch (model.modelName) {
            case 'enrichedArtist':
              const { artist } = item
              console.log(`Added in Recommender, artistItem: ${artist.name}`)
              break
            case 'ytVideo':
              snippet = item.snippet
              console.log(`Added in Recommender, videoItem: ${snippet.title}`)
              break
            case 'ytBroadcast':
              snippet = item.snippet
              console.log(`Added in Recommender, broadcastItem: ${snippet.title}`)
              break
          }
        })
      )
      return dbUpdateRequest
    })
  )

  return dbUpdateBatchRequest
}

exports.markJsonFileRecSysSynced = function markJsonFileRecSysSynced (filePath, { ...jsonDataObject }) {
  switch (jsonDataObject.type) {
    case 'genre':
      jsonDataObject.areGenresRecSysSynced = true
      break
    case 'synthetic-seed':
      jsonDataObject.isSyntheticSeedRecSysSynced = true
      break
  }

  return bindNodeCallback(fs.writeFile)(filePath, `${JSON.stringify(jsonDataObject, null, 2)}\n`, 'utf8').pipe(
    concatMap(val => {
      console.log('Finished syncing relevant data objects of JSON file with recommender.')
      return from(EMPTY)
    })
  )
}

exports.peekEvents = function peekEvents (optionalParams) {
  const { limit = 10, ...otherOptions } = optionalParams

  predictionioClient.getEvents({ limit, ...otherOptions })
    . then(function (result) {
      console.log(result)
    })
    . catch(function (err) {
      console.error(err) // Something went wrong
    })
}

exports.predictionioClient = predictionioClient

function binningDelegate (jsonFieldName, dataPoint, [...binEdges]) {
  switch (jsonFieldName) {
    case 'contentDetails-duration':
      return binDuration(dataPoint, binEdges)
    default:
      if (R.is(Number, dataPoint)) {
        return binNumber(dataPoint, binEdges)
      } else {
        const curriedBinNumber = R.curry(binNumber)
        const binMapper = curriedBinNumber(R.__, binEdges)

        return R.map(binMapper, dataPoint)
      }
  }

  function binNumber (dataPoint, [...binEdges]) {
    const binnedNumbers = R.compose(R.filter, R.gte)(dataPoint)(binEdges)

    const stringifiedBinnedNumbers = R.map(R.toString, R.concat(binnedNumbers, [dataPoint]))

    return stringifiedBinnedNumbers
  }

  function binDuration (dataPoint, [...binEdges]) {
    const durationInSeconds = moment.duration(dataPoint).asSeconds()

    return binNumber(durationInSeconds, binEdges)
  }
}
