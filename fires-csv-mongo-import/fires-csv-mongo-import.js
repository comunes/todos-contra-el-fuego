/* global process require */

const moment = require('moment-timezone');
const assert = require('assert');
const mongoClient = require('mongodb').MongoClient;
const csv = require('csvtojson');
const calcUnion = require('map-common-utils').calcUnion;

// FIXME union of none
const centroid = require('@turf/centroid').default;
const {logInfo, logError, touch, saveStats} = require('./utils.js');
const {dbname, workers, mongoUrl} = require('./settings.json');

if (process.argv.length < 3) {
  console.error('You must specify a file or files');
  process.exit(1);
}

const now = new Date();

const totalFiles = process.argv.length;
let fileCount = 0;
const updates = [];

// TODO url
// https://stackoverflow.com/questions/39785036/reliably-reconnect-to-mongodb

let mClient;
let activeFires;
let siteSettings;
let activeFiresUnion;

// http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html
mongoClient.connect(mongoUrl, {
  useNewUrlParser: true,
  // retry to connect for 60 times
  reconnectTries: 60,
  // wait 1 second before retrying
  reconnectInterval: 1000
}).then((client) => {
  logInfo('Connected successfully to server');
  mClient = client;
  const db = client.db(dbname);
  activeFires = db.collection('activefires');
  siteSettings = db.collection('siteSettings');
  activeFiresUnion = db.collection('activefiresunion');

  return siteSettings.updateOne({name: 'last-fire-check'}, {
    $set: {
      name: 'last-fire-check',
      value: now,
      description: 'Time of last NASA check',
      type: 'date',
      isPublic: true
    }
  }, {upsert: true});
}).then(() => {
  touch('check');

  for (let i = 2; i < totalFiles; i += 1) {
    const filePath = process.argv[i];
    const type = filePath.includes('modis') ? 'modis' : 'viirs';

    // https://github.com/Keyang/node-csvtojson#parameters
    csv({
      noheader: false,
      workerNum: workers,
      colParser: {
        latitude: 'number', longitude: 'number', scan: 'number', track: 'number',
        acq_date: 'string', acq_time: 'string', satellite: 'string', confidence: 'number',
        version: 'string', frp: 'number', daynight: 'string', brightness: 'number',
        bright_t31: 'number', bright_ti4: 'number', bright_ti5: 'number'
      }
    }).fromFile(filePath)
      .on('json', (el) => {
        const lat = Number(el.latitude);
        const lon = Number(el.longitude);
        const when = moment(`${el.acq_date} ${el.acq_time}`, 'YYYY-MM-DD HH:mm'); // toDate commented in incinera

        if (!lat || !lon || typeof lat !== 'number' || typeof lon !== 'number') {
          logError(`Wrong csv row: ${JSON.stringify(el)}`);
          return;
        }

        const setCommon = {
          ourid: {type: 'Point', coordinates: [lon, lat]},
          lat, lon, updatedAt: now, type, scan: el.scan, track: el.track,
          acq_date: el.acq_date, acq_time: el.acq_time, satellite: el.satellite, confidence: el.confidence,
          version: el.version, frp: el.frp, daynight: el.daynight, when: when.toDate()           };
        let setDiff;

        if (type === 'modis') {
          setDiff = { brightness: el.brightness, bright_t31: el.bright_t31 };
        } else { // viirs
          setDiff = { bright_ti4: el.bright_ti4, bright_ti5: el.bright_ti5 };
        }

        const fire = Object.assign(setCommon, setDiff);

        if (el.brightness) {
          fire.type = 'modis';
          fire.brightness = el.brightness;
          fire.bright_t31 = el.bright_t31;
        } else {
          fire.type = 'viirs';
          fire.bright_ti4 = el.bright_ti4;
          fire.bright_ti5 = el.bright_ti5;
        }

        const up = {
          $set: fire,
          $setOnInsert: {createdAt: now}
        };

        updates.push({ updateOne: {
          filter: {ourid: {type: 'Point', coordinates: [lon, lat]}, type},
          update: up,
          upsert: true
        }
        });
      }).on(
        'done',
        (err) => {
          if (err) logError(err);
          assert.equal(null, err, 'Error processing csv files');
          fileCount += 1;
          logInfo(`CSV file ${fileCount} of ${totalFiles - 2}`);
          const lastFile = fileCount === totalFiles - 2
          if (lastFile) {
            // http://mongodb.github.io/node-mongodb-native/2.1/api/Collection.html#bulkWrite
            logInfo(`Trying to update ${updates.length} fires`);
            saveStats('ftp-read-fires-stats', updates.length);
            if (updates.length === 0) {
              logInfo('No data read from NASA cvs');
              process.exit(1);
            }
            activeFires
              .bulkWrite(updates, {w: 1, ordered: 0, wtimeout: 120000})
              .catch ((err) => {
                throw err;
              }).then(() => {
                // TODO more asserts
                return activeFires.countDocuments();
              }).then((count) => {
                saveStats('total-fires-stats', count);
                logInfo(`Total fires: ${count}`);
                return activeFires.deleteMany({updatedAt: {$ne: now}}, {w: 1})
              }).then((r) => {
                // TODO more asserts
                const disappeared = r.result.n;
                logInfo(`Deleted ${disappeared} old fires`);
                saveStats('disappeared-fires-stats', disappeared);
                // TODO group
                return siteSettings.findOne({name: 'subs-private-union'}, {});
              }).then((r) => {
                assert.notEqual(null, r, 'Missing subs private union in DB');
                assert.notEqual(null, r.value, 'Wrong subs private union in DB');
                const union = JSON.parse(r.value);
                assert.notEqual(null, union);
                const findUnionQuery = {ourid: {$geoWithin: {$geometry: union.geometry}}};
                return [activeFires.countDocuments(findUnionQuery), findUnionQuery];
              }).then(async ([countPromise, findUnionQuery]) => {
                const count = await countPromise;
                logInfo(`${count} fires to notify`);
                saveStats('fires-to-notif-stats', count);
                return [activeFires.countDocuments({createdAt: now}), findUnionQuery];
              }).then(async ([countPromise, findUnionQuery]) => {
                const count = await countPromise;
                logInfo(`${count} new active fires`);
                saveStats('new-fires-stats', count);
                if (count > 0) touch('new');
                // console.time("Active fire to notify union");
                logInfo("Starting active fire union");
                return activeFires.find(findUnionQuery).toArray();
              }).then((r) => {
                const unionInsert = [];
                if (r.length > 0) {
                  const remap = r.map((doc) => {
                    const isNASA = doc.type === 'modis' || doc.type === 'viirs';
                    const pixelSize = doc.type === 'viirs' ? 0.375 : 1; // viirs has 375m pixel size, modis 1000m
                    // default 1 km for neighbor alerts
                    return {
                      location: {lat: doc.lat, lon: doc.lon},
                      distance: isNASA ? doc.scan * pixelSize : 1,
                      distanceY: isNASA ? doc.track * pixelSize : 1
                    };
                  });
                  logInfo("End active fire remap");
                  const unionMultiPolygon = calcUnion(remap, (sub) => {
                    return sub;
                  }, false); // without nouse and with squares (like pixels)
                  const firesUnionCount = unionMultiPolygon.geometry.coordinates.length;
                  logInfo("End active fire union");
                  logInfo(`Fires unified: ${firesUnionCount}`);
                  // logInfo(JSON.stringify(unionMultiPolygon));
                  unionMultiPolygon.geometry.coordinates.forEach((coords) => {
                    // FIXME this to fire group
                    // centroid ?
                    const shape = {"type": "Polygon", "coordinates": coords};
                    const centerid = centroid(shape).geometry;
                    // logInfo(JSON.stringify(shape));
                    // logInfo(JSON.stringify(centerid));
                    const fireUnion = {
                      centerid, shape, history: [], createdAt: now, updatedAt: now
                    };
                    // TODO here we can search for previous fires and add then to history (before delete old fires)
                    unionInsert.push(fireUnion);
                  });
                }
                return [activeFiresUnion.deleteMany({createdAt: {$ne: now}}, {w: 1}), unionInsert];
              }).then(async ([promiseResult, unionInsert]) => {
                const r = await promiseResult;
                const disappeared = r.result.n;
                logInfo(`Deleted ${disappeared} old union fires`);
                return activeFiresUnion.insertMany(unionInsert, {w: 1});
              }).then((r) => {
                logInfo(`${r.insertedCount} new active union fires`);
                // Delete foreign keys in activefires
                return activeFires.updateMany({}, {$set: {fireUnion: null}});
              }).then(() => {
                // Set foreign key in activeFires
                return activeFiresUnion.find({}, {});
              }).then(async (r) => {
                let fireUnionCount = await r.count();
                logInfo('Find when started each fire union');
                while (await r.hasNext()) {
                  const fUnion = await r.next();
                  const firesOfUnionQuery = {
                    ourid: {
                      $geoWithin: {
                        $geometry: fUnion.shape
                      }
                    }
                  };
                  await activeFires.updateMany(firesOfUnionQuery, {$set: {fireUnion: fUnion._id}}, async (err) => {
                    if (err) logError(err);
                    assert.equal(null, err, 'Error updating active fire with unions');
                    await activeFires.findOne(
                      firesOfUnionQuery,
                      {projection: {when: 1}, sort: {when: 1}, limit: 1},
                      async (err, r) => {
                        if (err) logError(err);
                        assert.equal(null, err);
                        await activeFiresUnion.updateOne(
                          {_id: fUnion._id},
                          {$set: {when: r.when}},
                          async (err, r) => {
                            assert.equal(null, err);
                            assert.equal(r.result.nModified, 1, 'Active fire union when update failed');
                            // logInfo('Updating when');
                            fireUnionCount -= 1;
                            if (fireUnionCount === 0) {
                              touch('end');
                              mClient.close();
                            }
                          });
                      });
                  });
                }
              }).catch((reason) => {
                logError(reason);
                throw reason;
              });
          }
        })
  }
}).catch(
  (err) => {
    logError(err);
    process.exit(1);
  }
);
