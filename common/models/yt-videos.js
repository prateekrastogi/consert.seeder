'use strict'

const app = require('../../server/server')
const Rx = require('rxjs')
const _ = require('lodash')
const loginAssist = require('../../lib/login-assist')
const classifier = require('../../lib/classifier').logClassifier()

// Building caches to minimize network calls and its associated cost
let searchCache = []
let playlistItemCache = []

module.exports = function (ytVideos) {
  const youtube = loginAssist.ytLogin()

  ytVideos.putArtistsVideosLive = async function (lowerBound, upperBound, callback) {
    const enrichedArtists = app.models.enrichedArtists
    let maxResults  // max results per search query

    switch (lowerBound) {
      case 70:
        maxResults = 150
        break
      case 60:
        maxResults = 100
        break
      case 44:
        maxResults = 50
        break
      default:
        maxResults = 50
    }

    const artists = await findVideoUnCrawledArtistsByPopularity(lowerBound, upperBound)

    const topArtists = Rx.Observable.from(artists)
    let count = 0

    topArtists.concatMap((artist) => {
      const artistName = artist.artist.name
      console.log(`Total artists crawled: ${count}`)
      count++
      console.log(`Crawling the artist: ${artistName}`)
      const queries = [`${artistName} live`, `${artistName} concert`, `${artistName} live performance`]

      const videoResult = searchYtVideos(queries, maxResults)

      const enrichedArtistInstance = Rx.Observable.fromPromise(enrichedArtists.findById(artist.id))

      const enrichedArtistVideoCrawledSetter = enrichedArtistInstance.map((enrichedArtist) => {
        enrichedArtist.areArtistVideosCrawled = true
        return enrichedArtist
      }).concatMap((updatedEnrichedArtist) => Rx.Observable.fromPromise(enrichedArtists.replaceOrCreate(updatedEnrichedArtist)))
        .concatMap((obj) => Rx.Observable.empty())

      const resultWithArtistId = videoResult.map(result => {
        return {result: result, artistId: artist.id}
      })

      // Marking the artist as crawled after all its search result returned.
      const resultWithArtistIdAndCrawlMarked = Rx.Observable.concat(resultWithArtistId, enrichedArtistVideoCrawledSetter)

      return resultWithArtistIdAndCrawlMarked
    }).subscribe(async (result) => {
      const updatedVideo = await videoObjectUpdater(result.result, {artists: result.artistId})
      await ytVideos.replaceOrCreate(updatedVideo)
    })

    // TODO
    callback(null)
  }

  ytVideos.setArtistsByPopularityForVideoReCrawl = async function (lowerBound, upperBound, callback) {
    const artistIds = await findVideoCrawledArtistsByPopularity(lowerBound, upperBound)
    const enrichedArtists = app.models.enrichedArtists

    Rx.Observable.from(artistIds).pluck('id').concatMap(id => Rx.Observable.fromPromise(enrichedArtists.findById(id)))
      .concatMap((enrichedArtistInstance) => {
        enrichedArtistInstance.areArtistVideosCrawled = false
        return Rx.Observable.fromPromise(enrichedArtists.replaceOrCreate(enrichedArtistInstance))
      }).subscribe((artist) => console.log(`Artist marked for re-crawling: ${artist.artist.name}`))

    // TODO
    callback(null)
  }

  function getYtPlaylistItems (id) {
    const cachedResult = _.remove(playlistItemCache, ['id', id])
    if (cachedResult.length !== 0) {
      return cachedResult[0].items
    }

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

    // Building the cache
    playlistItemCache = _.concat(playlistItemCache, {id: id, items: playlistItems})

    return playlistItems
  }

  function getYtPlaylistVideos (id) {
    const playlistItems = getYtPlaylistItems(id)

    const playlistIds = getYtPlaylistItems(id).pluck('snippet', 'resourceId', 'videoId').bufferCount(50)

    const videoContentDetailsAndStats = playlistIds.concatMap((ids) => {
      return getVideos(ids.join())
    }).pluck('items').concatMap((item) => Rx.Observable.from(item))

    const playlistVideos = Rx.Observable.zip(playlistItems, videoContentDetailsAndStats, (playlistItem, detailedStat) => {
      detailedStat.snippet = playlistItem.snippet
      return detailedStat
    })
    return playlistVideos
  }

  function searchYtVideos (queries, maxresults) {
    const queryObservable = Rx.Observable.from(queries)

    const ytVideos = queryObservable.mergeMap(query => searchYt(query, maxresults, 'video').filter(result => filterVideoByTitle(result)))
      .distinct(value => value.id.videoId)

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
    /* Each independent execution of observable issues separate api calls so we are incurring calls while zipping and getting video stats.
     * Cache for the a query expires after just single hit coz zipping involves only two independent executions, if needed more in future change here */
    const cachedResult = _.remove(searchCache, ['query', query])
    if (cachedResult.length !== 0) {
      return cachedResult[0].result
    }

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
    const searchResult = Rx.Observable.concat(moduloResults, divisionResults)

    // Building the cache
    searchCache = _.concat(searchCache, {query: query, result: searchResult})

    return searchResult
  }

  function getVideos (ids) {
    const videoCaller = Rx.Observable.bindNodeCallback(youtube.getById)
    return videoCaller(ids)
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

  async function videoObjectUpdater (video, {artists, albums, tracks}) {
    const videoInstance = await ytVideos.findById(video.id)
    if (videoInstance !== null) {
      artists = _.union(artists, videoInstance.artists)
      albums = _.union(albums, videoInstance.albums)
      tracks = _.union(tracks, videoInstance.tracks)
    }

    video.artists = _.castArray(artists)
    video.albums = _.castArray(albums)
    video.tracks = _.castArray(tracks)
    return video
  }

  async function findVideoUnCrawledArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtists = app.models.enrichedArtists
    const filter = {
      where: {and: [{or: [{areArtistVideosCrawled: false}, {areArtistVideosCrawled: {exists: false}}]}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: true, topTracks: false, albums: false}
    }
    const artists = await enrichedArtists.find(filter)
    return artists
  }

  async function findVideoCrawledArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtists = app.models.enrichedArtists
    const filter = {
      where: {and: [{'areArtistVideosCrawled': true}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: false, topTracks: false, albums: false}
    }
    const artists = await enrichedArtists.find(filter)
    return artists
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
