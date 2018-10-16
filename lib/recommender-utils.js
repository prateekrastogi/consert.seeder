'use strict'

const _ = require('lodash')
const predictionioClient = require('./login-assist').predictionioLogin()
const { from, concat } = require('rxjs')
const { concatMap, map, retry } = require('rxjs/operators')

const RETRY_COUNT = 3

exports.convertMediaItemToRecommenderMediaItem = function convertMediaItemToRecommenderMediaItem (mediaItem) {
  const recommenderMediaItem = {
    'itemType': mediaItem.liveStreamingDetails ? 'broadcast' : 'video',
    'kind': mediaItem.kind,
    'etag': mediaItem.etag,
    'contentDetails-duration': mediaItem.contentDetails.duration,
    'contentDetails-dimension': mediaItem.contentDetails.dimension,
    'contentDetails-definition': mediaItem.contentDetails.definition,
    'contentDetails-caption': mediaItem.contentDetails.caption,
    'contentDetails-licensedContent': mediaItem.contentDetails.licensedContent,
    'contentDetails-regionRestriction': mediaItem.contentDetails.regionRestriction,
    'contentDetails-contentRating': mediaItem.contentDetails.contentRating,
    'contentDetails-projection': mediaItem.contentDetails.projection,
    'contentDetails-hasCustomThumbnail': mediaItem.contentDetails.hasCustomThumbnail,
    'statistics-viewCount': mediaItem.statistics.viewCount,
    'statistics-likeCount': mediaItem.statistics.likeCount,
    'statistics-dislikeCount': mediaItem.statistics.dislikeCount,
    'statistics-favoriteCount': mediaItem.statistics.favoriteCount,
    'statistics-commentCount': mediaItem.statistics.commentCount,
    'snippet-publishedAt': mediaItem.snippet.publishedAt,
    'snippet-channelId': mediaItem.snippet.channelId,
    'snippet-title': mediaItem.snippet.title,
    'snippet-description': mediaItem.snippet.description,
    'snippet-channelTitle': mediaItem.snippet.channelTitle,
    'snippet-thumbnails': mediaItem.snippet.thumbnails,
    'snippet-tags': mediaItem.snippet.tags,
    'snippet-categoryId': mediaItem.snippet.categoryId,
    'snippet-liveBroadcastContent': mediaItem.snippet.liveBroadcastContent,
    'snippet-defaultLanguage': mediaItem.snippet.defaultLanguage,
    'snippet-localized': mediaItem.snippet.localized,
    'snippet-defaultAudioLanguage': mediaItem.snippet.defaultAudioLanguage,
    'liveStreamingDetails-actualStartTime': mediaItem.liveStreamingDetails ? mediaItem.liveStreamingDetails.actualStartTime : null,
    'liveStreamingDetails-actualEndTime': mediaItem.liveStreamingDetails ? mediaItem.liveStreamingDetails.actualEndTime : null,
    'liveStreamingDetails-scheduledStartTime': mediaItem.liveStreamingDetails ? mediaItem.liveStreamingDetails.scheduledStartTime : null,
    'liveStreamingDetails-scheduledEndTime': mediaItem.liveStreamingDetails ? mediaItem.liveStreamingDetails.scheduledEndTime : null,
    'liveStreamingDetails-concurrentViewers': mediaItem.liveStreamingDetails ? mediaItem.liveStreamingDetails.concurrentViewers : null,
    'liveStreamingDetails-activeLiveChatId': mediaItem.liveStreamingDetails ? mediaItem.liveStreamingDetails.activeLiveChatId : null,
    'artists-ids': mediaItem.ArtistsIds,
    'genres': mediaItem.ArtistsGenres,
    'artists-names': mediaItem.ArtistsNames,
    'artists-popularity': _.map(mediaItem.ArtistsPopularity, popularity => `${popularity}`),
    'relatedItems': mediaItem.relatedArtists,
    'artists-type': mediaItem.ArtistsType,
    'item-isRemoved': mediaItem.isRemoved
  }

  return recommenderMediaItem
}

exports.convertArtistToRecommenderArtist = function convertArtistToRecommenderArtist (artist, relatedArtists) {
  const recommenderArtist = {
    'itemType': 'artist',
    'artists-ids': [artist.id],
    'genres': artist.genres,
    'artists-names': [artist.name],
    'artists-popularity': [`${artist.popularity}`],
    'artists-followers': [`${artist.followers.total}`],
    'relatedItems': relatedArtists,
    'artists-type': [artist.type]
  }
  return recommenderArtist
}

exports.writeBufferedItemsToRecommender = function writeBufferedItemsToRecommender (bufferedItems, model) {
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
              console.log(`Adding in Recommender, artistItem: ${artist.name}`)
              break
            case 'ytVideo':
              snippet = item.snippet
              console.log(`Adding in Recommender, videoItem: ${snippet.title}`)
              break
            case 'ytBroadcast':
              snippet = item.snippet
              console.log(`Adding in Recommender, broadcastItem: ${snippet.title}`)
              break
          }
        })
      )
      return dbUpdateRequest
    })
  )
  const result = concat(itemPropertyAddRequest, dbUpdateBatchRequest)
  return result
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
