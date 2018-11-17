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
const updates = [];
const unionInsert = [];

const totalFiles = process.argv.length;
let fileCount = 0;

// TODO url
// https://stackoverflow.com/questions/39785036/reliably-reconnect-to-mongodb

// http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html
mongoClient.connect(mongoUrl, {
  useNewUrlParser: true,
  // retry to connect for 60 times
  reconnectTries: 60,
  // wait 1 second before retrying
  reconnectInterval: 1000
}), (err, client) => {
  assert.equal(null, err);
  logInfo('Connected successfully to server');
  const db = client.db(dbname);
  const activeFires = db.collection('activefires');
  const siteSettings = db.collection('siteSettings');
  const activeFiresUnion = db.collection('activefiresunion');

  const activeFiresUnionUpdate = (findUnionQuery, onEnd) => {
    // console.time("Active fire to notify union");
    logInfo("Starting active fire union");
    activeFires.find(findUnionQuery).toArray((err, r) => {
      if (err) logError(r);

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
            centerid,
            shape,
            history: [],
            // when
            createdAt: now,
            updatedAt: now
          };
          // TODO here we can search for previous fires and add then to history (before delete old fires)
          unionInsert.push(fireUnion);
        });
      }
      // logInfo(unionInsert);
      activeFiresUnion.deleteMany({createdAt: {$ne: now}}, {w: 1}, (err, r) => {
        if (err) logError(err);
        assert.equal(null, err, 'Error deleting previous activeFiresUnion');
        const disappeared = r.result.n;
        logInfo(`Deleted ${disappeared} old union fires`);
        activeFiresUnion.insertMany(unionInsert, {w: 1}, (err, r) => {
          if (err) logError(err);
          assert.equal(null, err, 'Error inserting new activeFiresUnion');
          // console.timeEnd("Active fire to notify union");
          logInfo(`${r.insertedCount} new active union fires`);
          // Delete foreign keys in activefires
          activeFires.updateMany({}, {$set: {fireUnion: null}}, (err) => {
            if (err) logError(err);
            assert.equal(null, err, 'Error updating activeFires');
            // fireUnion
            // Set foreign key in activeFires
            activeFiresUnion.find({}, {}, async (err, r) => {
              if (err) logError(err);
              assert.equal(null, err, 'Error in find activeFiresUnion');
              let fireUnionCount = await r.count();
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
                  // logInfo(uaf2r.r);

                  // find when started the fire
                  await activeFires.findOne(firesOfUnionQuery,
                    {projection: {when: 1}, sort: {when: 1}, limit: 1},
                    async (err, r) => {
                      if (err) logError(err);
                      assert.equal(null, err);
                      await activeFiresUnion.updateOne({_id: fUnion._id}, {$set: {when: r.when}},
                        async (err, r) => {
                          assert.equal(null, err);
                          assert.equal(r.result.nModified, 1, 'Active fire union when update failed');
                          // logInfo('Updating when');
                          fireUnionCount -= 1;
                          if (fireUnionCount === 0) onEnd();
                        });
                    });
                });
              }
            });
          });
        });
      });
    });
  };

  // http://mongodb.github.io/node-mongodb-native/2.1/api/Collection.html#bulkWrite
  const activeFiresBulkWrite = () => {
    logInfo(`Trying to update ${updates.length} fires`);
    saveStats('ftp-read-fires-stats', updates.length);
    try {
      if (updates.length === 0) {
        logInfo('No data read from NASA cvs');
        process.exit(1);
      } else {
        activeFires.bulkWrite(updates, {w: 1, ordered: 0, wtimeout: 120000}, (err) => {
          if (err) logError(err);
          assert.equal(null, err);
          activeFires.countDocuments((err, count) => {
            assert.equal(null, err);
            saveStats('total-fires-stats', count);
            logInfo(`Total fires: ${count}`);
            activeFires.deleteMany({updatedAt: {$ne: now}}, {w: 1}, (err, r) => {
              assert.equal(null, err);
              const disappeared = r.result.n;
              logInfo(`Deleted ${disappeared} old fires`);
              saveStats('disappeared-fires-stats', disappeared);
              // TODO group
              siteSettings.findOne({name: 'subs-private-union'}, {}, (err, r) => {
                assert.equal(null, err);
                assert.notEqual(null, r, 'Missing subs private union in DB');
                assert.notEqual(null, r.value, 'Wrong subs private union in DB');
                const union = JSON.parse(r.value);
                assert.notEqual(null, union);
                const findUnionQuery = {
                  ourid: {
                    $geoWithin: {
                      $geometry: union.geometry
                    }
                  }
                };
                activeFires.countDocuments(findUnionQuery, (err, count) => {
                  assert.equal(null, err);
                  logInfo(`${count} fires to notify`);
                  saveStats('fires-to-notif-stats', count);
                  activeFires.countDocuments({createdAt: now}, (err, countn) => {
                    assert.equal(null, err);
                    logInfo(`${countn} new active fires`);
                    saveStats('new-fires-stats', countn);
                    if (count > 0) {
                      touch('new');
                    }
                    activeFiresUnionUpdate(findUnionQuery, () => {
                      touch('end');
                      client.close();
                    });
                  });
                });
              });
            });
          });
        });
      }
    } catch (e) {
      logError(e);
    }
  };

  const onCsvRow = (el, type) => {
    try {
      const lat = Number(el.latitude);
      const lon = Number(el.longitude);
      const when = moment(`${el.acq_date} ${el.acq_time}`, 'YYYY-MM-DD HH:mm'); // toDate commented in incinera
      if (lat && lon && typeof lat === 'number' && typeof lon === 'number') {
        const ourid = {type: 'Point', coordinates: [lon, lat]};

        const setCommon = {
          ourid,
          lat,
          lon,
          updatedAt: now,
          type,
          // when,
          acq_date: el.acq_date,
          acq_time: el.acq_time,
          scan: el.scan,
          track: el.track,
          satellite: el.satellite,
          confidence: el.confidence,
          version: el.version,
          frp: el.frp,
          daynight: el.daynight
        };

        let setDiff;
        if (type === 'modis') {
          setDiff = {
            brightness: el.brightness,
            bright_t31: el.bright_t31
          };
        } else { // viirs
          setDiff = {
            bright_ti4: el.bright_ti4,
            bright_ti5: el.bright_ti5
          };
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

        fire.when = when.toDate();

        const up = {
          $set: fire,
          $setOnInsert: {createdAt: now}
        };

        updates.push({updateOne: {filter: {ourid, type}, update: up, upsert: true}});

      } else {
        logError(`Wrong csv row: ${JSON.stringify(el)}`);
      }
    } catch (e) {
      logError(e);
    }
  };

  const onCsvFileParsed = () => {
    fileCount += 1;
    logInfo(`CSV file ${fileCount} of ${totalFiles - 2}`);
    if (fileCount === totalFiles - 2) activeFiresBulkWrite();
  };

  const lastCheckSet = {
    $set: {
      name: 'last-fire-check',
      value: now,
      description: 'Time of last NASA check',
      type: 'date',
      isPublic: true
    }
  };

  siteSettings.updateOne({name: 'last-fire-check'}, lastCheckSet, { upsert: true }, (err) => {
    assert.equal(null, err);
    touch('check');
  });

  for (let i = 2; i < totalFiles; i += 1) {
    const filePath = process.argv[i];
    const type = filePath.includes('modis') ? 'modis' : 'viirs';

    // https://github.com/Keyang/node-csvtojson#parameters
    csv({
      noheader: false,
      workerNum: workers,
      colParser: {
        latitude: 'number',
        longitude: 'number',
        scan: 'number',
        track: 'number',
        acq_date: 'string',
        acq_time: 'string',
        satellite: 'string',
        confidence: 'number',
        version: 'string',
        frp: 'number',
        daynight: 'string',
        brightness: 'number',
        bright_t31: 'number',
        bright_ti4: 'number',
        bright_ti5: 'number'
      }
    }).fromFile(filePath)
      .on('json', (row) => {
        onCsvRow(row, type);
      })
      .on('done', (err) => {
        if (err) logError(err); else onCsvFileParsed();
      });
  }
});
