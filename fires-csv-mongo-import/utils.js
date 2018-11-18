const Sentry = require('@sentry/node');
const assert = require('assert');
const settings = require('./settings.json');
const fs = require('fs');

const {
  inotifyDir, sentryDSN, debug
} = settings;

if (!fs.existsSync(inotifyDir)) {
  fs.mkdirSync(inotifyDir);
}

const hasSentry = typeof sentryDNS !== 'undefined' && sentryDSN.length > 0;

if (hasSentry) {
  Sentry.init({ dsn: sentryDSN });
}

// module.exports.Sentry = Sentry;

module.exports.logError = (err) => {
  if (hasSentry) { Sentry.captureException(err); };
  if (debug) console.error(err);
}

module.exports.logInfo = (msg) => {
  if (debug && hasSentry) { Sentry.captureMessage(msg); }
  if (debug) console.info(msg);
}

module.exports.touch = (file) => {
  fs.closeSync(fs.openSync(`${inotifyDir}${file}`, 'w'));
};

module.exports.saveStats = (file, value) => {
  fs.writeFile(`${inotifyDir}${file}`, value, (err) => {
    assert.equal(null, err);
  });
};

module.exports.SpainGeoJSON = {
  "type": "Feature",
  "properties": {},
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [
              -10.1953125,
          36.31512514748051
        ],
        [
          2.109375,
          36.31512514748051
        ],
        [
          2.109375,
          44.84029065139799
        ],
        [
              -10.1953125,
          44.84029065139799
        ],
        [
              -10.1953125,
          36.31512514748051
        ]
      ]
    ]
  }
};
