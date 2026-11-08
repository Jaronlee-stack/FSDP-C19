/* =====================================================================
   AIKIDO SHINJU-KAI — data.js  (reference data + seed data)
   ===================================================================== */
'use strict';

/* ---------- DATA (fixed reference data) ---------- */
const DOJOS = [
  { id: 'hq', name: 'ASK Headquarters Dojo', short: 'HQ', code: 'ASK HQ', region: 'Central', addr: 'Thomson V One, 9 Sin Ming Road, #B1-02, Singapore 575630' },
  { id: 'bedok', name: 'ActiveSG Bedok Dojo', short: 'Bedok', code: 'BDAS', region: 'East', addr: 'Heartbeat@Bedok, 11 Bedok North Street 1, #01-02, Singapore 469662' },
  { id: 'tampines', name: 'Our Tampines Hub Dojo', short: 'Tampines', code: 'OTH', region: 'East', addr: '1 Tampines Walk, Singapore 528523' },
  { id: 'kovan', name: 'Paya Lebar Kovan Dojo', short: 'Kovan', code: 'PLKC', region: 'North East', addr: '207 Hougang Street 21, Singapore 530207' },
  { id: 'sengkang', name: 'ActiveSG Sengkang Dojo', short: 'Sengkang', code: 'SKAS', region: 'North East', addr: '57 Anchorvale Road, Singapore 544964' },
  { id: 'bishan', name: 'ActiveSG Bishan Dojo', short: 'Bishan', code: 'BSAS', region: 'Central', addr: '5 Bishan Street 14, Singapore 579783' },
  { id: 'toapayoh', name: 'SAFRA Toa Payoh Dojo', short: 'Toa Payoh', code: 'STPY', region: 'Central', addr: '293 Lorong 6 Toa Payoh, Singapore 319387' },
  { id: 'smu', name: 'SMU Dojo', short: 'SMU', code: 'SMUC', region: 'Central', addr: 'Singapore Management University, 81 Victoria Street, Singapore 188065' },
  { id: 'jurong', name: 'ActiveSG Jurong East Dojo', short: 'Jurong East', code: 'JEAS', region: 'West', addr: '21 Jurong East Street 31, Singapore 609517' },
  { id: 'westcoast', name: 'West Coast Dojo', short: 'West Coast', code: 'WCCC', region: 'West', addr: '2 Clementi West Street 2, Singapore 129605' },
  { id: 'woodlands', name: 'ActiveSG Woodlands Dojo', short: 'Woodlands', code: 'WDAS', region: 'North', addr: '2 Woodlands Street 12, Singapore 738599' },
  { id: 'chongpang', name: 'Chong Pang Dojo', short: 'Chong Pang', code: 'CPCC', region: 'North', addr: '109 Yishun Ring Road, Singapore 760109' },
  { id: 'tampineswest', name: 'Tampines West Dojo', short: 'Tampines W', code: 'TWCC', region: 'East', addr: '5 Tampines Avenue 3, Singapore 529705', status: 'Temporarily closed' }
];
const dojoName = id => (DOJOS.find(d => d.id === id) || {}).name || id;
const HQ = 'hq';

/* lesson packages. `name` is how a bought pack shows in the portal; days/months = validity */
const PKG = {
  adult: [
    { id: 'a10', t: '10 lessons', name: '10-lesson pack', amt: 270, d: 'Good for 1 class a week', per: 'S$27 per lesson', lessons: 10, days: 77, valid: 'Valid 11 weeks' },
    { id: 'a25', t: '25 lessons', name: '25-lesson pack', amt: 600, d: 'Most members start here', per: 'S$24 per lesson', lessons: 25, months: 4, valid: 'Valid 4 months', best: true },
    { id: 'a50', t: '50 lessons', name: '50-lesson pack', amt: 980, d: 'For 2 or more classes a week', per: 'S$19.60 per lesson', lessons: 50, months: 6, valid: 'Valid 6 months' },
    { id: 'aun', t: 'Unlimited', name: 'Unlimited', amt: 96, unit: '/ 2 weeks', d: 'Book as many classes as you like', per: 'Billed every 2 weeks', lessons: Infinity, days: 14, valid: '3-month minimum' }
  ],
  kids: [
    { id: 'k1', t: '1-month pass', name: 'Children 1-month pass', amt: 150, d: 'Up to 4 sessions over 5 weeks', per: 'Try it out', lessons: 4, days: 35, valid: 'Valid 5 weeks' },
    { id: 'k6', t: '6-month pass', name: 'Children 6-month pass', amt: 139, unit: '/ month', d: 'Up to 24 sessions', per: 'Billed monthly', lessons: 24, months: 6, valid: 'Valid 6 months', best: true },
    { id: 'k50', t: '50 lessons', name: 'Children 50-lesson pack', amt: 1200, d: 'Valid 6 months', per: 'S$24 per lesson', lessons: 50, months: 6, valid: 'Valid 6 months' }
  ]
};
const expiryFor = (p, from = TODAY) => p.months ? addMonths(from, p.months) : addDays(from, p.days);
const MAX_PACKAGES = 2;

