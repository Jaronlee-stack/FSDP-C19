/* =====================================================================
   AIKIDO SHINJU-KAI — data.js  (fixed reference data)
   The server owns every record. api.js fills DOJOS, PKG, CLASSES, OTHER_DOJO_CLASSES, INSTRUCTORS, BELTS and GRADING_FEE in place
   from GET /reference; the values below are only the labels and fall-backs the page code needs before that arrives.
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

const BELTS = [
  { g: '6th Kyu', c: '#FFFFFF' }, { g: '5th Kyu', c: '#E9C84A' }, { g: '4th Kyu', c: '#8B5A2B' },
  { g: '3rd Kyu', c: '#A0702F' }, { g: '2nd Kyu', c: '#6E4520' }, { g: '1st Kyu', c: '#4E3015' }, { g: '1st Dan', c: '#14161B' }
];
const beltOf = g => (BELTS.find(b => b.g === g) || { c: '#ccc' }).c;
/* lower number = higher rank. Dan grades are 0 or below. */
const kyuOf = g => { const k = /^(\d+)\w* Kyu/.exec(g); if (k) return +k[1]; const d = /^(\d+)\w* Dan/.exec(g); return d ? 1 - +d[1] : 99; };

/* the signed-in student. api.js (ASK.applyMe) fills it from the server. */
const ME = { name: '', no: '', grade: '', dojo: 'hq', gender: '', age: 0, group: 'adult' };

/* who may book which class (SSP-04). Only a hint for the page: the server decides on every booking. */
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

const GRADING_FEE = { '6th Kyu': 40, '5th Kyu': 40, '4th Kyu': 50, '3rd Kyu': 50, '2nd Kyu': 60, '1st Kyu': 60, '1st Dan': 120 };
const LATE_FEE = 20;


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
