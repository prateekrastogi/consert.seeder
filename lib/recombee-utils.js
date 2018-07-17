'use strict'

const _ = require('lodash')
const recombeeClient = require('./login-assist').recombeeLogin()
const recombeeRqs = require('recombee-api-client').requests
const Rx = require('rxjs-compat')

const RETRY_COUNT = 3

exports.convertMediaItemToRecombeeItem = function convertMediaItemToRecombeeItem (mediaItem) {
  const recombeeItem = {
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
    'artists-popularity': _.map(mediaItem.ArtistsPopularity, popularity => `${popularity}`), // https://github.com/Recombee/node-api-client/issues/3
    'artists-followers': _.map(mediaItem.ArtistsFollowers, followers => `${followers}`),
    'artists-relatedArtists': mediaItem.relatedArtists,
    'artists-type': mediaItem.ArtistsType,
    'item-isRemoved': mediaItem.isRemoved
  }

  return recombeeItem
}

exports.convertArtistToRecombeeArtist = function convertArtistToRecombeeArtist (artist, relatedArtists) {
  const recombeeArtist = {
    'itemType': 'artist',
    'artists-ids': [artist.id],
    'genres': artist.genres,
    'artists-names': [artist.name],
    'artists-popularity': [`${artist.popularity}`], // https://github.com/Recombee/node-api-client/issues/3
    'artists-followers': [`${artist.followers.total}`],
    'artists-relatedArtists': relatedArtists,
    'artists-type': [artist.type]
  }
  return recombeeArtist
}

exports.writeBufferedItemsToRecommbee = function writeBufferedItemsToRecommbee (bufferedItems, model) {
  const rqs = _.map(bufferedItems, ({recombeeItem, id}) => new recombeeRqs.SetItemValues(id, recombeeItem, {'cascadeCreate': true}))
  const itemPropertyAddBatchRequest = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.Batch(rqs))).retry(RETRY_COUNT)

  const ids = _.map(bufferedItems, ({id}) => id)

  const dbUpdateBatchRequest = Rx.Observable.from(ids).concatMap(id => {
    const dbUpdateRequest = Rx.Observable.fromPromise(model.findById(id)).map(item => {
      switch (model.modelName) {
        case 'enrichedArtist':
          item.isArtistRecSysSynced = true
          break
        case 'ytVideo':
          item.isVideoRecombeeSynced = true
          break
        case 'ytBroadcast':
          item.isBroadcastRecSysSynced = true
          break
      }
      return item
    }).concatMap(item => Rx.Observable.fromPromise(model.replaceOrCreate(item))).map((item) => {
      let snippet
      switch (model.modelName) {
        case 'enrichedArtist':
          const {artist} = item
          console.log(`Adding in Recombee, artistItem: ${artist.name}`)
          break
        case 'ytVideo':
          snippet = item.snippet
          console.log(`Adding in Recombee, videoItem: ${snippet.title}`)
          break
        case 'ytBroadcast':
          snippet = item.snippet
          console.log(`Adding in Recombee, broadcastItem: ${snippet.title}`)
          break
      }
    })
    return dbUpdateRequest
  })
  const result = Rx.Observable.concat(itemPropertyAddBatchRequest, dbUpdateBatchRequest)
  return result
}