const DOGI_SIZES = ['000', '00', '0', '1', '2', '3', '4', '5', '6', '7'];

const INSTRUCTORS = [
  ['Philip Lee Shihan', '7th Dan', 'philip-lee.png', true], ['Chew Eng Lam Sensei', '6th Dan', 'chew-eng-lam.jpg'],
  ['James Moy Sensei', '6th Dan', 'james-moy.jpg'], ['Allan Lai Sensei', '6th Dan', 'allan-lai.jpg'],
  ['Bob Tan Sensei', '6th Dan', 'bob-tan.jpg'], ['Quah Yong Lok Sensei', '6th Dan', 'quah-yong-lok.jpg'],
  ['Annie Goh Sensei', '6th Dan', 'annie-goh.jpg'], ['Tan Kok Hiang Sensei', '6th Dan', 'tan-kok-hiang.jpg'],
  ['Ronald Tan Sensei', '5th Dan', 'ronald-tan.jpg'], ['Lim Cheen Cheen Sensei', '5th Dan', 'lim-cheen-cheen.jpg'],
  ['Aloyseus Lee Sensei', '5th Dan', 'aloyseus-lee.jpg'], ['Alexander Lee Sensei', '5th Dan', 'alexander-lee.jpg'],
  ['Tham Wai Yip Sensei', '5th Dan', 'tham-wai-yip.jpg'], ['Steven Goh Sensei', '5th Dan', 'steven-goh.jpg'],
  ['James Tan Sensei', '5th Dan', 'james-tan.jpg'], ['Billy Lim Sensei', '5th Dan', 'billy-lim.jpg'],
  ['Pang Kim Lock Sensei', '5th Dan', 'pang-kim-lock.jpg'], ['Robin Tan Sensei', '5th Dan', 'robin-tan.jpg']
];

