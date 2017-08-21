'use strict'

const recombeeClient = require('../lib/login-assist').recombeeLogin()
const recombeeRqs = require('recombee-api-client').requests
const Rx = require('rxjs')
const _ = require('lodash')

module.exports = {

  resetDatabase: function resetDatabase () {
    recombeeClient.send(new recombeeRqs.ResetDatabase(), (err, result) => err ? console.log('Some error occurred while resetting db') : console.log('Database reset successful'))
  },

  setItemProperties: function setItemProperties () {
    const itemType = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('itemType', 'string')))
    const kind = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('kind', 'string')))
    const etag = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('etag', 'string')))
    const contentDetailsDuration = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-duration', 'string')))
    const contentDetailsDimension = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-dimension', 'string')))
    const contentDetailsDefinition = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-definition', 'string')))
    const contentDetailsCaption = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-caption', 'string')))
    const contentDetailsLicensedContent = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-licensedContent', 'boolean')))
    const contentDetailsProjection = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('contentDetails-projection', 'string')))
    const statisticsViewCount = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('statistics-viewCount', 'string')))
    const statisticsLikeCount = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('statistics-likeCount', 'string')))
    const statisticsDisLikeCount = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('statistics-dislikeCount', 'string')))
    const statisticsFavoriteCount = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('statistics-favoriteCount', 'string')))
    const statisticsCommentCount = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('statistics-commentCount', 'string')))
    const snippetPublishedAt = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-publishedAt', 'timestamp')))
    const snippetChannelId = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-channelId', 'string')))
    const snippetTitle = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-title', 'string')))
    const snippetDescription = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-description', 'string')))
    const snippetChannelTitle = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-channelTitle', 'string')))
    const snippetThumbnails = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-thumbnails', 'string')))
    const snippetliveBroadcastContent = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('snippet-liveBroadcastContent', 'string')))
    const artistsIds = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-ids', 'set')))
    const artistsGenres = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-genres', 'set')))
    const artistsNames = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-names', 'set')))
    const artistsPopularity = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-popularity', 'set')))
    const artistsFollowers = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-followers', 'set')))
    const artistsType = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.AddItemProperty('artists-type', 'string')))

    const result = Rx.Observable.concat(itemType, kind, etag, contentDetailsDuration, contentDetailsDimension, contentDetailsDefinition, contentDetailsLicensedContent, contentDetailsCaption, contentDetailsProjection,
      statisticsViewCount, statisticsLikeCount, statisticsDisLikeCount, statisticsFavoriteCount, statisticsCommentCount, snippetPublishedAt, snippetChannelId,
      snippetTitle, snippetDescription, snippetChannelTitle, snippetThumbnails, snippetliveBroadcastContent, artistsIds, artistsGenres, artistsNames,
      artistsPopularity, artistsFollowers, artistsType)

    return result
  },

  convertArtistToRecombeeArtist: function convertArtistToRecombeeArtist (artist) {
    const recombeeArtist = {
      'itemType': 'artist',
      'artists-ids': [artist.id],
      'artists-genres': artist.genres,
      'artists-names': [artist.name],
      'artists-popularity': [`${artist.popularity}`],
      'artists-followers': [`${artist.followers.total}`],
      'artists-type': artist.type
    }
    return recombeeArtist
  },

  convertVideoToRecombeeVideo: function convertVideoToRecombeeVideo (video) {
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
      'artists-genres': video.ArtistsGenres,
      'artists-names': video.ArtistsNames,
      'artists-popularity': video.ArtistsPopularity,
      'artists-followers': video.ArtistsFollowers,
      'artists-type': video.ArtistsType
    }

    return recombeeVideo
  },

  writeBufferedItemsToRecommbee: function writeBufferedItemsToRecommbee (bufferedItems, model) {
    const rqs = _.map(bufferedItems, ({recombeeItem, id}) => new recombeeRqs.SetItemValues(id, recombeeItem, {'cascadeCreate': true}))
    const itemPropertyAddBatchRequest = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.Batch(rqs)))

    const ids = _.map(bufferedItems, ({id}) => id)

    const dbUpdateBatchRequest = Rx.Observable.from(ids).concatMap(id => {
      const dbUpdateRequest = Rx.Observable.fromPromise(model.findById(id)).map(item => {
        switch (model.modelName) {
          case 'enrichedArtists':
            item.isArtistRecombeeSynced = true
            break
          case 'ytVideos':
            item.isVideoRecombeeSynced = true
            break
        }
        return item
      }).concatMap(item => Rx.Observable.fromPromise(model.replaceOrCreate(item))).map((item) => {
        switch (model.modelName) {
          case 'enrichedArtists':
            const {artist} = item
            console.log(`Adding in Recombee, artistItem: ${artist.name}`)
            break
          case 'ytVideos':
            const {snippet} = item
            console.log(`Adding in Recombee, videoItem: ${snippet.title}`)
            break
        }
      })
      return dbUpdateRequest
    })

    const result = Rx.Observable.concat(itemPropertyAddBatchRequest, dbUpdateBatchRequest)
    return result
  },

  setModelItemsForReSync: function setModelItemsForReSync (itemsObservable, model) {
    return itemsObservable.concatMap(items => Rx.Observable.from(items)).concatMap(({id}) => Rx.Observable.fromPromise(model.findById(id)))
      .map((item) => {
        switch (model.modelName) {
          case 'enrichedArtists':
            item.isArtistRecombeeSynced = false
            break
          case 'ytVideos':
            item.isVideoRecombeeSynced = false
            break
        }
        return item
      }).concatMap(item => Rx.Observable.fromPromise(model.replaceOrCreate(item)))
  }
}
