'use strict'

const app = require('../../server/server')
const _ = require('lodash')
const ytUtils = require('../../lib/yt-utils')
const { from, concat, timer, EMPTY } = require('rxjs')
const { concatMap, bufferCount, retry, pluck, timeoutWith, map, mergeMap } = require('rxjs/operators')

const terminateAllActiveInterferingSubscriptions = require('../../lib/misc-utils').terminateAllActiveInterferingSubscriptions
const getAllDbItemsObservable = require('../../lib/misc-utils').getAllDbItemsObservable

const RETRY_COUNT = 3
const MAX_BATCH = 5000
const REQUEST_BUFFER_SIZE = 50
const WAIT_TILL_NEXT_REQUEST = 5000
const POLLING_INTERVAL = 7 * 24 * 60 * 60 * 1000

let artistRelatedActiveSubscriptions = []
let unpublishedVideoRelatedActiveSubscriptions = []

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

    const topArtists = from(artists)
    let count = 0

    const artistsVideoLivePuttingObservable = topArtists.pipe(
      mergeMap((artist) => {
        const artistName = artist.artist.name
        console.log(`Total artists crawled: ${count}`)
        count++
        console.log(`Crawling the artist: ${artistName}`)
        const queries = [`${artistName} live | ${artistName} concert | ${artistName} live performance`]

        const params = { type: `video`, topicId: `/m/04rlf`, regionCode: `US`, safeSearch: `none`, videoEmbeddable: `true`, videoSyndicated: `true` }

        const videoResult = ytUtils.searchYtVideos(queries, maxResults, params).pipe(retry(RETRY_COUNT))

        const enrichedArtistInstance = from(enrichedArtist.findById(artist.id))

        const enrichedArtistVideoCrawledSetter = enrichedArtistInstance.pipe(
          map((enrichedArtist) => {
            enrichedArtist.areArtistVideosCrawled = true
            return enrichedArtist
          }),
          concatMap((updatedEnrichedArtist) => from(enrichedArtist.replaceOrCreate(updatedEnrichedArtist))),
          concatMap((obj) => EMPTY)
        )

        const resultWithArtistId = videoResult.pipe(
          map(result => {
            return { result: result, artistId: artist.id }
          })
        )

        // Marking the artist as crawled after all its search result returned.
        const resultWithArtistIdAndCrawlMarked = concat(resultWithArtistId, enrichedArtistVideoCrawledSetter)

        return resultWithArtistIdAndCrawlMarked
      }, 4)
    )

    const safeArtistsVideoLivePuttingObservable = concat(terminateAllActiveInterferingSubscriptions(artistRelatedActiveSubscriptions), artistsVideoLivePuttingObservable)

    const putArtistsVideosLiveSubscription = safeArtistsVideoLivePuttingObservable.subscribe({
      next: async (result) => {
        const updatedVideo = await videoObjectUpdater(result.result, { artists: result.artistId })
        await ytVideo.replaceOrCreate(updatedVideo)
      },
      error: err => console.error(err) })

    artistRelatedActiveSubscriptions.push(putArtistsVideosLiveSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  ytVideo.setArtistsByPopularityForVideoReCrawl = async function (lowerBound, upperBound) {
    const artistIds = await findVideoCrawledArtistsByPopularity(lowerBound, upperBound)
    const enrichedArtist = app.models.enrichedArtist

    const reCrawlingObservable = from(artistIds).pipe(
      pluck('id'),
      concatMap(id => from(enrichedArtist.findById(id))),
      concatMap((enrichedArtistInstance) => {
        enrichedArtistInstance.areArtistVideosCrawled = false
        return from(enrichedArtist.replaceOrCreate(enrichedArtistInstance))
      })
    )

    const safeReCrawlingObservable = concat(terminateAllActiveInterferingSubscriptions(artistRelatedActiveSubscriptions), reCrawlingObservable)

    const setArtistsByPopularityForVideoReCrawlSubscription = safeReCrawlingObservable
      .subscribe((artist) => console.log(`Artist marked for re-crawling: ${artist.artist.name}`),
        err => console.error(err))

    artistRelatedActiveSubscriptions.push(setArtistsByPopularityForVideoReCrawlSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  ytVideo.markUnpublishedVideos = function () {
    const removedItems = getAllDbItemsObservable(findNonRemovedVideosInBatch, WAIT_TILL_NEXT_REQUEST, MAX_BATCH).pipe(
      concatMap(videos => {
        return ytUtils.mapUnmappedYtItems(ytUtils.getVideoIdsByVideoIds, videos, RETRY_COUNT, REQUEST_BUFFER_SIZE, MAX_BATCH)
      }),
      concatMap(unMappedItems => from(unMappedItems)),
      pluck('id'),
      timeoutWith(12 * WAIT_TILL_NEXT_REQUEST, EMPTY),
      bufferCount()
    )

    const removedItemsDbSync = removedItems.pipe(
      concatMap(ids => from(ids)),
      concatMap(id => {
        const removedItemDbUpdate = from(ytVideo.findById(id))
          .pipe(concatMap(mediaItem => {
            mediaItem.isRemoved = true
            return from(ytVideo.replaceOrCreate(mediaItem))
          }))

        return removedItemDbUpdate
      })
    )

    const polledRemovedItemsDbSync = timer(0, POLLING_INTERVAL).pipe(concatMap(i => removedItemsDbSync))

    const safelyPolledRemovedItemsDbSync = concat(terminateAllActiveInterferingSubscriptions(unpublishedVideoRelatedActiveSubscriptions),
      polledRemovedItemsDbSync)

    const markUnpublishedVideosSubscription = safelyPolledRemovedItemsDbSync.subscribe({
      next: x => console.log(`Marked as removed, the video: ${x.snippet.title}`),
      error: err => console.error(err),
      complete: () => console.log(`markUnpublishedVideos emitted complete notification`)
    })

    unpublishedVideoRelatedActiveSubscriptions.push(markUnpublishedVideosSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  async function videoObjectUpdater (video, { artists, albums = [], tracks = [] }) {
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
      where: { and: [{ or: [{ areArtistVideosCrawled: false }, { areArtistVideosCrawled: { exists: false } }] }, { 'artist.popularity': { 'gte': lowerBound } }, { 'artist.popularity': { 'lt': upperBound } }] },
      fields: { id: true, artist: true, topTracks: false, albums: false }
    }
    const artists = await enrichedArtist.find(filter)
    return artists
  }

  async function findVideoCrawledArtistsByPopularity (lowerBound, upperBound) {
    const enrichedArtist = app.models.enrichedArtist
    const filter = {
      where: { and: [{ 'areArtistVideosCrawled': true }, { 'artist.popularity': { 'gte': lowerBound } }, { 'artist.popularity': { 'lt': upperBound } }] },
      fields: { id: true, artist: true, topTracks: false, albums: false }
    }
    const artists = await enrichedArtist.find(filter)
    return artists
  }

  async function findNonRemovedVideosInBatch (maxResults, offset) {
    const filter = {
      where: {
        and: [
          { or: [{ isRemoved: false }, { isRemoved: { exists: false } }] }
        ] },
      fields: { id: true },
      limit: maxResults,
      skip: offset
    }

    const videos = await ytVideo.find(filter)
    return videos
  }

  function putArtistsTopTracksLive (artists) {
    const tracks = _.flatMapDeep(artists, (artist) => {
      const track = _.flatMap(_.compact(artist.topTracks), track => track.track)
      return track
    })
    const truncatedTracks = _.map(_.compact(tracks), ({ id, name, popularity }) => {
      return { id, name, popularity }
    })

    const uniqueTruncatedTracks = _.uniqBy(truncatedTracks, 'id')
    console.log(JSON.stringify(uniqueTruncatedTracks, null, 1))
  }

  function putArtistsAlbumsLive (artists) {
    const albums = _.flatMapDeep(artists, artist => artist.albums)
    const truncatedAlbums = _.map(_.compact(albums), ({ name, popularity, id }) => {
      return { name, popularity, id }
    })
    const uniqueTruncatedAlbums = _.uniqBy(truncatedAlbums, 'id')
    // const topAlbums = _.filter(uniqueTruncatedAlbums, album => album.popularity >= 26 && album.popularity < 40)
    console.log(JSON.stringify(uniqueTruncatedAlbums, null, 1))
  }
}
