// Starts the app against the PGlite database (env for this run only) and stays alive until killed.
// Run in the background: node .be-tmp/verify/server.mjs   (writes .be-tmp/verify/.server.json with the base URL)
import fs from 'node:fs';
import { spawnApp, SERVER_FILE } from './lib.mjs';

const app = await spawnApp();
fs.writeFileSync(SERVER_FILE, JSON.stringify({ base: app.base, port: app.port }));
console.log('app listening on ' + app.base);
const stop = async () => { await app.stop(); try { fs.unlinkSync(SERVER_FILE); } catch (_) { /* gone */ } process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
app.proc.on('exit', () => { try { fs.unlinkSync(SERVER_FILE); } catch (_) { /* gone */ } process.exit(1); });
setInterval(() => {}, 1 << 30);
