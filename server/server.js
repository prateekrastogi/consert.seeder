'use strict';

var loopback = require('loopback');
var boot = require('loopback-boot');
var Raven = require('raven');
var app = module.exports = loopback();


app.start = function () {

// Must configure Raven before doing anything else with it
  Raven.config('https://50da01e5270b41ab8953665a84ce3318:07c2af5d1e824c41a7e412df1f534616@sentry.io/185334').install();

// The request handler must be the first middleware on the app
  app.use(Raven.requestHandler());

  app.get('/', function mainHandler(req, res) {
    throw new Error('Broke!');
  });

// The error handler must be before any other error middleware
  app.use(Raven.errorHandler());

// Optional fallthrough error handler
  app.use(function onError(err, req, res, next) {
    // The error id is attached to `res.sentry` to be returned
    // and optionally displayed to the user for support.
    res.statusCode = 500;
    res.end(res.sentry + '\n');
  });

  // start the web server
  return app.listen(function () {
    app.emit('started');
    var baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function (err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});
