// Runs every verify-feat*.mjs, then regress.mjs. Exit code 1 if any script fails.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = fs.readdirSync(here).filter(f => /^verify-feat\d+\.mjs$/.test(f)).sort().concat(['regress.mjs']);
let bad = 0;
for (const s of scripts) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync(process.execPath, [path.join(here, s)], { stdio: 'inherit' });
  if (r.status !== 0) { bad++; console.log(`!! ${s} exited with ${r.status}`); }
}
console.log(bad ? `\n${bad} script(s) failed` : '\nall scripts passed');
process.exitCode = bad ? 1 : 0;
