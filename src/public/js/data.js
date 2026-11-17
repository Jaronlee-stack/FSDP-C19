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
    { id: 'aun', t: 'Unlimited', name: 'Unlimited', amt: 96, unit: '/ 2 weeks', d: 'Book as many classes as you like', per: 'S$48 a week, billed every 2 weeks', lessons: Infinity, days: 14, valid: '3-month minimum' }
  ],
  kids: [
    { id: 'k1', t: '1-month pass', name: 'Children 1-month pass', amt: 150, d: '4 lessons, valid 5 weeks from your first session', per: 'Try it out', lessons: 4, days: 35, valid: 'Valid 5 weeks', compassion: true },
    { id: 'k6', t: '6-month pass', name: 'Children 6-month pass', amt: 139, unit: '/ month', d: '24 lessons · or S$834 per semester', per: 'Semester-based billing', lessons: 24, months: 6, valid: 'Valid 6 months', best: true },
    { id: 'k50', t: '50 lessons', name: 'Children 50-lesson pack', amt: 1200, unit: '/ semester', d: 'Valid 6 months from your first session', per: 'S$24 per lesson', lessons: 50, months: 6, valid: 'Valid 6 months' }
  ]
};
const expiryFor = (p, from = TODAY) => p.months ? addMonths(from, p.months) : addDays(from, p.days);
const MAX_PACKAGES = 2;

/* package extensions (from the official fee terms):
   - Compassion Guaranteed: up to 2 weeks on the children's 1-month pass, no questions asked
   - any other extension past the stated validity needs a valid medical certificate (MC) */
const COMPASSION_DAYS = 14;

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
  { day: 6, time: '11:00', type: 'Weapons', ins: 'Pang Kim Lock Sensei', cap: 12, booked: 7 }
].map(c => ({ ...c, dojo: HQ }));

/* SAMPLE timetables for the other dojos (admin portal only). There is no real source for these: the public site says to ask HQ for each term's timetable.
   They are NOT bookable online (online booking is HQ only), so they are kept out of CLASSES. */
const OTHER_DOJO_CLASSES = [
  { dojo: 'bedok', day: 1, time: '19:00', type: 'Adults', ins: 'Chew Eng Lam Sensei', cap: 16, booked: 9 },
  { dojo: 'bedok', day: 5, time: '10:00', type: 'Children Beginners', ins: 'Ronald Tan Sensei', cap: 12, booked: 7, kids: true },
  { dojo: 'tampines', day: 0, time: '19:00', type: 'Adults', ins: 'Quah Yong Lok Sensei', cap: 18, booked: 11 },
  { dojo: 'tampines', day: 5, time: '11:00', type: 'Mixed', ins: 'Aloyseus Lee Sensei', cap: 16, booked: 8 },
  { dojo: 'kovan', day: 2, time: '19:00', type: 'Adults', ins: 'Allan Lai Sensei', cap: 16, booked: 8 },
  { dojo: 'kovan', day: 6, time: '10:00', type: 'Children Beginners', ins: 'Alexander Lee Sensei', cap: 12, booked: 6, kids: true },
  { dojo: 'sengkang', day: 3, time: '20:00', type: 'Adults', ins: 'Tham Wai Yip Sensei', cap: 16, booked: 9 },
  { dojo: 'sengkang', day: 5, time: '09:00', type: 'Children Juniors', ins: 'Billy Lim Sensei', cap: 12, booked: 7, kids: true },
  { dojo: 'bishan', day: 0, time: '20:00', type: 'Adults', ins: 'James Moy Sensei', cap: 16, booked: 10 },
  { dojo: 'bishan', day: 1, time: '18:00', type: 'Children Beginners', ins: 'Tan Kok Hiang Sensei', cap: 14, booked: 8, kids: true },
  { dojo: 'toapayoh', day: 2, time: '20:00', type: 'Mixed', ins: 'Quah Yong Lok Sensei', cap: 18, booked: 9 },
  { dojo: 'toapayoh', day: 3, time: '19:00', type: 'SG50', ins: 'Chew Eng Lam Sensei', cap: 14, booked: 7 },
  { dojo: 'jurong', day: 0, time: '19:00', type: 'Adults', ins: 'Allan Lai Sensei', cap: 16, booked: 9 },
  { dojo: 'jurong', day: 5, time: '10:00', type: 'Children Juniors', ins: 'James Moy Sensei', cap: 12, booked: 6, kids: true },
  { dojo: 'westcoast', day: 1, time: '20:00', type: 'Adults', ins: 'Ronald Tan Sensei', cap: 16, booked: 8 },
  { dojo: 'westcoast', day: 6, time: '09:00', type: 'Mixed', ins: 'Aloyseus Lee Sensei', cap: 16, booked: 7 },
  { dojo: 'woodlands', day: 2, time: '19:00', type: 'Adults', ins: 'Tham Wai Yip Sensei', cap: 16, booked: 9 },
  { dojo: 'woodlands', day: 6, time: '10:00', type: 'Children Beginners', ins: 'Billy Lim Sensei', cap: 12, booked: 6, kids: true },
  { dojo: 'chongpang', day: 4, time: '19:00', type: 'Adults', ins: 'Alexander Lee Sensei', cap: 14, booked: 7 },
  { dojo: 'chongpang', day: 2, time: '18:00', type: 'Children Juniors', ins: 'Tan Kok Hiang Sensei', cap: 12, booked: 6, kids: true }
];

