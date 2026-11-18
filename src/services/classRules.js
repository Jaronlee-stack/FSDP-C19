'use strict';
/* Who may book which class. The text is shown to the student, so it keeps the wording of the prototype (data.js whyNot()).
   belt_rank.sort_order: 1 = 6th Kyu ... 3 = 4th Kyu, 6 = 1st Kyu, 7 = 1st Dan. */
const MIN_RANK_ORDER = { Intermediate: { order: 3, why: '4th Kyu & above' }, Advanced: { order: 6, why: '1st Kyu & above' } };

/* student: { ageGroup: 'Adult'|'Child', gender, ageOnDay, rankOrder }  session: { class_type, kids_only }
   returns '' when the student may book, else the reason */
function whyNot(student, session) {
  const kidsClass = !!session.kids_only;
  if (kidsClass && student.ageGroup !== 'Child') return 'Children only';
  if (!kidsClass && student.ageGroup === 'Child' && session.class_type !== 'Mixed') return 'Adults only';
  if (session.class_type === 'Ladies' && student.gender !== 'Female') return 'Ladies only';
  if (session.class_type === 'SG50' && (student.ageOnDay === null || student.ageOnDay < 50)) return 'Ages 50 & above';
  const r = MIN_RANK_ORDER[session.class_type];
  if (r && student.rankOrder < r.order) return r.why;
  return '';
}

module.exports = { whyNot, MIN_RANK_ORDER };
