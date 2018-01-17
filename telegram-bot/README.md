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

Create this mongo indexes:

```mongodb
db.subscriptions.createIndex( { geo : "2dsphere" } );
db.subscriptions.createIndex( { chatId: 1 });
#
db.notifications.createIndex( { geo : "2dsphere" } );
db.notifications.createIndex( { chatId: 1 });
#
db.fstats.createIndex( { name: 1 } );
#
db.avisosfuego.createIndex( { chatId: 1 });
db.avisosfuego.createIndex( { geo : "2dsphere" } );
#
db.falsepositives.createIndex( { chatId: 1 });
db.falsepositives.createIndex( { geo : "2dsphere" } );
#
db.users.createIndex( { telegramChatId: 1 } );
db.users.createIndex( { lang: 1 } );
db.users.createIndex( { updated: 1 } );
#
db.activefires.createIndex( { ourid: "2dsphere" } );
db.activefires.createIndex( { when: 1 } );
db.activefires.createIndex( { updatedAt: 1 } );
db.activefires.createIndex( { createdAt: 1 } );
db.activefires.createIndex( { ourid: 1, type: 1 } )
#
db.trackedfires.createIndex( { ourid : "2dsphere" } );
db.trackedfires.createIndex( { "name": 1 }, { unique: true } );
#
db.trackedfireshistory.createIndex( { "ourid": 1 }, { unique: true } );
#
db.fires.createIndex( { ourid: "2dsphere" } );
db.fires.createIndex( { when: 1 } );
db.fires.createIndex( { updatedAt: 1 } );
db.fires.createIndex( { createdAt: 1 } );
db.fires.createIndex( { ourid: 1, type: 1 } )
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

`netcat` and `ncftp` to get NASA data.

## Track some fires

You can track some special fires (like industries) inserting a document like this:
```
db.trackedfires.insert({
    "_id" : {
        "type" : "Point",
        "coordinates" : [
            124.565,
            -17.363
        ]
    },
    "name": "ACME Industries",
    "file": "acme.json"
})
```
and will store fire activity in acme.json.

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
## Force active fire files read

```
 echo -n "ping" | nc 127.0.0.1 40001 -q 0 ; echo -n "ping" | nc 127.0.0.1 40002 -q 0
```

## Running via pm2

Following https://nodered.org/docs/getting-started/running something like:
```
pm2 start --name "tcef-bot" /usr/local/bin/node-red -- --userDir /opt/node-red-data/
pm2 save
```
should work.

## Running via docker

Follow: https://nodered.org/docs/platforms/docker

If you have your flows, etc in `/opt/node-red`:

```
docker run -it --restart=always -p 1880:1880 -p 40001:40001 -p 40002:40002  -v /opt/node-red-data:/data --name todos_contra_el_fuego nodered/node-red-docker
```

## Data source acknowledgements

*We acknowledge the use of data and imagery from LANCE FIRMS operated by the NASA/GSFC/Earth Science Data and Information System (ESDIS) with funding provided by NASA/HQ*.

## Thanks & other acknowlegments

Thanks indeed to:
- Lui for Galician and Portuguese translation
- Jose González Besteiro for Galician and English translation
- Enol P at softastur.org for Asturian translation

Original idea and development by [@vjrj](https://github.com/vjrj)
