/* global process require */

const moment = require('moment-timezone');
const assert = require('assert');
const fs = require('fs');
const mongoClient = require('mongodb').MongoClient;
const csv = require('csvtojson');
const settings = require('./settings.json');

const insert = false; // use 'update' or 'insert' (deprecated remove in the future)
const {
  inotifyDir, dbname, workers, mongoUrl
} = settings; // '/var/tmp/nasa-data/';

if (!fs.existsSync(inotifyDir)) {
  fs.mkdirSync(inotifyDir);
}

const touch = (file) => {
  fs.closeSync(fs.openSync(`${inotifyDir}${file}`, 'w'));
};

const saveStats = (file, value) => {
  fs.writeFile(`${inotifyDir}${file}`, value, (err) => {
    assert.equal(null, err);
  });
};

if (process.argv.length < 3) {
  console.error('You must specify a file or files');
  process.exit(1);
}

const now = new Date();
const updates = [];

const totalFiles = process.argv.length;
let fileCount = 0;

// http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html

// https://stackoverflow.com/questions/39785036/reliably-reconnect-to-mongodb
// TODO url
mongoClient.connect(mongoUrl, {
  // retry to connect for 60 times
  reconnectTries: 60,
  // wait 1 second before retrying
  reconnectInterval: 1000
}, (err, client) => {
  assert.equal(null, err);
  console.log('Connected successfully to server');
  const db = client.db(dbname);
  const activeFires = db.collection('activefires');
  const siteSettings = db.collection('siteSettings');

  const bulk = () => {
    console.log(`Trying to ${insert ? 'insert' : 'update'} ${updates.length} fires`);
    saveStats('ftp-read-fires-stats', updates.length);
    try {
      if (updates.length === 0) { console.error('No data read'); process.exit(1); } else {
        activeFires.bulkWrite(updates, { w: 1, ordered: 0, wtimeout: 120000 }, (errw) => { // ,r
          if (errw) {
            console.error(JSON.stringify(errw));
          }
          assert.equal(null, errw);
          activeFires.count((cerr, count) => {
            assert.equal(null, cerr);
            saveStats('total-fires-stats', count);
            console.log(`Total fires: ${count}`);
            if (!insert) {
              activeFires.deleteMany({ updatedAt: { $ne: now } }, { w: 1 }, (rerr, r) => {
                assert.equal(null, rerr);
                const disappeared = r.result.n;
                console.log(`Deleted ${disappeared} old fires`);
                saveStats('disappeared-fires-stats', disappeared);
                siteSettings.findOne({ name: 'subs-private-union' }, {}, (serr, fr) => {
                  assert.equal(null, serr);
                  assert.notEqual(null, fr);
                  assert.notEqual(null, fr.value);
                  const union = JSON.parse(fr.value);
                  assert.notEqual(null, union);
                  activeFires.count({
                    ourid: {
                      $geoWithin: {
                        $geometry: union.geometry
                      }
                    }
                  }, (cterr, countt) => {
                    assert.equal(null, cterr);
                    console.log(`${countt} fires to notify`);
                    saveStats('fires-to-notif-stats', countt);
                    activeFires.count({ createdAt: now }, (terr, countn) => {
                      assert.equal(null, terr);
                      console.log(`${countn} new active fires`);
                      saveStats('new-fires-stats', countn);
                      if (countt > 0) {
                        touch('new');
                      }
                      touch('end');
                      client.close();
                    });
                  });
                });
              });
            } else {
              client.close();
            }
          });
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const onRow = (el, type) => {
    try {
      const lat = Number(el.latitude);
      const lon = Number(el.longitude);

      const when = moment(`${el.acq_date} ${el.acq_time}`, 'YYYY-MM-DD HH:mm'); // toDate commented in incinera
      if (lat && lon && typeof lat === 'number' && typeof lon === 'number') {
        const ourid = { type: 'Point', coordinates: [lon, lat] };

        const setcommon = {
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

        let setdiff;
        if (type === 'modis') {
          setdiff = {
            brightness: el.brightness,
            bright_t31: el.bright_t31
          };
        } else { // viirs
          setdiff = {
            bright_ti4: el.bright_ti4,
            bright_ti5: el.bright_ti5
          };
        }

        const fire = Object.assign(setcommon, setdiff);

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

        // console.log(fire);

        // http://mongodb.github.io/node-mongodb-native/2.1/api/Collection.html#bulkWrite
        // { updateOne: { filter: {a:2}, update: {$set: {a:2}}, upsert:true } }

        if (insert) {
          fire.createdAt = now;
          updates.push({ insertOne: { document: fire } });
        } else {
          const up = {
            $set: fire,
            $setOnInsert: { createdAt: now }
          };

          updates.push({ updateOne: { filter: { ourid, type }, update: up, upsert: true } });
        }
      } else {
        // console.log(JSON.stringify(el));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const onEnd = () => {
    fileCount += 1;
    console.log(`${fileCount} of ${totalFiles - 2}`);
    if (fileCount === totalFiles - 2) {
      if (insert) {
        console.log('Deleting old fires to insert actives');
        activeFires.deleteMany({}, { w: 1 }, (rerr) => { // r
          assert.equal(null, rerr);
          bulk();
        });
      } else {
        bulk();
      }
    }
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

  siteSettings.updateOne({ name: 'last-fire-check' }, lastCheckSet, (seterr) => {
    assert.equal(null, seterr);
    touch('check');
  });

  for (let i = 2; i < totalFiles; i += 1) {
    const filePath = process.argv[i];
    const type = filePath.includes('modis') ? 'modis' : 'viirs';

    // https://github.com/Keyang/node-csvtojson#parameters
    csv({
      noheader: false,
      workerNum: workers, // workerNum >= 1
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
        // console.log(row);
        onRow(row, type);
      })
      .on('done', (error) => {
        if (error) { console.error(error); } else { onEnd(); }
      });
  }
});
