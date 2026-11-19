// SQL injection attempt strings against the sign-in inputs (search endpoints add their own strings in later suites).
import { spawnApp, client, suite, pgConnect, resetDb } from './lib.mjs';

export const SQLI = [
  "' OR '1'='1", "' OR 1=1 --", "admin'--", "ASK-2025-1834' --", "ASK-2025-1834'; DROP TABLE users; --", "x'; UPDATE users SET password_hash='x' WHERE '1'='1",
  '" OR ""="', "') OR ('1'='1", "1; SELECT pg_sleep(5)", "%' OR '%'='%", "\\'; --", "' UNION SELECT id, role, password_hash FROM users --", 'lervyn@email.com\' OR \'a\'=\'a', '\u0000', 'ADM-001\u0000'
];

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const t = suite('api-sqli');
  await resetDb();
  const app = await spawnApp();
  try {
    const pg = await pgConnect();
    const before = (await pg.query('select (select count(*) from users)::int u, (select md5(string_agg(password_hash, \',\' order by id)) from users) h')).rows[0];
    for (const portal of ['student', 'instructor', 'admin']) {
      for (const s of SQLI) {
        for (const body of [{ portal, identifier: s, password: 'password123' }, { portal, identifier: 'ADM-001', password: s }]) {
          const r = await client(app.base).post('/auth/login', body);
          t.check(`${portal} ${JSON.stringify(body.identifier === s ? 'id' : 'pw')} ${JSON.stringify(s).slice(0, 40)} -> 400/401, no session, no 500`, [400, 401].includes(r.status) && !r.json.user && !/error.*syntax|pg_|postgres|stack/i.test(r.text), `${r.status} ${r.text.slice(0, 120)}`);
        }
      }
    }
    const after = (await pg.query('select (select count(*) from users)::int u, (select md5(string_agg(password_hash, \',\' order by id)) from users) h')).rows[0];
    t.check('users table intact after all attempts (count and password hashes unchanged)', before.u === after.u && before.h === after.h);
    const fp = await client(app.base).post('/auth/forgot-password', { identifier: "x'; DROP TABLE users; --" });
    t.check('forgot-password with an injection string is harmless', fp.status === 202);
    await pg.end();
  } finally { await app.stop(); }
  t.done();
}