/* one-to-one lessons. Only the instructor sees these: they are arranged with the office, so they are not on the booking timetable. */
const PRIVATE_CLASSES = [
  { day: 0, time: '17:00', type: 'Advanced', ins: 'Bob Tan Sensei', cap: 1, booked: 1, private: true, student: 'Priya Lee' },
  { day: 2, time: '18:00', type: 'Adults', ins: 'Bob Tan Sensei', cap: 1, booked: 1, private: true, student: 'Jamie Tan' },
  { day: 5, time: '10:00', type: 'Intermediate', ins: 'Bob Tan Sensei', cap: 1, booked: 1, private: true, student: 'Ming Ng' }
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
  /* most recent date strictly before today that falls on this weekday (0 = Mon), then weeksBack whole weeks earlier */
  const lastDow = (dow, weeksBack = 0) => daysAgo((((TODAY.getDay() + 6) % 7) - dow + 6) % 7 + 1 + 7 * weeksBack);
  const SES = [...CLASSES, ...OTHER_DOJO_CLASSES].map((c, i) => ({ ...c, code: sessionCode(c.dojo, c.day, c.time, (4821 + i * 137) % 9000 + 1000) }));
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
  { n: 'Siti Rahman', g: '2nd Kyu', s: 44, need: 48, seen: 5, st: ST_PROGRESS, dojo: 'kovan', age: 'Adult' },
  { n: 'Marcus Lim', g: '6th Kyu', s: 9, need: 24, seen: 21, st: ST_PROGRESS, dojo: 'toapayoh', age: 'Adult' },
  { n: 'Hannah Teo', g: '5th Kyu', s: 31, need: 30, seen: 2, st: ST_PROGRESS, dojo: 'tampines', age: 'Adult' },
  { n: 'Kenji Sato', g: '3rd Kyu', s: 20, need: 36, seen: 6, st: ST_PROGRESS, dojo: 'westcoast', age: 'Adult' },
  { n: 'Rachel Ong', g: '4th Kyu', s: 35, need: 36, seen: 1, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' },
  { n: 'Arjun Nair', g: '6th Kyu', s: 4, need: 24, seen: 3, st: ST_PROGRESS, dojo: 'hq', age: 'Adult' },
  { n: 'Wei Jie Chua', g: '2nd Kyu', s: 50, need: 48, seen: 2, st: 'Qualified', dojo: 'hq', age: 'Adult' },
  { n: 'Grace Yeo', g: '5th Kyu', s: 18, need: 30, seen: 15, st: ST_PROGRESS, dojo: 'bishan', age: 'Adult' }
],
    apps: [
  { n: 'Sarah Lee', dojo: 'hq', date: '1 Nov 2026', paid: 690, group: 'Adult', age: 27, gender: 'Female', nat: 'Singaporean', phone: '9001 2345', email: 'sarah.lee@email.com', ec: 'Daniel Lee (Spouse) · 9002 3456', exp: '—', prev: 'No', med: 'No', dogi: 'Cotton (Standard), size 3', pkg: '25 lessons', signer: 'Sarah Lee' },
  { n: 'Raj Kumaran', dojo: 'kovan', date: '31 Oct 2026', paid: 375, group: 'Adult', age: 34, gender: 'Male', nat: 'Singapore PR', phone: '9123 9876', email: 'raj.k@email.com', ec: 'Meena Kumaran (Spouse) · 9765 4321', exp: 'Karate, 2 years · 7th Kyu', prev: 'No', med: 'Yes · Mild asthma, carries inhaler', dogi: 'Heavyweight Cotton, size 5', pkg: '10 lessons', signer: 'Raj Kumaran' },
  { n: 'Liu Wei', dojo: 'toapayoh', date: '30 Oct 2026', paid: 1100, group: 'Adult', age: 41, gender: 'Male', nat: 'Chinese', phone: '8234 5566', email: 'liu.wei@email.com', ec: 'Zhang Min (Spouse) · 8123 4455', exp: 'Aikido (Aikikai Beijing), 1st Kyu', prev: 'No', med: 'No', dogi: 'Competition Grade, size 4', pkg: '50 lessons', signer: 'Liu Wei' },
  { n: 'Emma Koh', dojo: 'bishan', date: '29 Oct 2026', paid: 240, group: 'Child', age: 9, gender: 'Female', nat: 'Singaporean', phone: '9345 6789', email: 'koh.family@email.com', ec: 'Jason Koh (Parent) · 9345 6789', exp: '—', prev: 'No', med: 'Yes · Peanut allergy', dogi: 'Cotton (Standard), size 0', pkg: '1-month pass', signer: 'Jason Koh (parent/guardian)' }
],
    members: [
  { n: 'Lervyn Wong', no: 'ASK-2025-1834', g: '4th Kyu', dojo: 'hq', hrs: 61, st: 'Active', joined: 'Jun 2025', joinedAt: '2025-06-14' },
  { n: 'Jamie Tan', no: 'ASK-2024-0921', g: '3rd Kyu', dojo: 'hq', hrs: 112, st: 'Active', joined: 'Mar 2024', joinedAt: '2024-03-18' },
  { n: 'David Koh', no: 'ASK-2024-1440', g: '5th Kyu', dojo: 'hq', hrs: 28, st: 'Lapsed', joined: 'Aug 2024', joinedAt: '2024-08-13' },
  { n: 'Priya Lee', no: 'ASK-2021-0310', g: '1st Kyu', dojo: 'hq', hrs: 284, st: 'Active', joined: 'Jan 2021', joinedAt: '2021-01-11' },
  { n: 'Siti Rahman', no: 'ASK-2022-0788', g: '2nd Kyu', dojo: 'kovan', hrs: 176, st: 'Active', joined: 'May 2022', joinedAt: '2022-05-09' },
  { n: 'Marcus Lim', no: 'ASK-2026-0102', g: '6th Kyu', dojo: 'toapayoh', hrs: 9, st: 'Active', joined: 'Sep 2026', joinedAt: '2026-09-14' },
  { n: 'Grace Yeo', no: 'ASK-2023-1203', g: '5th Kyu', dojo: 'bishan', hrs: 41, st: 'Lapsed', joined: 'Dec 2023', joinedAt: '2023-12-05' },
  { n: 'Kenji Sato', no: 'ASK-2023-0456', g: '3rd Kyu', dojo: 'westcoast', hrs: 98, st: 'Active', joined: 'Apr 2023', joinedAt: '2023-04-17' },
  { n: 'Wei Jie Chua', no: 'ASK-2022-0090', g: '2nd Kyu', dojo: 'hq', hrs: 190, st: 'Active', joined: 'Jan 2022', joinedAt: '2022-01-24' },
  { n: 'Hannah Teo', no: 'ASK-2025-0612', g: '5th Kyu', dojo: 'tampines', hrs: 47, st: 'Active', joined: 'Jun 2025', joinedAt: '2025-06-21' }
],
    sessions: SES,
    gradApps: [
  { n: 'Jamie Tan', from: '3rd Kyu', to: '2nd Kyu', dojo: 'hq', sub: '1 Nov', note: 'Weapons requirement met', sched: null },
  { n: 'Priya Lee', from: '1st Kyu', to: '1st Dan', dojo: 'hq', sub: '30 Oct', note: 'Yudansha points 2.5 / 2.0', sched: null },
  { n: 'Wei Jie Chua', from: '2nd Kyu', to: '1st Kyu', dojo: 'hq', sub: '28 Oct', note: 'Weapons requirement met', sched: null }
],
    proposals: [
  { n: 'Hannah Teo', from: '5th Kyu', to: '4th Kyu', by: 'Steven Goh Sensei', result: 'Pass', well: 'Clean ukemi, good posture in ikkyo.', next: 'Keep your centre lower in iriminage.', fb: 'Clean ukemi, good posture in ikkyo.' },
  { n: 'Siti Rahman', from: '2nd Kyu', to: '1st Kyu', by: 'Robin Tan Sensei', result: 'Pass', well: 'Excellent jo kata.', next: 'Start preparing for the yudansha track.', fb: 'Excellent jo kata. Ready for yudansha track.' }
],
    candidates: [
  { n: 'Jamie Tan', from: '3rd Kyu', to: '2nd Kyu', done: false },
  { n: 'Priya Lee', from: '1st Kyu', to: '1st Dan', done: false },
  { n: 'Wei Jie Chua', from: '2nd Kyu', to: '1st Kyu', done: false }
],
    pays: [
  { item: '25-lesson pack', date: '15 Sep 2026', method: 'Visa •••• 4242', amt: 600, st: 'Paid', inv: 'INV-2041870' },
  { item: 'Annual dues 2026', date: '2 Jan 2026', method: 'Visa •••• 4242', amt: 48, st: 'Paid', inv: 'INV-2042181' },
  { item: '10-lesson pack', date: '20 Nov 2025', method: 'PayNow', amt: 270, st: 'Paid', inv: 'INV-2042492' }
],
    grade: {
  target: '3rd Kyu', targetLabel: '3rd Kyu (Brown)',
  date: new Date(2026, 11, 13), close: new Date(2026, 10, 29),
  memberMonths: 17, monthsInRank: 7, needMonths: 6,
  sessions: 29, needSessions: 36, feesPaid: true,
  submitted: null
},
    /* anonymous class ratings (no student name is ever stored). Seeded so the instructor profile has something to show. */
    feedback: [
  { ins: 'Bob Tan Sensei', type: 'Adults', date: lastDow(2), rating: 5, tags: ['Clear explanations', 'Felt safe'], note: 'Sensei broke ikkyo down step by step. I finally understand the entry.' },
  { ins: 'Bob Tan Sensei', type: 'Intermediate', date: lastDow(0), rating: 5, tags: ['Learned something new'], note: 'Loved the new variation. Challenging but fair.' },
  { ins: 'Bob Tan Sensei', type: 'Adults', date: lastDow(4), rating: 4, tags: ['Good pace', 'Fun partner work'], note: '' },
  { ins: 'Bob Tan Sensei', type: 'Mixed', date: lastDow(5, 1), rating: 5, tags: ['Felt safe', 'Clear explanations'], note: 'Felt welcome as a newer student. Thank you for the extra tips on ukemi.' },
  { ins: 'Bob Tan Sensei', type: 'Advanced', date: lastDow(3, 2), rating: 4, tags: ['Learned something new'], note: 'Great technique focus. Would like a little more time on weapons.' },
  { ins: 'Bob Tan Sensei', type: 'Adults', date: lastDow(4, 1), rating: 3, tags: ['Good pace'], note: 'Class ran a few minutes over and the warm-up felt rushed.' },
  { ins: 'Bob Tan Sensei', type: 'Intermediate', date: lastDow(0, 2), rating: 5, tags: ['Clear explanations', 'Learned something new'], note: 'Very clear demonstrations. Easy to follow even from the back row.' },
  { ins: 'Bob Tan Sensei', type: 'Adults', date: lastDow(4, 2), rating: 4, tags: ['Fun partner work'], note: '' },
  { ins: 'Bob Tan Sensei', type: 'Mixed', date: lastDow(5, 4), rating: 5, tags: ['Felt safe', 'Good pace'], note: 'Calm, patient and encouraging.' },
  { ins: 'Bob Tan Sensei', type: 'Adults', date: lastDow(4, 3), rating: 2, tags: [], note: 'The mat was crowded, so partner work was hard to do safely.' },
  { ins: 'Bob Tan Sensei', type: 'Advanced', date: lastDow(3, 5), rating: 4, tags: ['Clear explanations'], note: '' },
  { ins: 'Bob Tan Sensei', type: 'Adults', date: lastDow(2, 5), rating: 5, tags: ['Learned something new', 'Felt safe'], note: 'Best class this month.' }
],
    fbSeed: true,
    /* instructor remarks. kind: 'class' (whole class, keyed by date|time), 'student' (one student in one class) or 'grading' (a note for the examiner panel, kept per student) */
    remarks: [
  { kind: 'grading', key: 'seed-g1', student: 'Jamie Tan', text: 'Strong ukemi and calm under pressure. Keep the hips lower in iriminage.', at: daysAgo(4), by: 'Bob Tan Sensei', label: 'Adults · Thu' },
  { kind: 'grading', key: 'seed-g2', student: 'Priya Lee', text: 'Ready for Shodan. Jo kata is excellent, but rushes the opening of ikkyo.', at: daysAgo(6), by: 'Bob Tan Sensei', label: 'Advanced · Tue' },
  /* what the signed-in student can read back: notes for the classes they attended */
  { kind: 'class', key: `${isoDate(lastDow(0))}|19:00`, student: null, text: 'We drilled ikkyo omote and ura. At home, practise stepping off the line before you pivot. Next class: shomen uchi variations.', at: lastDow(0), by: 'Bob Tan Sensei', label: `Adults · ${dayName(lastDow(0))} ${fmtShort(lastDow(0))}` },
  { kind: 'student', key: `${isoDate(lastDow(0))}|19:00`, student: 'Lervyn Wong', text: 'Your ukemi is improving. Keep your chin tucked on back rolls and breathe out as you land.', at: lastDow(0), by: 'Bob Tan Sensei', label: `Adults · ${dayName(lastDow(0))} ${fmtShort(lastDow(0))}` },
  { kind: 'class', key: `${isoDate(lastDow(4))}|19:00`, student: null, text: 'Today was shihonage. The key is to extend through the arm, not lift with the shoulder.', at: lastDow(4), by: 'Bob Tan Sensei', label: `Adults · ${dayName(lastDow(4))} ${fmtShort(lastDow(4))}` },
  { kind: 'grading', key: `${isoDate(lastDow(4))}|19:00`, student: 'Lervyn Wong', text: 'On track for the next grading. Keep up your attendance and work on your suwari-waza.', at: lastDow(4), by: 'Bob Tan Sensei', label: `Adults · ${dayName(lastDow(4))} ${fmtShort(lastDow(4))}` }
],
    /* grading panels. The 13 Dec one is the real date. The test session is today, 20:00-21:00, so the lock on the timetable can be seen: it opens at 19:45.
       Only the examiners listed can open the grading page, and only during the shift. */
    panels: [
  { date: new Date(2026, 11, 13), from: '09:00', to: '12:30', venue: 'HQ Dojo', lead: 'Bob Tan Sensei',
    examiners: ['Bob Tan Sensei', 'Steven Goh Sensei', 'Robin Tan Sensei'], demoOn: false },
  { label: 'Test session', date: (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })(), from: '20:00', to: '21:00', venue: 'HQ Dojo', lead: 'Bob Tan Sensei',
    examiners: ['Bob Tan Sensei'], demoOn: false }
],
    /* the signed-in student's past classes. status: 'present' (+1 session) | 'noshow' (lesson used, not counted) | 'pending' (waiting for the instructor) */
    attendance: [
  { date: lastDow(2), time: '19:00', type: 'Adults', ins: 'Bob Tan Sensei', status: 'present' },
  { date: lastDow(0), time: '19:00', type: 'Adults', ins: 'Bob Tan Sensei', status: 'present' },
  { date: lastDow(5), time: '11:00', type: 'Mixed', ins: 'Bob Tan Sensei', status: 'present' },
  { date: lastDow(4), time: '19:00', type: 'Adults', ins: 'Bob Tan Sensei', status: 'present' },
  { date: lastDow(3, 1), time: '19:00', type: 'Adults', ins: 'Steven Goh Sensei', status: 'noshow' },
  { date: lastDow(2, 1), time: '19:00', type: 'Adults', ins: 'Bob Tan Sensei', status: 'present' }
],
    /* sessions counted (marked present) that the student hasn't seen on the gamified home yet */
    levelUps: [{ kind: 'session', date: lastDow(2), type: 'Adults' }],
    /* instructor feedback from each grading the student has taken (newest first) */
    gradingFeedback: [
  { from: '5th Kyu', to: '4th Kyu', date: new Date(2026, 2, 15), by: 'Steven Goh Sensei', result: 'Pass',
    well: 'Confident ukemi and a calm, upright posture. Your shomenuchi ikkyo has good timing.',
    next: 'Keep your hips lower in iriminage and finish each throw before you turn away. Practise suwari-waza knee walking.' },
  { from: '6th Kyu', to: '5th Kyu', date: new Date(2025, 11, 14), by: 'Bob Tan Sensei', result: 'Pass',
    well: 'Good attendance and steady basics. Your rolls are safe on both sides.',
    next: 'Relax your shoulders when you grab, and keep eye contact with your partner.' }
],
    classEnded: {},   // instructor "End class": { 'YYYY-MM-DD|HH:MM': { at, present: [names], noshow: [names] } }
    /* package extension requests (MC / compassion). status: 'pending' | 'approved' | 'rejected' */
    mcRequests: [],
    bookings: [], rateQueue: [], rated: [], prompted: [], seeded: false,
    checkIns: [],   // student check-ins (mock location-QR scans): { dojo, at, key, type, time, ins, date }

    /* ---------- admin portal (office staff) sample data. Prototype only: the real system reads this from the server. ---------- */
    /* staff accounts. type: 'business' (Business Admin) | 'frontdesk' (Admin) | 'instructor'. Sign-in and the Staff page read this one list. */
    staff: [
  { id: 'ADM-001', name: 'Grace Lim', type: 'business', status: 'active', last: daysAgo(0) },
  { id: 'ADM-101', name: 'Daniel Ong', type: 'frontdesk', status: 'active', last: daysAgo(0) },
  { id: 'ADM-102', name: 'Farah Yusof', type: 'frontdesk', status: 'inactive', last: daysAgo(48) },
  { id: 'INS-0042', name: 'Bob Tan Sensei', type: 'instructor', status: 'active', last: daysAgo(1) },
  { id: 'INS-0031', name: 'Steven Goh Sensei', type: 'instructor', status: 'active', last: daysAgo(3) },
  { id: 'INS-0057', name: 'Robin Tan Sensei', type: 'instructor', status: 'active', last: daysAgo(5) },
  { id: 'INS-0063', name: 'Annie Goh Sensei', type: 'instructor', status: 'active', last: daysAgo(2) }
],
    /* money in. method is always Stripe. st: 'Paid' | 'Processing' | 'Failed' | 'Outstanding'. by: 'desk' | 'online' | 'auto'. */
    ledger: (() => {
      const y = TODAY.getFullYear(), mo = TODAY.getMonth(), day = TODAY.getDate();
      const tm = d => new Date(y, mo, Math.max(1, Math.min(d, day))), ear = (m, d) => new Date(y, mo - m, d);
      const L = (n, no, name, item, amt, date, st, by) => ({ id: 'L-' + (1000 + n), no, name, item, amt, method: 'Stripe', date, st, by, inv: 'INV-' + (2050000 + n * 37) });
      return [
        L(1, 'ASK-2025-1834', 'Lervyn Wong', '25-lesson pack', 600, tm(1), 'Paid', 'online'),
        L(2, 'ASK-2024-0921', 'Jamie Tan', 'Unlimited · 2 weeks', 96, tm(2), 'Paid', 'auto'),
        L(3, 'ASK-2022-0090', 'Wei Jie Chua', '50-lesson pack', 980, tm(3), 'Paid', 'desk'),
        L(4, 'ASK-2023-0456', 'Kenji Sato', '10-lesson pack', 270, tm(4), 'Paid', 'online'),
        L(5, 'ASK-2022-0788', 'Siti Rahman', 'Annual dues', 48, tm(5), 'Paid', 'desk'),
        L(6, 'ASK-2025-0612', 'Hannah Teo', 'Grading fee', 50, ear(2, 12), 'Paid', 'desk'),
        L(7, 'ASK-2024-0921', 'Jamie Tan', 'Unlimited · 2 weeks', 96, tm(15), 'Processing', 'auto'),
        L(8, 'ASK-2024-1440', 'David Koh', 'Annual dues', 48, tm(9), 'Outstanding', 'desk'),
        L(9, 'ASK-2023-1203', 'Grace Yeo', 'Annual dues', 48, tm(9), 'Outstanding', 'desk'),
        L(10, 'ASK-2026-0102', 'Marcus Lim', '10-lesson pack', 270, tm(11), 'Failed', 'auto'),
        L(11, 'ASK-2021-0310', 'Priya Lee', 'Grading fee', 120, tm(12), 'Paid', 'desk'),
        L(12, 'ASK-2025-1834', 'Lervyn Wong', 'Dogi', 85, ear(1, 20), 'Paid', 'desk'),
        L(13, 'ASK-2024-0921', 'Jamie Tan', 'Unlimited · 2 weeks', 96, ear(1, 12), 'Paid', 'auto'),
        L(14, 'ASK-2022-0090', 'Wei Jie Chua', 'Annual dues', 48, ear(1, 6), 'Paid', 'desk'),
        L(15, 'ASK-2026-0102', 'Marcus Lim', 'Registration', 60, ear(2, 14), 'Paid', 'desk'),
        L(16, 'ASK-2023-0456', 'Kenji Sato', '25-lesson pack', 600, ear(2, 3), 'Paid', 'online'),
        L(17, 'ASK-2021-0310', 'Priya Lee', 'Annual dues', 48, ear(3, 8), 'Paid', 'desk'),
        L(18, 'ASK-2022-0788', 'Siti Rahman', '10-lesson pack', 270, new Date(TODAY), 'Paid', 'desk')
      ];
    })(),
    /* money back. st: 'pending' | 'approved' | 'declined'. Policy is no refunds; a Business Admin can approve an exception. */
    refunds: [
  { id: 'R-01', no: 'ASK-2023-0456', name: 'Kenji Sato', item: '10-lesson pack', amt: 270, reason: 'Charged twice by Stripe', by: 'Daniel Ong', at: daysAgo(1), status: 'pending' },
  { id: 'R-02', no: 'ASK-2026-0102', name: 'Marcus Lim', item: 'Registration', amt: 60, reason: 'Moving overseas before the first class', by: 'Daniel Ong', at: daysAgo(6), status: 'declined' }
],
    /* items the front desk cannot decide. kind: 'registration' | 'extension' | 'access' | 'mistake' | 'refund'. status: 'pending' | 'approved' | 'declined' */
    exceptions: [
  { id: 'X-01', kind: 'registration', who: 'Liu Wei', text: 'Wants to carry over 1st Kyu from Aikikai Beijing. Needs record check.', by: 'Daniel Ong', at: daysAgo(1), status: 'pending' },
  { id: 'X-02', kind: 'extension', who: 'Ahmad Karim', text: 'MC covers 21 days, over the 14 day limit.', by: 'Daniel Ong', at: daysAgo(2), status: 'pending' },
  { id: 'X-03', kind: 'mistake', who: 'Jamie Tan', text: 'Payment taken twice at the desk on the same day.', by: 'Daniel Ong', at: daysAgo(3), status: 'pending' },
  { id: 'X-04', kind: 'access', who: 'Rachel Ong', text: 'Asked to join Advanced class at 2nd Kyu.', by: 'Daniel Ong', at: daysAgo(8), status: 'declined' }
],
    /* guests hold a trial, day or week pass. Only guests can walk in. */
    guests: [
  { id: 'G-01', name: 'Nur Aisyah', mobile: '9123 4410', email: 'aisyah@email.com', pass: 'trial', used: false, until: null },
  { id: 'G-02', name: 'Tom Becker', mobile: '8123 7782', email: 'tom.becker@email.com', pass: 'day', used: false, until: daysAgo(-0) },
  { id: 'G-03', name: 'Chen Hui', mobile: '9011 5530', email: 'chen.hui@email.com', pass: 'week', used: false, until: daysAgo(-5) },
  { id: 'G-04', name: 'Ravi Menon', mobile: '9876 2201', email: 'ravi.menon@email.com', pass: 'trial', used: true, until: null }
],
    /* dogi, handbook and belt requests. status: 'Requested' | 'Ready at HQ' | 'Handed over' */
    equipment: [
  { id: 'E-01', no: 'ASK-2026-0102', name: 'Marcus Lim', item: 'Dogi, handbook, belt', size: '3', paid: true, status: 'Ready at HQ', at: daysAgo(4), by: '' },
  { id: 'E-02', no: 'ASK-2025-0612', name: 'Hannah Teo', item: 'Dogi', size: '1', paid: true, status: 'Requested', at: daysAgo(2), by: '' },
  { id: 'E-03', no: 'ASK-2024-1440', name: 'David Koh', item: 'Belt', size: '', paid: false, status: 'Requested', at: daysAgo(1), by: '' },
  { id: 'E-04', no: 'ASK-2025-1834', name: 'Lervyn Wong', item: 'Dogi', size: '4', paid: true, status: 'Handed over', at: daysAgo(30), by: 'Lervyn Wong' }
],
    /* contact list for the office. attempts: [{ at, method, outcome, note }] */
    followups: [
  { id: 'F-01', no: 'ASK-2026-0102', name: 'Marcus Lim', kind: 'declining', owner: 'ADM-101', due: daysAgo(-1), attempts: [] },
  { id: 'F-02', no: 'ASK-2023-1203', name: 'Grace Yeo', kind: 'declining', owner: 'ADM-101', due: daysAgo(0), attempts: [{ at: daysAgo(9), method: 'WhatsApp', outcome: 'No answer', note: '' }] },
  { id: 'F-03', no: 'ASK-2024-1440', name: 'David Koh', kind: 'renewal', owner: 'ADM-102', due: daysAgo(-3), attempts: [] }
],
    closures: [
  { id: 'C-01', scope: 'HQ', from: addDays(TODAY, 20), to: addDays(TODAY, 20), note: 'Public holiday' },
  { id: 'C-02', scope: 'HQ', from: new Date(2026, 11, 13), to: new Date(2026, 11, 13), note: 'Grading day: Sunday classes paused' },
  { id: 'C-03', scope: 'class', code: SES.find(s => s.dojo === HQ && s.day === 1 && s.time === '19:00' && s.type === 'Adults').code, from: lastDow(1), to: lastDow(1), label: 'Adults 7 PM', note: 'Class cancelled by the dojo', students: 5, lessons: 5 }
],
    rosters: {},        // per class and date: { 'YYYY-MM-DD|HH:MM': { rows, submitted, ... } }
    memberInfo: {},     // per member no.: contact, medical, documents, notes
    /* spreadsheet imports that did not load cleanly. status: 'open' | 'fixed' | 'dismissed' */
    imports: [
  { id: 'I-01', file: 'tampines-roll-sep.csv', row: 14, issue: 'Missing information', name: 'Wong S. L.', detail: 'No date of birth or phone number', status: 'open' },
  { id: 'I-02', file: 'tampines-roll-sep.csv', row: 31, issue: 'Unmatched name', name: 'Kenji S.', detail: 'Could be Kenji Sato (ASK-2023-0456)', status: 'open' },
  { id: 'I-03', file: 'bedok-roll-oct.csv', row: 6, issue: 'Pipeline error', name: '', detail: 'Row could not be read: unexpected date format', status: 'open' }
],
    /* office rules. Prices come from here, not from the code that takes payment. */
    policies: {
      registration: 60, annualDues: 48,
      packages: [...PKG.adult, ...PKG.kids].map(p => ({ id: p.id, name: p.name, amt: p.amt })),
      discounts: { senior: { age: 65, pct: 40 }, student: { from: 17, to: 25, pct: 50 } },
      booking: { aheadMonths: 1, minDays: 1, cancelHours: 4, maxPackages: 2 },
      autoActivation: [
        { id: 'details', text: 'Personal details complete', on: true }, { id: 'consent', text: 'Consent signed', on: true },
        { id: 'paid', text: 'Registration paid', on: true }, { id: 'medical', text: 'Medical declaration answered', on: true },
        { id: 'guardian', text: 'Guardian consent for children', on: true }
      ],
      methods: ['Stripe'],
      templates: [
        { id: 'T-1', name: 'Class cancelled', text: 'Today\'s class is cancelled. Your lesson has been returned.' },
        { id: 'T-2', name: 'Payment reminder', text: 'Your annual dues are unpaid. Please pay at the HQ desk or online.' },
        { id: 'T-3', name: 'Dojo closed', text: 'The dojo is closed on the date shown. Classes resume the next day.' }
      ],
      followTriggers: { declineDays: 14, renewalDays: 30 }
    },
    sentLog: [
  { at: lastDow(1), by: 'Daniel Ong', aud: 'Adults · Tue 7 PM', title: 'Class cancelled' }
],
    interventions: [
  { id: 'N-01', name: 'Extra beginner slot on Saturday', slot: 'Sat 10 AM', start: daysAgo(40), before: 6, after: 11, decision: 'continue' }
],
    /* monthly joiners and how many were still training 90 days later (sample figures) */
    cohorts: [
  { label: 'Apr', joined: 18, kept: 12 }, { label: 'May', joined: 22, kept: 15 }, { label: 'Jun', joined: 16, kept: 11 },
  { label: 'Jul', joined: 20, kept: 13 }, { label: 'Aug', joined: 25, kept: 0 }, { label: 'Sep', joined: 19, kept: 0 }
]
  };
}