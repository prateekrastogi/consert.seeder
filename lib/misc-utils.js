'use strict'

const { from, concat, defer, interval, EMPTY } = require('rxjs')
const { concatMap, map, timeoutWith, catchError } = require('rxjs/operators')

// Had to build this due to back-pressure resulting in ignored items, and to enable automated kick-in on any incoming changes
exports.recursiveDeferredObservable = function recursiveDeferredObservable (observable) {
  return concat(observable, defer(() => recursiveDeferredObservable(observable)))
}

// Just another variant of the recursiveDeferredObservable using timeout to efficiently and correctly work with observables that don't have default baked in rx interval, or need custom delay
exports.recursiveTimeOutDeferredObservable = function recursiveTimeOutDeferredObservable (observable, WAIT_TILL_NEXT_REQUEST) {
  return observable.pipe(timeoutWith(WAIT_TILL_NEXT_REQUEST, defer(() => recursiveTimeOutDeferredObservable(observable, WAIT_TILL_NEXT_REQUEST))))
}

exports.terminateAllActiveInterferingSubscriptions = function terminateAllActiveInterferingSubscriptions (activeSubscriptions) {
  const subscriptions = [...activeSubscriptions]
  activeSubscriptions = []
  return from(subscriptions).pipe(
    map((subscription) => subscription.unsubscribe()),
    concatMap((val) => EMPTY)
  )
}

exports.getAllDbItemsObservable = function getAllDbItemsObservable (filterFunction, WAIT_TILL_NEXT_REQUEST, MAX_BATCH) {
  const dbItems = interval(WAIT_TILL_NEXT_REQUEST).pipe(
    concatMap((i) => {
      const items = defer(() => from(filterFunction(MAX_BATCH, i * MAX_BATCH)))

      return items
    }),
    catchError(err => EMPTY)
  )

  return dbItems
}
