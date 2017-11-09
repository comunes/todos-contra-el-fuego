const { defineSupportCode, setWorldConstructor } = require('cucumber')
var i18next = require('i18next')
var moment = require('moment-timezone')
var backend = require('i18next-sync-fs-backend')
var net = require('net');

class Bot {
  constructor() {
    this.robot = new net.Socket();

    this.robot.on('close', function() {
      console.log('Connection closed');
    });
  }

  read(callback) {
    this.robot.on('data', function(data) {
      // console.log('Received: ' + data);
      callback(data);
    });
  }

  connect() {
    this.robot.connect(6789, '127.0.0.1', function() {
      console.log('Connected\n');
      // this.write('/start\n');
    });
  }

  send(data) {
    this.robot.write(data);
  }

  destroy() {
    this.robot.destroy();
  }
}

var bot = new Bot();

// https://github.com/cucumber/cucumber-js/blob/master/docs/support_files/world.md
class CustomWorld {

  constructor() {
    this.variable = 0;
    this.i18n = i18next;
    this.bot = bot;

    var backOpts = {
      // path where resources get loaded from
      loadPath: 'locales/{{lng}}/{{ns}}.json',

      // path to post missing resources
      addPath: 'locales/{{lng}}/{{ns}}.missing.json',

      // jsonIndent to use when storing json files
      jsonIndent: 2
    };


    i18next.use(backend)
           .init({
             backend: backOpts,
             lng: 'es',
             //fallbackLng: 'es',
             fallbackLng: {
               'en-US': ['en'],
               'en-GB': ['en'],
               'pt-BR': ['pt'],
               'default': ['es']
             },
             whitelist: false,
             // whitelist: ['es', 'en'], // allowed languages
             load: 'all', // es-ES -> es, en-US -> en
             debug: false,
             ns: 'telegram-bot',
             defaultNS: 'telegram-bot',
             saveMissing: false, // if true seems it's fails to getResourceBundle
             saveMissingTo: 'all',
             keySeparator: 'ß',
             nsSeparator: 'ð',
             pluralSeparator: 'đ',
             initImmediate: false,
           }, function(err, t) {
             if (err) {
               console.log(err);
             }
             /* i18next.loadLanguages(['es', 'en', 'pt', 'ast', 'gl'], function() {
               // var t = global.get('lang-pt');
               // node.log(t('Sí'));
             }); */
           }
           );
  }

  t(string) {
    return this.i18n.t(string);
  }

  changeLanguage(lng) {
    // console.log("Trying to set language to: " + lng);
    this.i18n.changeLanguage(lng);
  }

  setTo(number) {
    this.variable = number
  }

  incrementBy(number) {
    this.variable += number
  }
}

setWorldConstructor(CustomWorld)


// https://github.com/cucumber/cucumber-js/blob/master/docs/support_files/hooks.md

defineSupportCode(function({AfterAll, BeforeAll}) {
  // Synchronous
  BeforeAll(function () {
 // perform some shared setup
  });

  // Asynchronous Callback
  BeforeAll(function (callback) {
    // bot.connect();
    callback();

    // perform some shared setup
    // execute the callback (optionally passing an error when done)
  });

  // Asynchronous Promise
  AfterAll(function () {
    bot.destroy();
    // perform some shared teardown
    return Promise.resolve()
  });
});
