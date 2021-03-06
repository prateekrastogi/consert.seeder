'use strict'

const _ = require('lodash')
const loginAssist = require('../../lib/login-assist')
const app = require('../../server/server')
const { from, zip, timer, range, concat } = require('rxjs')
const { concatMap, pluck, map, retry, bufferCount, mergeMap, reduce, tap } = require('rxjs/operators')

const terminateAllActiveInterferingSubscriptions = require('../../lib/misc-utils').terminateAllActiveInterferingSubscriptions

const RETRY_COUNT = 3

let activeSubscriptions = []

module.exports = function (enrichedArtist) {
  enrichedArtist.putEnrichedArtists = async function () {
    let count = 0
    const artistSeed = app.models.artistSeed
    const uncrawledArtists = await artistSeed.find({ where: { or: [{ isCrawled: false }, { isCrawled: { exists: false } }] } })

    const spotifyApi = timer(0, 1500).pipe(concatMap((i) => from(loginAssist.spotifyLogin())))
    const artistList = from(uncrawledArtists)

    const artistListWithSpotifyToken = zip(spotifyApi, artistList.pipe(pluck('id')))

    const enrichedArtistObservable = artistListWithSpotifyToken.pipe(
      tap(async ([spotifyApi, artistId]) => {
      /* Marking the artist to be crawled here coz if the artist doesn't have any top tracks or albums,then enriched artist
       zip doesn't emit any values, so the subscribe part is not triggered. Thus, those artist are re-crawled on re-start */
        let artistSeedInstance = await artistSeed.findById(artistId)
        artistSeedInstance.isCrawled = true
        await artistSeed.replaceOrCreate(artistSeedInstance)
        console.log(`Crawling the artist: ${artistSeedInstance.name}`)
      }),
      mergeMap(([spotifyApi, artistId]) => {
        const artist = from(spotifyApi.getArtist(artistId)).pipe(
          retry(RETRY_COUNT),
          pluck('body'),
          map((artist) => truncateFullArtist(artist)))

        const id = artist.pipe(pluck('id'))

        const artistTopTracks = from(spotifyApi.getArtistTopTracks(artistId, 'US')).pipe(
          retry(RETRY_COUNT),
          pluck('body', 'tracks'),
          map((topTracks) => _.map(topTracks, (topTrack) => truncateFullTrack(topTrack))),
          concatMap((topTracks) => from(topTracks))
        )

        const artistTopTrackFeatures = artistTopTracks.pipe(
          pluck('id'),
          bufferCount(100),
          concatMap((topTracksId) => from(spotifyApi.getAudioFeaturesForTracks(topTracksId))),
          retry(RETRY_COUNT),
          pluck('body', 'audio_features'),
          concatMap(features => from(features))
        )

        const artistTopTracksWithAudioFeatures = zip(artistTopTracks, artistTopTrackFeatures, (track, audioFeatures) => {
          return { track, audioFeatures }
        }).pipe(reduce((accum, curr) => _.concat(accum, curr)))

        const artistRelatedArtists = from(spotifyApi.getArtistRelatedArtists(artistId)).pipe(
          retry(RETRY_COUNT),
          pluck('body', 'artists'),
          map((relatedArtists) => _.map(relatedArtists, (relatedArtist) => truncateFullArtist(relatedArtist)))
        )

        const artistAlbums = range(0, 3).pipe(
          concatMap((i) => {
            return from(spotifyApi.getArtistAlbums(artistId, {
              market: 'US',
              limit: 50,
              offset: (i * 50)
            })).pipe(retry(RETRY_COUNT), pluck('body', 'items'))
          })
        )

        const artistDetailedAlbums = artistAlbums.pipe(
          concatMap((albums) => from(albums).pipe(pluck('id'))),
          bufferCount(20),
          concatMap((bufferedAlbums) => {
            return spotifyApi.getAlbums(bufferedAlbums)
          }),
          retry(RETRY_COUNT),
          pluck('body', 'albums'),
          map((albums) => _.map(_.compact(albums), (album) => truncateFullAlbum(album))),
          reduce((accum, curr) => _.concat(accum, curr))
        )

        const enrichedArtist = zip(id, artist, artistDetailedAlbums, artistTopTracksWithAudioFeatures, artistRelatedArtists, (id, artist, albums, topTracks, relatedArtists) => {
          return { id, artist, albums, topTracks, relatedArtists }
        })

        return enrichedArtist
      }, 2)
    )

    const safeEnrichedArtistObservable = concat(terminateAllActiveInterferingSubscriptions(activeSubscriptions), enrichedArtistObservable)

    const putEnrichedArtistsSubscription = safeEnrichedArtistObservable.subscribe({
      next: async (x) => {
        count++
        from(enrichedArtist.replaceOrCreate(x)).pipe(retry(RETRY_COUNT)).toPromise()
        console.log(`Successfully added/replaced the artist: ${x.artist.name}`)
        console.log(`Total artists added/replaced in the running execution: ${count}`)
      },
      error: err => console.error(err)
    })

    activeSubscriptions.push(putEnrichedArtistsSubscription)

    return new Promise((resolve, reject) => resolve())
  }

  enrichedArtist.setEnrichedArtistsForReCrawl = async function () {
    let count = 0
    const artistSeed = app.models.artistSeed

    const uncrawledArtists = await artistSeed.find({ where: { or: [{ isCrawled: false }, { isCrawled: { exists: false } }] } })

    if (uncrawledArtists.length === 0) {
      let crawledArtists = await artistSeed.find()
      const tbCrawled = _.map(crawledArtists, ({ id, name, isCrawled }) => {
        return { id, name, isCrawled: false }
      })

      const enrichedArtistReCrawler = from(tbCrawled).pipe(
        concatMap((artist) => {
          return from(artistSeed.replaceOrCreate(artist)).pipe(retry(RETRY_COUNT))
        })
      )

      const safeEnrichedArtistReCrawler = concat(terminateAllActiveInterferingSubscriptions(activeSubscriptions), enrichedArtistReCrawler)

      const setEnrichedArtistsForReCrawlSubscription = safeEnrichedArtistReCrawler.subscribe(x => {
        count++
        console.log(`Added artist ${x.name} in pending crawl list`)
        console.log(`Total artists added in the pending crawl list: ${count}`)
      },
      err => console.error(err))

      activeSubscriptions.push(setEnrichedArtistsForReCrawlSubscription)
    }
    return new Promise((resolve, reject) => resolve())
  }

  function truncateFullArtist ({ followers, genres, id, name, popularity, type }) {
    return { followers, genres, id, name, popularity, type }
  }

  function truncateSimplifiedArtist ({ id, name, type }) {
    return { id, name, type }
  }

  function truncateSimplifiedAlbum ({ album_type, id, name, type, artists }) {
    const slimArtists = _.map(artists, (artist) => truncateSimplifiedArtist(artist))
    const slimAlbum = {
      album_type,
      id,
      name,
      type,
      artists: slimArtists
    }
    return slimAlbum
  }

  function truncateFullAlbum ({ album_type, genres, id, name, popularity, release_date, tracks, artists }) {
    const slimArtists = _.map(artists, (artist) => truncateSimplifiedArtist(artist))

    // Dropping the track objects from the album to keep the size of output small i.e. not searching yt based on it

    const slimAlbum = {
      album_type,
      genres,
      id,
      name,
      popularity,
      release_date,
      artists: slimArtists
    }
    return slimAlbum
  }

  function truncateSimplifiedTrack ({ artists, disc_number, duration_ms, explicit, id, name, track_number, type }) {
    const slimArtists = _.map(artists, (artist) => truncateSimplifiedArtist(artist))
    const slimTrack = { artists: slimArtists, disc_number, duration_ms, explicit, id, name, track_number, type }
    return slimTrack
  }

  function truncateFullTrack ({ album, artists, disc_number, duration_ms, explicit, id, name, popularity, track_number, type }) {
    const slimAlbum = truncateSimplifiedAlbum(album)
    const slimArtists = _.map(artists, (artist) => truncateSimplifiedArtist(artist))
    const slimTrack = {
      album: slimAlbum,
      artists: slimArtists,
      disc_number,
      duration_ms,
      explicit,
      id,
      name,
      popularity,
      track_number,
      type
    }
    return slimTrack
  }

  function truncateTrackAudioFeature ({ acousticness, danceability, duration_ms, energy, id, instrumentalness, key, liveness, loudness, mode, speechiness, tempo, time_signature, type, valence }) {
    return {
      acousticness,
      danceability,
      duration_ms,
      energy,
      id,
      instrumentalness,
      key,
      liveness,
      loudness,
      mode,
      speechiness,
      tempo,
      time_signature,
      type,
      valence
    }
  }
}
