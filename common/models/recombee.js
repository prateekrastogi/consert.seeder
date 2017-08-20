'use strict'

const app = require('../../server/server')
const loginAssist = require('../../lib/login-assist')
const dbQueries = require('../../lib/db-queries')
const recombeeQueries = require('../../lib/recombee-queries')
const recombeeRqs = require('recombee-api-client').requests
const Rx = require('rxjs')
const _ = require('lodash')

module.exports = function (recombee) {
  const recombeeClient = loginAssist.recombeeLogin()
  /**
   * Seeds the past recorded concerts in recombee for recommendations
   * @param {Function(Error)} callback
   */

  recombee.seedPastShows = async function (lowerBound, upperBound, callback) {
    const videos = await dbQueries.findRecombeeUnSyncedYtVideosInBatches(10, 49)
    recombeeClient.send(new recombeeRqs.GetItemValues('0k17h0D3J5VfsdmQ1iZtE9'), (err, result) => {
      console.log(err)
      console.log(result)
    })
    recombeeClient.send(new recombeeRqs.ListItems(), (err, result) => {
      console.log(err)
      console.log(result)
    })
    // TODO
    callback(null)
  }

  /**
   * seeds the artist pseudo-types for recommendation engine
   * @param {Function(Error)} callback
   */

  recombee.seedArtists = function (lowerBound, upperBound, callback) {
    const artists = Rx.Observable.fromPromise(dbQueries.findRecombeeUnSyncedArtistsByPopularity(lowerBound, upperBound))

    artists.concatMap(artists => Rx.Observable.from(artists)).map(value => {
      const {artist, id} = value
      const recombeeArtist = {
        'itemType': 'artist',
        'artists-ids': [artist.id],
        'artists-genres': artist.genres,
        'artists-names': [artist.name],
        'artists-popularity': [`${artist.popularity}`],
        'artists-followers': [`${artist.followers.total}`],
        'artists-type': artist.type
      }
      return {recombeeArtist, id}
    }).concatMap(({recombeeArtist, id}) => {
      const itemPropertyAddRequest = Rx.Observable.fromPromise(recombeeClient.send(new recombeeRqs.SetItemValues(id, recombeeArtist, {'cascadeCreate': true})))

      const enrichedArtists = app.models.enrichedArtists
      const dbUpdateRequest = Rx.Observable.fromPromise(enrichedArtists.findById(id)).map(artist => {
        artist.isArtistRecombeeSynced = true
        return artist
      }).concatMap(artist => Rx.Observable.fromPromise(enrichedArtists.replaceOrCreate(artist))).map(({artist}) => console.log(`Added in Recombee, artistItem: ${artist.name}`))

      const result = Rx.Observable.concat(itemPropertyAddRequest, dbUpdateRequest)
      return result
    }).subscribe()
    /*
       recombeeClient.send(new recombeeRqs.AddItem('ss2'), (err, result) => {
          console.log(err)
          console.log(result)
        })
    recombeeClient.send(new recombeeRqs.AddItemProperty('random-detail', 'int'), (err, result) => {
      console.log(err)
      console.log(result)
    })

    recombeeClient.send(new recombeeRqs.SetItemValues('ss2', {'das': 70, 'fuck': 'alka'}, {
      'cascadeCreate': true
    }), (err, result) => {
      console.log(err)
      console.log(result)
    })
    recombeeClient.send(new recombeeRqs.GetItemValues('ss0'), (err, result) => {
      console.log(err)
      console.log(result)
    })
*/
    callback(null)
  }

  /**
   * sets the itemProperties of recombee database items
   * @param {Function(Error, boolean)} callback
   */

  recombee.setItemProperties = function (callback) {
    recombeeQueries.setItemProperties().subscribe(x => console.log(x), e => console.error(e))
    callback(null)
  }
}