/* HQ weekly timetable (day: 0 = Mon). Online booking covers HQ classes only. */
const TIMES = ['09:00', '10:00', '11:00', '18:00', '19:00', '20:00'];
const timeLabel = t => { const h = +t.slice(0, 2); return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'); };
const CLASSES = [
  { day: 0, time: '18:00', type: 'Children Beginners', ins: 'Lim Cheen Cheen Sensei', cap: 14, booked: 10, kids: true },
  { day: 0, time: '19:00', type: 'Adults', ins: 'Bob Tan Sensei', cap: 20, booked: 14 },
  { day: 0, time: '20:00', type: 'Intermediate', ins: 'Bob Tan Sensei', cap: 16, booked: 11 },
  { day: 1, time: '18:00', type: 'Children Juniors', ins: 'Annie Goh Sensei', cap: 12, booked: 9, kids: true },
  { day: 1, time: '19:00', type: 'Adults', ins: 'James Tan Sensei', cap: 20, booked: 17 },
  { day: 1, time: '20:00', type: 'Ladies', ins: 'Annie Goh Sensei', cap: 14, booked: 6 },
  { day: 2, time: '19:00', type: 'Adults', ins: 'Bob Tan Sensei', cap: 20, booked: 12 },
  { day: 2, time: '20:00', type: 'Weapons', ins: 'Robin Tan Sensei', cap: 12, booked: 9 },
  { day: 3, time: '18:00', type: 'Children Beginners', ins: 'Lim Cheen Cheen Sensei', cap: 14, booked: 12, kids: true },
  { day: 3, time: '19:00', type: 'Adults', ins: 'Steven Goh Sensei', cap: 18, booked: 10 },
  { day: 3, time: '20:00', type: 'Advanced', ins: 'Bob Tan Sensei', cap: 14, booked: 8 },
  { day: 4, time: '19:00', type: 'Adults', ins: 'Bob Tan Sensei', cap: 20, booked: 15 },
  { day: 4, time: '20:00', type: 'Mixed', ins: 'Tan Kok Hiang Sensei', cap: 18, booked: 7 },
  { day: 5, time: '09:00', type: 'Children Juniors', ins: 'Lim Cheen Cheen Sensei', cap: 12, booked: 12, kids: true },
  { day: 5, time: '10:00', type: 'Children Beginners', ins: 'Lim Cheen Cheen Sensei', cap: 14, booked: 10, kids: true },
  { day: 5, time: '11:00', type: 'Mixed', ins: 'Bob Tan Sensei', cap: 20, booked: 13 },
  { day: 6, time: '09:00', type: 'Adults', ins: 'Tan Kok Hiang Sensei', cap: 20, booked: 16 },
  { day: 6, time: '10:00', type: 'SG50', ins: 'Annie Goh Sensei', cap: 16, booked: 9 },
  { day: 6, time: '11:00', type: 'Weapons', ins: 'Robin Tan Sensei', cap: 12, booked: 7 }
].map(c => ({ ...c, dojo: HQ }));

const BELTS = [
  { g: '6th Kyu', c: '#FFFFFF' }, { g: '5th Kyu', c: '#E9C84A' }, { g: '4th Kyu', c: '#8B5A2B' },
  { g: '3rd Kyu', c: '#A0702F' }, { g: '2nd Kyu', c: '#6E4520' }, { g: '1st Kyu', c: '#4E3015' }, { g: '1st Dan', c: '#14161B' }
];
const beltOf = g => (BELTS.find(b => b.g === g) || { c: '#ccc' }).c;
/* lower number = higher rank. Dan grades are 0 or below. */
const kyuOf = g => { const k = /^(\d+)\w* Kyu/.exec(g); if (k) return +k[1]; const d = /^(\d+)\w* Dan/.exec(g); return d ? 1 - +d[1] : 99; };

const ME = { name: 'Lervyn Wong', no: 'ASK-2025-1834', grade: '4th Kyu', dojo: 'hq', gender: 'Male', age: 20, group: 'adult' };

/* who may book which class (SSP-04) */
const CLASS_RULES = { Intermediate: { maxKyu: 4, why: '4th Kyu & above' }, Advanced: { maxKyu: 1, why: '1st Kyu & above' } };
function whyNot(c) {
  if (c.kids) return 'Children only';
  if (c.type === 'Ladies' && ME.gender !== 'Female') return 'Ladies only';
  if (c.type === 'SG50' && ME.age < 50) return 'Ages 50 & above';
  const r = CLASS_RULES[c.type];
  if (r && kyuOf(ME.grade) > r.maxKyu) return r.why;
  return '';
}


const isDeclining = s => s.seen >= 14;



const DSHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const sessionCode = (dojo, day, time, seed) => `${DOJOS.find(d => d.id === dojo).short.toUpperCase().replace(/\s/g, '')}-${DSHORT[day]}${+time.slice(0, 2) % 12 || 12}-${seed}`;


const newInv = () => 'INV-' + String(Date.now()).slice(-7);

const GRADING_FEE = { '6th Kyu': 40, '5th Kyu': 40, '4th Kyu': 50, '3rd Kyu': 50, '2nd Kyu': 60, '1st Kyu': 60, '1st Dan': 120 };
const LATE_FEE = 20;

/* student status labels used by the instructor portal.
   'In progress' = still building sessions toward the next grade (was "Studying"). */
const ST_PROGRESS = 'In progress', ST_QUALIFIED = 'Qualified';


/* curriculum for the target rank. Leaf = [technique, YouTube id]; no id = video not uploaded yet.
   The ids below are placeholder demonstrations; swap in HQ's own recordings. */
const CURRICULUM = {
  rank: '3rd Kyu',
  groups: [
    { t: 'Tachi-waza', s: 'Standing techniques', kids: [
      { t: 'Shomenuchi', s: 'Overhead strike', kids: [['Ikkyo', '5yldXwoVv44'], ['Nikyo'], ['Sankyo'], ['Yonkyo'], ['Iriminage'], ['Kotegaeshi']] },
      { t: 'Yokomenuchi', s: 'Diagonal strike to the side of the head', kids: [['Shihonage'], ['Iriminage'], ['Kotegaeshi']] },
      { t: 'Katatedori', s: 'One-hand wrist grab', kids: [['Shihonage', 'eC_Uctj1CyE'], ['Kaitennage'], ['Kokyunage']] },
      { t: 'Ryotedori', s: 'Two-hand wrist grab', kids: [['Tenchinage'], ['Shihonage']] },
      { t: 'Chudan tsuki', s: 'Punch to the midsection', kids: [['Kotegaeshi'], ['Iriminage']] }
    ] },
    { t: 'Suwari-waza', s: 'Both partners kneeling', kids: [
      { t: 'Shomenuchi', s: 'Overhead strike', kids: [['Ikkyo', 'tgOYPIPOn30'], ['Nikyo'], ['Sankyo']] },
      { t: 'Ryotedori', s: 'Two-hand wrist grab', kids: [['Kokyuho']] }
    ] },
    { t: 'Hanmi-handachi', s: 'Kneeling against a standing partner', kids: [
      { t: 'Katatedori', s: 'One-hand wrist grab', kids: [['Shihonage'], ['Kaitennage']] }
    ] },
    { t: 'Ukemi', s: 'Falling safely', kids: [['Mae ukemi'], ['Ushiro ukemi'], ['Tobi ukemi']] }
  ]
};

/* Starting data for the prototype. store.js copies this into localStorage the first time,
   so bookings, payments and approvals carry over from page to page. */
function SEED() {
  const daysAgo = n => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return d; };
  return {
    passes: [
  { id: 'P-1834-25', name: '25-lesson pack', total: 25, left: 18, bought: new Date(2026, 8, 15), expires: new Date(2027, 0, 15) }
],
    unlimited: null,
    students: [
  { n: 'Ahmad Karim', g: '4th Kyu', s: 29, need: 36, seen: 2, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' },
  { n: 'Jamie Tan', g: '3rd Kyu', s: 38, need: 36, seen: 1, st: 'Qualified', dojo: 'hq', age: 'Adult' },
  { n: 'Ming Ng', g: '4th Kyu', s: 22, need: 36, seen: 4, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' },
  { n: 'Priya Lee', g: '1st Kyu', s: 62, need: 60, seen: 3, st: 'Qualified', dojo: 'hq', age: 'Adult' },
  { n: 'David Koh', g: '5th Kyu', s: 14, need: 30, seen: 18, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' },
  { n: 'Lervyn Wong', g: '4th Kyu', s: 29, need: 36, seen: 2, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' },
  { n: 'Siti Rahman', g: '2nd Kyu', s: 44, need: 48, seen: 5, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' },
  { n: 'Marcus Lim', g: '6th Kyu', s: 9, need: 24, seen: 21, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' },
  { n: 'Hannah Teo', g: '5th Kyu', s: 31, need: 30, seen: 2, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' },
  { n: 'Kenji Sato', g: '3rd Kyu', s: 20, need: 36, seen: 6, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' },
  { n: 'Rachel Ong', g: '4th Kyu', s: 35, need: 36, seen: 1, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' },
  { n: 'Arjun Nair', g: '6th Kyu', s: 4, need: 24, seen: 3, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' },
  { n: 'Wei Jie Chua', g: '2nd Kyu', s: 50, need: 48, seen: 2, st: 'Qualified', dojo: 'hq', age: 'Adult' },
  { n: 'Grace Yeo', g: '5th Kyu', s: 18, need: 30, seen: 15, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' }
],
    apps: [
  { n: 'Sarah Lee', dojo: 'hq', date: '1 Nov 2026', paid: 690, group: 'Adult', age: 27, gender: 'Female', nat: 'Singaporean', phone: '9001 2345', email: 'sarah.lee@email.com', ec: 'Daniel Lee (Spouse) · 9002 3456', exp: '—', prev: 'No', med: 'No', dogi: 'Cotton (Standard), size 3', pkg: '25 lessons', signer: 'Sarah Lee' },
  { n: 'Raj Kumaran', dojo: 'kovan', date: '31 Oct 2026', paid: 375, group: 'Adult', age: 34, gender: 'Male', nat: 'Singapore PR', phone: '9123 9876', email: 'raj.k@email.com', ec: 'Meena Kumaran (Spouse) · 9765 4321', exp: 'Karate, 2 years · 7th Kyu', prev: 'No', med: 'Yes · Mild asthma, carries inhaler', dogi: 'Heavyweight Cotton, size 5', pkg: '10 lessons', signer: 'Raj Kumaran' },
  { n: 'Liu Wei', dojo: 'toapayoh', date: '30 Oct 2026', paid: 1100, group: 'Adult', age: 41, gender: 'Male', nat: 'Chinese', phone: '8234 5566', email: 'liu.wei@email.com', ec: 'Zhang Min (Spouse) · 8123 4455', exp: 'Aikido (Aikikai Beijing), 1st Kyu', prev: 'No', med: 'No', dogi: 'Competition Grade, size 4', pkg: '50 lessons', signer: 'Liu Wei' },
  { n: 'Emma Koh', dojo: 'bishan', date: '29 Oct 2026', paid: 240, group: 'Child', age: 9, gender: 'Female', nat: 'Singaporean', phone: '9345 6789', email: 'koh.family@email.com', ec: 'Jason Koh (Parent) · 9345 6789', exp: '—', prev: 'No', med: 'Yes · Peanut allergy', dogi: 'Cotton (Standard), size 0', pkg: '1-month pass', signer: 'Jason Koh (parent/guardian)' }
],
    members: [
  { n: 'Lervyn Wong', no: 'ASK-2025-1834', g: '4th Kyu', dojo: 'hq', hrs: 61, st: 'Active', joined: 'Jun 2025' },
  { n: 'Jamie Tan', no: 'ASK-2024-0921', g: '3rd Kyu', dojo: 'hq', hrs: 112, st: 'Active', joined: 'Mar 2024' },
  { n: 'David Koh', no: 'ASK-2024-1440', g: '5th Kyu', dojo: 'hq', hrs: 28, st: 'Lapsed', joined: 'Aug 2024' },
  { n: 'Priya Lee', no: 'ASK-2021-0310', g: '1st Kyu', dojo: 'hq', hrs: 284, st: 'Active', joined: 'Jan 2021' },
  { n: 'Siti Rahman', no: 'ASK-2022-0788', g: '2nd Kyu', dojo: 'kovan', hrs: 176, st: 'Active', joined: 'May 2022' },
  { n: 'Marcus Lim', no: 'ASK-2026-0102', g: '6th Kyu', dojo: 'toapayoh', hrs: 9, st: 'Active', joined: 'Feb 2026' },
  { n: 'Grace Yeo', no: 'ASK-2023-1203', g: '5th Kyu', dojo: 'bishan', hrs: 41, st: 'Lapsed', joined: 'Dec 2023' },
  { n: 'Kenji Sato', no: 'ASK-2023-0456', g: '3rd Kyu', dojo: 'westcoast', hrs: 98, st: 'Active', joined: 'Apr 2023' },
  { n: 'Wei Jie Chua', no: 'ASK-2022-0090', g: '2nd Kyu', dojo: 'hq', hrs: 190, st: 'Active', joined: 'Jan 2022' },
  { n: 'Hannah Teo', no: 'ASK-2025-0612', g: '5th Kyu', dojo: 'tampines', hrs: 47, st: 'Active', joined: 'Jun 2025' }
],
    sessions: CLASSES.map((c, i) => ({ ...c, code: sessionCode(c.dojo, c.day, c.time, (4821 + i * 137) % 9000 + 1000) })),
    gradApps: [
  { n: 'Jamie Tan', from: '3rd Kyu', to: '2nd Kyu', dojo: 'hq', sub: '1 Nov', note: 'Weapons requirement met', sched: null },
  { n: 'Priya Lee', from: '1st Kyu', to: '1st Dan', dojo: 'hq', sub: '30 Oct', note: 'Yudansha points 2.5 / 2.0', sched: null },
  { n: 'Wei Jie Chua', from: '2nd Kyu', to: '1st Kyu', dojo: 'hq', sub: '28 Oct', note: 'Weapons requirement met', sched: null }
],
    proposals: [
  { n: 'Hannah Teo', from: '5th Kyu', to: '4th Kyu', by: 'Steven Goh Sensei', result: 'Pass', well: 'Clean ukemi, good posture in ikkyo.', next: 'Keep your centre lower in iriminage.', fb: 'Clean ukemi, good posture in ikkyo.' },
  { n: 'Siti Rahman', from: '2nd Kyu', to: '1st Kyu', by: 'Robin Tan Sensei', result: 'Pass with merit', well: 'Excellent jo kata.', next: 'Start preparing for the yudansha track.', fb: 'Excellent jo kata. Ready for yudansha track.' }
],
    candidates: [
  { n: 'Jamie Tan', from: '3rd Kyu', to: '2nd Kyu', done: false },
  { n: 'Priya Lee', from: '1st Kyu', to: '1st Dan', done: false },
  { n: 'Wei Jie Chua', from: '2nd Kyu', to: '1st Kyu', done: false }
],
    pays: [
  { item: '25 lessons', date: '15 Sep 2026', method: 'Visa •••• 4242', amt: 600, st: 'Paid', inv: 'INV-2041870' },
  { item: 'Annual dues 2026', date: '2 Jan 2026', method: 'Visa •••• 4242', amt: 48, st: 'Paid', inv: 'INV-2042181' },
  { item: '10 lessons', date: '20 Nov 2025', method: 'PayNow', amt: 270, st: 'Paid', inv: 'INV-2042492' },
  { item: 'Registration, dogi and 10 lessons', date: '14 Jun 2025', method: 'Visa •••• 4242', amt: 375, st: 'Paid', inv: 'INV-2042803' }
],
    grade: {
  target: '3rd Kyu', targetLabel: '3rd Kyu (Brown)',
  date: new Date(2026, 11, 13), close: new Date(2026, 10, 29),
  memberMonths: 17, monthsInRank: 7, needMonths: 6,
  sessions: 29, needSessions: 36, feesPaid: true, qualified: false,
  submitted: null
},
    feedback: [],
    /* the signed-in student's past classes. status: 'present' (+1 session) | 'noshow' (lesson used, not counted) | 'pending' (waiting for the instructor) */
    attendance: [
  { date: daysAgo(3), time: '19:00', type: 'Adults', ins: 'Bob Tan Sensei', status: 'present' },
  { date: daysAgo(6), time: '19:00', type: 'Adults', ins: 'Bob Tan Sensei', status: 'present' },
  { date: daysAgo(10), time: '19:00', type: 'Adults', ins: 'James Tan Sensei', status: 'noshow' },
  { date: daysAgo(13), time: '19:00', type: 'Adults', ins: 'Bob Tan Sensei', status: 'present' },
  { date: daysAgo(17), time: '11:00', type: 'Mixed', ins: 'Bob Tan Sensei', status: 'present' },
  { date: daysAgo(24), time: '19:00', type: 'Adults', ins: 'Steven Goh Sensei', status: 'present' },
  { date: daysAgo(31), time: '19:00', type: 'Adults', ins: 'Bob Tan Sensei', status: 'present' }
],
    /* sessions counted (marked present) that the student hasn't seen on the gamified home yet */
    levelUps: [{ kind: 'session', date: daysAgo(3), type: 'Adults' }],
    /* instructor feedback from each grading the student has taken (newest first) */
    gradingFeedback: [
  { from: '5th Kyu', to: '4th Kyu', date: new Date(2026, 2, 13), by: 'Steven Goh Sensei', result: 'Pass',
    well: 'Confident ukemi and a calm, upright posture. Your shomenuchi ikkyo has good timing.',
    next: 'Keep your hips lower in iriminage and finish each throw before you turn away. Practise suwari-waza knee walking.' },
  { from: '6th Kyu', to: '5th Kyu', date: new Date(2025, 11, 14), by: 'Bob Tan Sensei', result: 'Pass',
    well: 'Good attendance and steady basics. Your rolls are safe on both sides.',
    next: 'Relax your shoulders when you grab, and keep eye contact with your partner.' }
],
    classEnded: {},   // instructor "End class": { 'YYYY-MM-DD|HH:MM': { at, present: [names], noshow: [names] } }
    bookings: [], rateQueue: [], rated: [], prompted: [], seeded: false
  };
}