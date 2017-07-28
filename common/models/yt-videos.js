'use strict'

const app = require('../../server/server')
const Rx = require('rxjs')
const _ = require('lodash')
const loginAssist = require('../../lib/login-assist')
const classifier = require('../../lib/classifier').logClassifier()

module.exports = function (ytVideos) {
  const youtube = loginAssist.ytLogin()

  ytVideos.putArtistsLive = async function (callback) {
    const artists = await findArtistsByPopularity(70, 100)
    // putArtistsAlbumsLive(artists)

    searchYtVideos('lana del rey live', 200).subscribe(x => {
      console.log(x.snippet.title)
    })

    /* ytVideos.pluck('id', 'videoId').bufferCount(10).concatMap((id) => {
     return getVideos(id.join())
     }).subscribe(x => console.log(JSON.stringify(x, null, 2)))*/

    // getYtPlaylistVideos('PLE23710E948D187C0').subscribe(x => console.log(x))
    // TODO
    callback(null)
  }

  function getVideos (ids) {
    const videoCaller = Rx.Observable.bindNodeCallback(youtube.getById)
    return videoCaller(ids)
  }

  function getYtPlaylistItems (id) {
    let nextPageToken
    const itemsFunction = Rx.Observable.bindNodeCallback(youtube.getPlayListsItemsById)
    const itemInitialResult = itemsFunction(id, 50).do(x => {
      nextPageToken = x.nextPageToken
    }).pluck('items').concatMap(result => Rx.Observable.from(result))

    const itemSubsequentResults = Rx.Observable.range(1, 100).concatMap(x => {
      const itemResult = itemsFunction(id, 50, {pageToken: nextPageToken}).takeWhile(x => nextPageToken).do(x => { nextPageToken = x.nextPageToken })
      return itemResult
    }).pluck('items').concatMap(result => Rx.Observable.from(result))

    const playlistItems = Rx.Observable.concat(itemInitialResult, itemSubsequentResults).filter(result => filterVideoByTitle(result))
    return playlistItems
  }

  function getYtPlaylistVideos (id) {
    const playlistItems = getYtPlaylistItems(id)

    const videoContentDetailsAndStats = playlistItems.pluck('snippet', 'resourceId', 'videoId').bufferCount(50).concatMap((ids) => {
      return getVideos(ids.join())
    }).pluck('items').concatMap((item) => Rx.Observable.from(item))

    const playlistVideos = Rx.Observable.zip(playlistItems, videoContentDetailsAndStats, (playlistItem, detailedStat) => {
      detailedStat.snippet = playlistItem.snippet
      return detailedStat
    })
    return playlistVideos
  }

  function searchYtVideos (query, maxresults) {
    const ytVideos = searchYt(query, maxresults, 'video').filter(result => filterVideoByTitle(result))

    const videoContentDetailsAndStats = ytVideos.pluck('id', 'videoId').bufferCount(50).concatMap((ids) => {
      return getVideos(ids.join())
    }).pluck('items').concatMap((item) => Rx.Observable.from(item))

    const detailedYtVideos = Rx.Observable.zip(ytVideos, videoContentDetailsAndStats, (video, detailedStat) => {
      detailedStat.snippet = video.snippet
      return detailedStat
    })
    return detailedYtVideos
  }

  function searchYt (query, maxresults, type) {
    const resultModules = maxresults % 50
    const resultDivision = _.floor(maxresults / 50)
    let nextPageToken
    const searchObservable = Rx.Observable.bindNodeCallback(youtube.search)

    const moduloResults = searchObservable(query, resultModules, {regionCode: 'US', type: type}).do((result) => {
      nextPageToken = result.nextPageToken
    }).pluck('items').concatMap((results) => Rx.Observable.from(results))

    const divisionResults = Rx.Observable.zip(Rx.Observable.range(1, resultDivision), Rx.Observable.timer(0, 100))
      .concatMap(([range, timer]) => {
        const searchResults = searchObservable(query, 50, {
          pageToken: nextPageToken,
          regionCode: 'US',
          type: type
        }).do((result) => {
          nextPageToken = result.nextPageToken
        }).concatMap(result => Rx.Observable.from(result.items))
        return searchResults
      })
    return Rx.Observable.concat(moduloResults, divisionResults)
  }

  async function findArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtists = app.models.enrichedArtists
    const filter = {
      where: {and: [{or: [{isCrawled: false}, {isCrawled: {exists: false}}]}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artists: true, topTracks: true, albums: true}
    }
    const artists = await
      enrichedArtists.find(filter)
    return artists
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

  function putArtistsTopTracksLive (artists) {
    const tracks = _.flatMapDeep(artists, (artist) => {
      const track = _.flatMap(_.compact(artist.topTracks), track => track.track)
      return track
    })
    const truncatedTracks = _.map(_.compact(tracks), ({id, name, popularity}) => {
      return {id, name, popularity}
    })

    const uniqueTruncatedTracks = _.uniqBy(truncatedTracks, 'id')
    console.log(JSON.stringify(uniqueTruncatedTracks, null, 1))
  }

  function putArtistsAlbumsLive (artists) {
    const albums = _.flatMapDeep(artists, artist => artist.albums)
    const truncatedAlbums = _.map(_.compact(albums), ({name, popularity, id}) => {
      return {name, popularity, id}
    })
    const uniqueTruncatedAlbums = _.uniqBy(truncatedAlbums, 'id')
    // const topAlbums = _.filter(uniqueTruncatedAlbums, album => album.popularity >= 26 && album.popularity < 40)
    console.log(JSON.stringify(uniqueTruncatedAlbums, null, 1))
  }
}
