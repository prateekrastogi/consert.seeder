/**
 * Created by rprat on 23-07-2017.
 */

'use strict'
const natural = require('natural')
const acceptanceTrainingData = require('../lib/classifier-training-data/accept').accept
const rejectionTrainingData = require('../lib/classifier-training-data/reject').reject
const _ = require('lodash')

module.exports = {
  logClassifier: function logClassifier () {
    const classifier = new natural.LogisticRegressionClassifier()
    _.forEach(acceptanceTrainingData, (data) => classifier.addDocument(data, 'accept'))
    _.forEach(rejectionTrainingData, (data) => classifier.addDocument(data, 'reject'))
    return classifier
  }
}
