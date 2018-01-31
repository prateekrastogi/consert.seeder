'use strict'

const app = require('../../server/server')
const Rx = require('rxjs')
const _ = require('lodash')
const ytUtils = require('../../lib/yt-utils')

const RETRY_COUNT = 3

module.exports = function (ytVideos) {
  ytVideos.putArtistsVideosLive = async function (lowerBound, upperBound) {
    const enrichedArtists = app.models.enrichedArtists
    let maxResults  // max results per search query

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

    topArtists.mergeMap((artist) => {
      const artistName = artist.artist.name
      console.log(`Total artists crawled: ${count}`)
      count++
      console.log(`Crawling the artist: ${artistName}`)
      const queries = [`${artistName} live | ${artistName} concert | ${artistName} live performance`]

      const videoResult = ytUtils.searchYtVideos(queries, maxResults).retry(RETRY_COUNT)

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
    }, 4).subscribe({
      next: async (result) => {
        const updatedVideo = await videoObjectUpdater(result.result, {artists: result.artistId})
        await ytVideos.replaceOrCreate(updatedVideo)
      },
      error: err => console.log(err)})

    return new Promise((resolve, reject) => resolve())
  }

  ytVideos.setArtistsByPopularityForVideoReCrawl = async function (lowerBound, upperBound) {
    const artistIds = await findVideoCrawledArtistsByPopularity(lowerBound, upperBound)
    const enrichedArtists = app.models.enrichedArtists

    Rx.Observable.from(artistIds).pluck('id').concatMap(id => Rx.Observable.fromPromise(enrichedArtists.findById(id)))
      .concatMap((enrichedArtistInstance) => {
        enrichedArtistInstance.areArtistVideosCrawled = false
        return Rx.Observable.fromPromise(enrichedArtists.replaceOrCreate(enrichedArtistInstance))
      }).subscribe((artist) => console.log(`Artist marked for re-crawling: ${artist.artist.name}`))

    return new Promise((resolve, reject) => resolve())
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
      fields: {id: true, artist: true, topTracks: false, albums: false}
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
