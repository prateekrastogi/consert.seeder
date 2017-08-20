'use strict'

const recombeeClient = require('../lib/login-assist').recombeeLogin()
const recombeeRqs = require('recombee-api-client').requests
const Rx = require('rxjs')

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

    const result = Rx.Observable.concat( itemType, kind, etag, contentDetailsDuration, contentDetailsDimension, contentDetailsDefinition, contentDetailsLicensedContent, contentDetailsCaption, contentDetailsProjection,
      statisticsViewCount, statisticsLikeCount, statisticsDisLikeCount, statisticsFavoriteCount, statisticsCommentCount, snippetPublishedAt, snippetChannelId,
      snippetTitle, snippetDescription, snippetChannelTitle, snippetThumbnails, snippetliveBroadcastContent, artistsIds, artistsGenres, artistsNames,
      artistsPopularity, artistsFollowers, artistsType)

    return result
  }

}
