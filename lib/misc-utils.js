'use strict'

const Rx = require('rxjs')

// Had to build this due to back-pressure resulting in ignored items, and to enable automated kick-in on any incoming changes
exports.recursiveDeferredObservable = function recursiveDeferredObservable (observable) {
  return observable.concat(Rx.Observable.defer(() => recursiveDeferredObservable(observable)))
}

// Just another variant of the recursiveDeferredObservable using timeout to efficiently perform in set* methods
exports.recursiveDeferredTimeOutObservable = function recursiveDeferredTimeOutObservable (observable, WAIT_TILL_NEXT_REQUEST) {
  return observable.timeoutWith(4 * WAIT_TILL_NEXT_REQUEST, Rx.Observable.defer(() => recursiveDeferredTimeOutObservable(observable, WAIT_TILL_NEXT_REQUEST)))
}

exports.terminateAllActiveInterferingSubscription = function terminateAllActiveInterferingSubscription (activeSubscriptions) {
  const subscriptions = [...activeSubscriptions]
  activeSubscriptions = []
  return Rx.Observable.from(subscriptions).map((subscription) => subscription.unsubscribe())
  .concatMap((val) => Rx.Observable.empty())
}

exports.getAllDbItemsObservable = function getAllDbItemsObservable (filterFunction, WAIT_TILL_NEXT_REQUEST, MAX_BATCH) {
  const dbItems = Rx.Observable.interval(WAIT_TILL_NEXT_REQUEST).concatMap((i) => {
    const items = Rx.Observable.defer(() => Rx.Observable.fromPromise(filterFunction(MAX_BATCH, i * MAX_BATCH)))
    .concatMap(items => Rx.Observable.from(items))
    return items
  }).catch(err => Rx.Observable.empty())

  return dbItems
}
