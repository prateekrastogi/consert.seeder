// Copyright IBM Corp. 2015,2016. All Rights Reserved.
// Node module: loopback-example-access-control
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

module.exports = function (app) {
  const User = app.models.user

  User.create([
    { username: 'Prateek Rastogi', email: 'prtk6592@gmail.com', password: 'openssssame' }
  ], function (err, users) {
    if (err) throw err
  })
}
