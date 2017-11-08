const { setWorldConstructor } = require('cucumber')
var i18next = require('i18next')
var moment = require('moment-timezone')
var backend = require('i18next-sync-fs-backend')

class CustomWorld {

  constructor() {
    this.variable = 0;
    this.i18n = i18next;
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
