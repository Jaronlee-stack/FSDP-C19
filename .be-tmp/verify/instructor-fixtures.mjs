// Fixtures for the instructor suites: lessons and grading panels around the server's current time (the date is pinned by APP_FAKE_TODAY).
const TODAY = '2026-11-06', TOMORROW = '2026-11-07', YESTERDAY = '2026-11-05';
const pad = n => String(n).padStart(2, '0');
export function sgNow() {
  const o = {};
  for (const p of new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date())) o[p.type] = Number(p.value);
  return o.hour * 60 + o.minute;
}
const hm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const usable = () => { const m = sgNow(); return m >= 20 && m <= 22 * 60; };   // live fixtures need start >= 00:00 and end <= 23:59 the same day
export async function makeFixtures(pg) {
  const m = sgNow();
  const f = { today: TODAY, tomorrow: TOMORROW, yesterday: YESTERDAY, usable: usable() };
  const addLesson = (id, day, start, end, type, ins = 'INS-0042') => pg.query(
    `INSERT INTO class_session (lesson_id, dojo_id, session_date, start_time, end_time, mat, class_type, instructor_id, capacity) VALUES ($1, 'hq', $2, $3, $4, 'Mat B', $5, $6, 20)`,
    [id, day, start, end, type, ins]);
  const book = (lessonId, ids) => Promise.all(ids.map(u => pg.query(`INSERT INTO class_attendance (lesson_id, user_id, attendance_status, booked_via) VALUES ($1, $2, 'Booked', 'online')`, [lessonId, u])));
  f.later = 'LS-FIX-LATER'; f.past = 'LS-FIX-PAST'; f.live = 'LS-FIX-LIVE'; f.weapons = 'LS-FIX-WEAP'; f.end = 'LS-FIX-END';
  await addLesson(f.later, TOMORROW, '12:00', '13:00', 'Adults'); await book(f.later, ['S-001']);
  await addLesson(f.past, YESTERDAY, '10:00', '11:00', 'Adults'); await book(f.past, ['S-001', 'S-002']);
  if (f.usable) {
    const s = m - 10, e = m + 50;   // started ten minutes ago, ends in fifty
    for (const [id, type] of [[f.live, 'Adults'], [f.weapons, 'Weapons'], [f.end, 'Mixed']]) { await addLesson(id, TODAY, hm(s), hm(e), type); await book(id, ['S-001', 'S-002', 'S-011']); }
    // grading panel in progress: Bob examines, two other examiners, three candidates
    f.gr = 'GR-FIX1';
    await pg.query(`INSERT INTO grading_session (id, label, session_date, start_time, end_time, dojo_id, lead_examiner_id, status) VALUES ($1, 'Fixture grading', $2, $3, $4, 'hq', 'INS-0042', 'Scheduled')`, [f.gr, TODAY, hm(m - 5), hm(m + 55)]);
    await pg.query(`INSERT INTO grading_examiner (session_id, instructor_id) VALUES ($1, 'INS-0042'), ($1, 'INS-0031')`, [f.gr]);
    for (const [u, from, to] of [['S-002', '3k', '2k'], ['S-009', '2k', '1k'], ['S-010', '5k', '4k']]) {
      await pg.query(`INSERT INTO grading_candidate (session_id, user_id, from_rank_id, to_rank_id, fee) VALUES ($1, $2, $3, $4, 60)`, [f.gr, u, from, to]);
    }
  }
  // a panel tomorrow (locked) and one yesterday (over), both with Bob as examiner
  f.grTomorrow = 'GR-FIX2'; f.grPast = 'GR-FIX3';
  for (const [id, day] of [[f.grTomorrow, TOMORROW], [f.grPast, YESTERDAY]]) {
    await pg.query(`INSERT INTO grading_session (id, label, session_date, start_time, end_time, dojo_id, lead_examiner_id, status) VALUES ($1, $3, $2, '10:00', '11:00', 'hq', 'INS-0042', 'Scheduled')`, [id, day, 'Fixture ' + id]);
    await pg.query(`INSERT INTO grading_examiner (session_id, instructor_id) VALUES ($1, 'INS-0042')`, [id]);
    await pg.query(`INSERT INTO grading_candidate (session_id, user_id, from_rank_id, to_rank_id, fee) VALUES ($1, 'S-011', '5k', '4k', 50)`, [id]);
  }
  return f;
}
