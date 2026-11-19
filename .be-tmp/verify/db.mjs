// Starts an in-memory PGlite exposed on a TCP port (Postgres wire protocol) and stays alive until killed.
// Run in the background: node .be-tmp/verify/db.mjs
import fs from 'node:fs';
import { importDb, freePort, DB_PORT_FILE } from './lib.mjs';

const { PGlite } = await importDb('@electric-sql/pglite');
const { PGLiteSocketServer } = await importDb('@electric-sql/pglite-socket');
const db = await PGlite.create();
const port = await freePort();
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 8 });
await server.start();
fs.writeFileSync(DB_PORT_FILE, String(port));
console.log('PGlite listening on 127.0.0.1:' + port);
const stop = async () => { try { await server.stop(); await db.close(); } catch (_) { /* ignore */ } try { fs.unlinkSync(DB_PORT_FILE); } catch (_) { /* gone */ } process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
