import { pgConnect } from './lib.mjs';
const c = await pgConnect();
const q = async (s, p = []) => (await c.query(s, p)).rows;
const t = rows => console.table(rows);
t(await q(`select sp.user_id, sp.member_no, sp.full_name, sp.age_group, sp.gender, sp.rank_id, sp.dojo_id, sp.source, m.account_status st, to_char(sp.dob,'YYYY-MM-DD') dob, sp.discount_type d from student_profile sp left join membership m using(user_id) order by 1`));
t(await q(`select sk.id, sk.user_id, sk.package_id, sk.lessons_total t, sk.lessons_left l, to_char(sk.expires_at,'YYYY-MM-DD') exp, sk.status from student_package sk order by 2,1`));
t(await q(`select id, user_id, item, kind, amount::float, status, channel, student_package_id sp from payment order by id`));
await c.end();
