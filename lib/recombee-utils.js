'use strict'

const _ = require('lodash')
const recombeeClient = require('./login-assist').recombeeLogin()
const recombeeRqs = require('recombee-api-client').requests
const Rx = require('rxjs')

const RETRY_COUNT = 3

exports.convertVideoToRecombeeVideo = function convertVideoToRecombeeVideo (video) {
  const recombeeVideo = {
    'itemType': 'video',
    'kind': video.kind,
    'etag': video.etag,
    'contentDetails-duration': video.contentDetails.duration,
    'contentDetails-dimension': video.contentDetails.dimension,
    'contentDetails-definition': video.contentDetails.definition,
    'contentDetails-caption': video.contentDetails.caption,
    'contentDetails-licensedContent': video.contentDetails.licensedContent,
    'contentDetails-projection': video.contentDetails.projection,
    'statistics-viewCount': video.statistics.viewCount,
    'statistics-likeCount': video.statistics.likeCount,
    'statistics-dislikeCount': video.statistics.dislikeCount,
    'statistics-favoriteCount': video.statistics.favoriteCount,
    'statistics-commentCount': video.statistics.commentCount,
    'snippet-publishedAt': video.snippet.publishedAt,
    'snippet-channelId': video.snippet.channelId,
    'snippet-title': video.snippet.title,
    'snippet-description': video.snippet.description,
    'snippet-channelTitle': video.snippet.channelTitle,
    'snippet-thumbnails': video.snippet.thumbnails,
    'snippet-liveBroadcastContent': video.snippet.liveBroadcastContent,
    'artists-ids': video.ArtistsIds,
    'genres': video.ArtistsGenres,
    'artists-names': video.ArtistsNames,
    'artists-popularity': _.map(video.ArtistsPopularity, popularity => `${popularity}`),  // https://github.com/Recombee/node-api-client/issues/3
    'artists-followers': _.map(video.ArtistsFollowers, followers => `${followers}`),
    'artists-relatedArtists': video.relatedArtists,
    'artists-type': video.ArtistsType
  }

  return recombeeVideo
}

exports.convertArtistToRecombeeArtist = function convertArtistToRecombeeArtist (artist, relatedArtists) {
  const recombeeArtist = {
    'itemType': 'artist',
    'artists-ids': [artist.id],
    'genres': artist.genres,
    'artists-names': [artist.name],
    'artists-popularity': [`${artist.popularity}`],     // https://github.com/Recombee/node-api-client/issues/3
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
          item.isArtistRecombeeSynced = true
          break
        case 'ytVideo':
          item.isVideoRecombeeSynced = true
          break
      }
      return item
    }).concatMap(item => Rx.Observable.fromPromise(model.replaceOrCreate(item))).map((item) => {
      switch (model.modelName) {
        case 'enrichedArtist':
          const {artist} = item
          console.log(`Adding in Recombee, artistItem: ${artist.name}`)
          break
        case 'ytVideo':
          const {snippet} = item
          console.log(`Adding in Recombee, videoItem: ${snippet.title}`)
          break
      }
    })
    return dbUpdateRequest
  })
  const result = Rx.Observable.concat(itemPropertyAddBatchRequest, dbUpdateBatchRequest)
  return result
}
