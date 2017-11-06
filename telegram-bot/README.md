# Install #

Install `node-red` and `mongodb`. Run `npm install`.

# Configure #

Use `settings.sample.js` as template, should be renamed to settigs.js

# Run node-red #

Run node red in this directory with:

```bash
node-red --userDir .
```
You should re-configure the Telegram Bot (use @BotFather) with a new bot token. Also you will need a Google Map Api and a NASA ftp account.

Also the `config-dev` node.

# Mongo Indexes #

Create this mongo indexes
```mongodb
db.subscriptions.createIndex( { geo : "2dsphere" } )
db.subscriptions.createIndex( { chatId: 1 }
db.notifications.createIndex( { geo : "2dsphere" } )
db.notifications.createIndex( { chatId: 1 })
db.fstats.createIndex( { name: 1 } )
db.avisosfuego.createIndex( { chatId: 1 })
db.avisosfuego.createIndex( { geo : "2dsphere" } )
db.falsepositives.createIndex( { chatId: 1 })
db.falsepositives.createIndex( { geo : "2dsphere" } )
db.users.createIndex( { telegramChatId: 1 } )
db.users.createIndex( { lang: 1 } )
db.users.createIndex( { updated: 1 } )
```

# Telegram Comands #

```
start - Ir al menú de Inicio
inicio - Igual que /start ;-)
suscribirme - a alertas de fuegos
distancia - a la que monitorizar
info - sobre tu subscripción
lang - seleccionar idioma
```

# Acknowledgements #

*We acknowledge the use of data and imagery from LANCE FIRMS operated by the NASA/GSFC/Earth Science Data and Information System (ESDIS) with funding provided by NASA/HQ*.
