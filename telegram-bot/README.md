# Tod@s contra el Fuego (All Against Fire), the Telegrab bot

This is a Telegram bot that notifies about fires detected in an area of your interest. It helps the early detection of fires and facilitates local mobilization, while the professional extinction services arrive.

## Install

Install `node-red` and `mongodb`. Run `npm install`.

## Configure

Use `settings.sample.js` as template, should be renamed to settigs.js

## Run node-red

Run node red in this directory with:

```bash
node-red --userDir .
```
You should re-configure the Telegram Bot (use @BotFather) with a new bot token. Also you will need a Google Map Api and a NASA ftp account.

Run via `cron` or `watch -n600` in development (every 10 min):
```
./ftp-get-timestamp.sh <nasa-user> <nasa-password> <directory>
```
to get the NASA fire data when modified in that directory. Also check the `config-dev` and `config-prod` node to mathc `directory` with `ftp-path`.

## Mongo Indexes

Create this mongo indexes
```mongodb
db.subscriptions.createIndex( { geo : "2dsphere" } )
db.subscriptions.createIndex( { chatId: 1 }
#
db.notifications.createIndex( { geo : "2dsphere" } )
db.notifications.createIndex( { chatId: 1 })
#
db.fstats.createIndex( { name: 1 } )
#
db.avisosfuego.createIndex( { chatId: 1 })
db.avisosfuego.createIndex( { geo : "2dsphere" } )
#
db.falsepositives.createIndex( { chatId: 1 })
db.falsepositives.createIndex( { geo : "2dsphere" } )
#
db.users.createIndex( { telegramChatId: 1 } )
db.users.createIndex( { lang: 1 } )
db.users.createIndex( { updated: 1 } )
#
db.activefiresmodis.createIndex( { _id: "2dsphere" } )
db.activefiresmodis.createIndex( { when: 1 } )
db.activefiresmodis.createIndex( { updatedAt: 1 } )
db.activefiresmodis.createIndex( { createdAt: 1 } )
#
db.activefiresviirs.createIndex( { _id: "2dsphere" } )
db.activefiresviirs.createIndex( { when: 1 } )
db.activefiresviirs.createIndex( { updatedAt: 1 } )
db.activefiresviirs.createIndex( { createdAt: 1 } )

```

## Telegram Comands

```
start - Ir al menú de Inicio
inicio - Igual que /start ;-)
suscribirme - a alertas de fuegos
distancia - a la que monitorizar
info - sobre tu subscripción
lang - seleccionar idioma
```

## Dependencies

`nc` and `ncftp` to get NASA data.

## Testing

You need to install also:

```bash
npm i cucumber
npm i chai
npm i i18next-sync-fs-backend
npm i net
```

And run test with commands like:
```bash
node_modules/cucumber/bin/cucumber.js --tags "not @ignore"
```

## Data source acknowledgements

*We acknowledge the use of data and imagery from LANCE FIRMS operated by the NASA/GSFC/Earth Science Data and Information System (ESDIS) with funding provided by NASA/HQ*.

## Thanks & other acknowlegments

- Lui, Galician translation
- Enol P at softastur.org, Asturian translation
- Original idea and development by [@vjrj](https://github.com/vjrj)
