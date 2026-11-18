'use strict';
/* ASK / Aikido Shinju-Kai server: JSON API under /api/v1 plus the static portals in src/public. */
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./src/config');
const security = require('./src/middleware/security');
const { errorHandler } = require('./src/middleware/error');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(security());
  app.use(cookieParser());

  /* API: JSON only (mutating requests must be application/json: see middleware/requireJson.js) */
  app.use(config.API_PREFIX, express.json({ limit: '100kb' }), require('./src/routes'));

  /* static front end */
  app.use(express.static(path.join(__dirname, 'src', 'public'), { index: 'index.html' }));
  app.get('/', (req, res) => res.redirect(302, '/landingpage/index.html'));

  app.use(errorHandler);
  return app;
}

module.exports = createApp;

if (require.main === module) {
  const app = createApp();
  config.warnings.forEach(w => console.warn('[config] ' + w));
  const server = app.listen(config.PORT, () => {
    console.log(`ASK server listening on port ${config.PORT} (${config.NODE_ENV}), API at ${config.API_PREFIX}${config.FAKE_TODAY ? `, fake today ${config.FAKE_TODAY}` : ''}`);
  });
  const stop = () => server.close(() => require('./src/config/db').pool.end().finally(() => process.exit(0)));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
