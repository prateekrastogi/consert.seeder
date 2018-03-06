'use strict'

const app = require('../../server/server')
const Rx = require('rxjs')
const _ = require('lodash')
const ytUtils = require('../../lib/yt-utils')

const terminateAllActiveInterferingSubscriptions = require('../../lib/misc-utils').terminateAllActiveInterferingSubscriptions

const RETRY_COUNT = 3

let activeSubscriptions = []

module.exports = function (ytVideo) {
  ytVideo.putArtistsVideosLive = async function (lowerBound, upperBound) {
    const enrichedArtist = app.models.enrichedArtist
    let maxResults // max results per search query

    switch (lowerBound) {
      case 70:
        maxResults = 350
        break
      case 60:
        maxResults = 250
        break
      case 44:
        maxResults = 150
        break
      default:
        maxResults = 50
    }

    const artists = await findVideoUnCrawledArtistsByPopularity(lowerBound, upperBound)

    const topArtists = Rx.Observable.from(artists)
    let count = 0

    const artistsVideoLivePuttingObservable = topArtists.mergeMap((artist) => {
      const artistName = artist.artist.name
      console.log(`Total artists crawled: ${count}`)
      count++
      console.log(`Crawling the artist: ${artistName}`)
      const queries = [`${artistName} live | ${artistName} concert | ${artistName} live performance`]

      const params = { type: `video`, topicId: `/m/04rlf`, regionCode: `US`, safeSearch: `none`, videoEmbeddable: `true`, videoSyndicated: `true` }

      const videoResult = ytUtils.searchYtVideos(queries, maxResults, params).retry(RETRY_COUNT)

      const enrichedArtistInstance = Rx.Observable.fromPromise(enrichedArtist.findById(artist.id))

      const enrichedArtistVideoCrawledSetter = enrichedArtistInstance.map((enrichedArtist) => {
        enrichedArtist.areArtistVideosCrawled = true
        return enrichedArtist
      }).concatMap((updatedEnrichedArtist) => Rx.Observable.fromPromise(enrichedArtist.replaceOrCreate(updatedEnrichedArtist)))
        .concatMap((obj) => Rx.Observable.empty())

      const resultWithArtistId = videoResult.map(result => {
        return {result: result, artistId: artist.id}
      })

      // Marking the artist as crawled after all its search result returned.
      const resultWithArtistIdAndCrawlMarked = Rx.Observable.concat(resultWithArtistId, enrichedArtistVideoCrawledSetter)

      return resultWithArtistIdAndCrawlMarked
    }, 4)

    const safeArtistsVideoLivePuttingObservable = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(activeSubscriptions), artistsVideoLivePuttingObservable)

    const putArtistsVideosLiveSubscription = safeArtistsVideoLivePuttingObservable.subscribe({
      next: async (result) => {
        const updatedVideo = await videoObjectUpdater(result.result, {artists: result.artistId})
        await ytVideo.replaceOrCreate(updatedVideo)
      },
      error: err => console.log(err)})

    activeSubscriptions.push(putArtistsVideosLiveSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  ytVideo.setArtistsByPopularityForVideoReCrawl = async function (lowerBound, upperBound) {
    const artistIds = await findVideoCrawledArtistsByPopularity(lowerBound, upperBound)
    const enrichedArtist = app.models.enrichedArtist

    const reCrawlingObservable = Rx.Observable.from(artistIds).pluck('id').concatMap(id => Rx.Observable.fromPromise(enrichedArtist.findById(id)))
      .concatMap((enrichedArtistInstance) => {
        enrichedArtistInstance.areArtistVideosCrawled = false
        return Rx.Observable.fromPromise(enrichedArtist.replaceOrCreate(enrichedArtistInstance))
      })

    const safeReCrawlingObservable = Rx.Observable.concat(terminateAllActiveInterferingSubscriptions(activeSubscriptions), reCrawlingObservable)

    const setArtistsByPopularityForVideoReCrawlSubscription = safeReCrawlingObservable
      .subscribe((artist) => console.log(`Artist marked for re-crawling: ${artist.artist.name}`))

    activeSubscriptions.push(setArtistsByPopularityForVideoReCrawlSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  async function videoObjectUpdater (video, {artists, albums, tracks}) {
    const videoInstance = await ytVideo.findById(video.id)
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
    const enrichedArtist = app.models.enrichedArtist
    const filter = {
      where: {and: [{or: [{areArtistVideosCrawled: false}, {areArtistVideosCrawled: {exists: false}}]}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: true, topTracks: false, albums: false}
    }
    const artists = await enrichedArtist.find(filter)
    return artists
  }

  async function findVideoCrawledArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtist = app.models.enrichedArtist
    const filter = {
      where: {and: [{'areArtistVideosCrawled': true}, {'artist.popularity': {'gte': lowerBound}}, {'artist.popularity': {'lt': upperBound}}]},
      fields: {id: true, artist: true, topTracks: false, albums: false}
    }
    const artists = await enrichedArtist.find(filter)
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
