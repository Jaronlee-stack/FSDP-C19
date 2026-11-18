// Loads database/db.sql then database/seed.sql into the PGlite started by db.mjs (twice, to prove re-runnability).
import { resetDb, pgConnect } from './lib.mjs';

await resetDb();
await resetDb();
const c = await pgConnect();
const n = (await c.query('select (select count(*) from users)::int u, (select count(*) from class_session)::int s, (select count(*) from v_grading_conflict)::int g')).rows[0];
await c.end();
console.log(`reset ok (db.sql + seed.sql loaded twice): users=${n.u} class_session=${n.s} grading_conflicts=${n.g}`);
if (n.g !== 0 || n.u < 30) process.exit(1);
