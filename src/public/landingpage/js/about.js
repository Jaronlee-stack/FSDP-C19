'use strict';
/* AIKIDO SHINJU-KAI — about.js */

/* ---------- 15. ABOUT ---------- */
const HISTORY = [
  [2024, 'Our own permanent HQ', 'After 36 years, Shinju-Kai opened its permanent Headquarters and Shinju Hub at Thomson V One on 18 May 2024.', true],
  [2022, 'Back to normal', 'After three years of COVID-19 restrictions, membership began to rebuild, slowly and steadily.'],
  [2019, 'Bracing for COVID-19', 'Strict safe-distancing rules hit dojos hard and many students paused training.'],
  [2018, '30th anniversary', 'Hombu Dojo-Cho Mitsuteru Ueshiba was Guest-of-Honour, with over 800 participants from 26 countries. A 200 m² dojo opened at Heartbeat@Bedok.', true],
  [2017, 'A base in China', 'A China headquarters opened in Shanghai to unify affiliated dojos there.'],
  [2016, 'Chingay Parade', 'Chosen to represent Aikido at the National Chingay Parade, watched by 180,000 spectators. The first Keiko Hajime, the year\'s opening class, became an annual tradition.'],
  [2015, 'SG50 seminar', 'The five founding fathers of Aikido in Singapore came together for the SG50 and 3rd All Shinju-Kai Demonstration and Seminar.'],
  [2014, 'An 800-year-old katana', 'Gifted a heritage katana by Masaki Tani of the Aikido World Headquarters\' International Affairs Department.'],
  [2013, '25 years, 78 dojos', '48 dojos in Singapore and 30 in China, Indonesia and Malaysia. Awarded Promising SME 500 and Industry Star.'],
  [2011, 'Giving back', 'Raised S$32,270 in one day for victims of the Tohoku earthquake and tsunami. Launched AikiForest for pre-schoolers from age 3.'],
  [2010, 'International Friendship Seminar', 'The first IFS, with Japan, the United Kingdom, Canada, Belgium and Singapore.'],
  [2008, '20th anniversary', 'Celebrated with Hiroshi Tada Shihan (9th Dan) and over 800 participants from 17 countries.'],
  [2006, 'Schools programme', 'Became the sole provider of Aikido in schools through the MOE Sports Education Programme.'],
  [2005, 'Going overseas', 'Dojos in Malaysia, China and Indonesia, plus 31 new local dojos.'],
  [2003, 'First permanent HQ', 'The first Aikido organisation in Singapore with a permanent HQ, at HomeTeamNS Balestier.', true],
  [2001, 'Hombu recognition', 'Officially recognised by the Aikido World Headquarters, Japan. First to bring Aikido to the Singapore Armed Forces.', true],
  [1999, 'Expansion', 'Eight new dojos in community clubs, and Aikido training for the Gurkha Contingent of the Singapore Police Force.'],
  [1995, 'Building foundations', 'Eight years of building discipline and culture before a second dojo opened at Cheng San CC.'],
  [1988, 'The beginning', 'Founded by Philip Lee Shihan at SAFRA Tampines. Pioneer instructors: John Lim, Kelly Tan, Alice Tan and Allan Lai.', true]
];
const MILESTONES = [
  [2024, 70, '<b>Opened the permanent Shinju-Kai HQ</b> with two training halls, a member lounge and a café.'],
  [2018, 64, 'Invited Dojo-Cho Mitsuteru Ueshiba to open the new training centre at Heartbeat@Bedok.'],
  [2017, 63, '<b>Awarded 7th Dan</b> by the third Doshu, Moriteru Ueshiba, at Kagami Biraki.'],
  [2014, 60, '<b>Conferred the title of Shihan</b> by the Aikido World Headquarters.'],
  [2010, 56, 'Started the International Friendship Seminar with Japan, the UK, Canada and Belgium.'],
  [2005, 51, 'Awarded 6th Dan. Opened the first dojos in Johor Bahru and Batam.'],
  [2003, 49, 'Left his construction business to teach Aikido full time. Opened the first permanent HQ.'],
  [2002, 48, 'Opened his first dojo in China, in Shanghai.'],
  [2001, 47, 'First to teach Aikido to the Singapore Armed Forces.'],
  [1999, 45, 'Awarded 5th Dan. First to teach Aikido to the Gurkha Contingent.'],
  [1988, 34, '<b>Founded Aikido Shinju-Kai</b> with his first dojo at SAFRA Tampines.'],
  [1981, 27, 'One of the first two Singaporeans to train as a live-in student (uchideshi) at Hombu Dojo, Japan.'],
  [1971, 17, 'Began Aikido with Sensei Harry Ng at the YMCA, Stevens Road.']
];
const DAN_GROUPS = [
  ['6th Dan', ['Chew Eng Lam Sensei', 'James Moy Sensei', 'Allan Lai Sensei', 'Bob Tan Sensei', 'Quah Yong Lok Sensei', 'Annie Goh Sensei', 'Tan Kok Hiang Sensei']],
  ['5th Dan', ['Ronald Tan Sensei', 'Lim Cheen Cheen Sensei', 'Aloyseus Lee Sensei', 'Alexander Lee Sensei', 'Tham Wai Yip Sensei', 'Steven Goh Sensei', 'James Tan Sensei', 'Tey Guan Kiat Sensei', 'Billy Lim Sensei', 'Pang Kim Lock Sensei', 'Robin Tan Sensei']],
  ['4th Dan', ['Chuan Huey Ferg Sensei', 'Lynn Tan Sensei', 'Chan Wai Soen Sensei', 'Alan Lim Sensei', 'Mark Lim Sensei', 'Sean Tan Sensei', 'Alvin Teo Sensei', 'Elaine Ong Sensei', 'Robert Choo Sensei', 'Lai Mun Kit Sensei', 'Alex Tan Sensei', 'Alister Fong Sensei', 'Clement Ang Sensei']],
  ['3rd Dan', ['Gavin Poh', 'Cheong Mun Hong', 'Ng Ngee Boon', 'Louwena Lau', 'Patrick Lim', 'Junex Calderon', 'Lisa Teo', 'Shibata Yukiyasu', 'Nicholas Lee', 'Dennis Tan', 'Charles Leong']],
  ['Assistant instructors · 2nd Dan', ['Gregorio Jury', 'Winnie Lim', 'Crix Lee', 'Yoong Yong Jian', 'Eric Ng', 'Toh Boon Yi']]
];
const OVERSEAS = {
  China: [['余立人老师', '上海合气会馆', '5th Dan'], ['卢剑文老师', '鸿胜合气道', '5th Dan'], ['林骏老师', '心勝道场', '5th Dan'], ['Fox Mok 老师', '心柔会上海道场', '4th Dan'], ['钟滢老师', '心柔会上海道场', '4th Dan'], ['王翊迪老师', '心柔会上海道场', '4th Dan']],
  Indonesia: [['Hendy Louis', 'Shinkenryukai', '3rd Dan'], ['Elvis Mardi', 'Seiki Kai Indonesia', '2nd Dan'], ['Handy Gunawan', 'Shinkenryukai', '2nd Dan'], ['Ronald Wibawa', 'Seiki Kai Indonesia', '1st Dan'], ['Bary Fardan Siregar', 'Seiki Kai Indonesia', '1st Dan']],
  Malaysia: [['Bryan Loi Sensei', 'Hibana Bushidoo', '5th Dan'], ['Chris Khor', 'Hibana Bushidoo', '3rd Dan'], ['Ng Kim San Francis', 'Hibana Bushidoo', '2nd Dan'], ['Ku Keng Leong', 'Hibana Bushidoo', '2nd Dan'], ['Khoo Kiat Siong', 'Hibana Bushidoo', '1st Dan'], ['Ng Yu Xuan Denise', 'Hibana Bushidoo', '1st Dan']]
};
const LIFE_FOUNDING = ['Philip Lee & Family', 'Allan Lai', 'Ronald Tan', 'Charlie Lim', 'Bob Tan', 'Denny Oetomo', 'Jennifer Goh', 'Annie Goh', 'Chew Eng Lam', 'Ahmad Bin Ibrahim', 'Kuah Chui Heong', 'Bernie Ho', 'Vaughan Michael Prentice', 'Lynn Tan', 'Shawn Wang', 'Lim Cheen Cheen', 'Alice Tan', 'James Moy', 'Stanley Ang', 'Quah Yong Lok', 'Trevor Ellis & Family', 'Tey Guan Kiat', 'Sam Yeo'];
const LIFE_YEARS = [[2005, 'Pang Kim Lock'], [2006, 'Chua Yu Zhan & Brothers, Ted Ngo'], [2007, 'Joanne Leong, Tan Kok Hiang'], [2008, 'Erik Heng & Family'], [2010, 'Magali Nicolas & Family, Teo Kok Meng & Family'], [2011, 'N. Y. Lee, Foo Choon Mei, James Tan & Family'], [2012, 'Ross Lee & Brothers'], [2016, 'Edmund Loh Kim Man, Marvin Tay Choon How, Chong Quey Lim & Family'], [2019, 'Kevin Kwok'], [2020, 'Nathaniel Abramowich, Denise Wong, Maëlys Desmartes'], [2024, 'Gregorio Jury, Billy Lim, Elaine Ong, Catherine Kang, Roman Tan & Family, Dan Mosley, Endean Tan']];

function initAbout() {
  const tl = (h, hidden) => `<div class="tl${h[3] ? ' key' : ''}"${hidden ? ' hidden data-old' : ''}><span class="y">${h[0]}</span><span class="dotc"></span><div><b>${esc(h[1])}</b><p>${esc(h[2])}</p></div></div>`;
  $('#timeline').innerHTML = HISTORY.map((h, i) => tl(h, i >= 9)).join('');
  $('#tlMore').addEventListener('click', e => {
    const show = $$('#timeline [data-old]').some(x => x.hidden);
    $$('#timeline [data-old]').forEach(x => x.hidden = !show);
    e.currentTarget.innerHTML = show ? `${icon('chev')}Show fewer years` : `${icon('chev')}Show earlier years`;
    $('.ic', e.currentTarget).style.transform = show ? 'rotate(180deg)' : '';
  });
  $('#miles').innerHTML = MILESTONES.map(m => `<div class="mile"><span class="y">${m[0]}</span><span class="a">Age ${m[1]}</span><p>${m[2]}</p></div>`).join('');

  const B = 'https://aikidoshinjukai.com.sg/images/instructors/';
  const slug = n => n.replace(/ Sensei$/, '').toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '-');
  $('#insGroups').innerHTML = DAN_GROUPS.map(([g, names]) => `<div class="dan-group ac"><h3>${g} · ${names.length}</h3><div class="ins-grid">${names.map(n =>
    `<article class="ins"><div class="ph"><img src="${B + slug(n)}.jpg" alt="${esc(n)}" loading="lazy" onerror="this.remove()"><span class="ini" aria-hidden="true">${initials(n)}</span></div><div class="meta"><span class="nm">${esc(n)}</span><span class="dan">${g.includes('2nd') ? '2nd Dan' : g}</span></div></article>`).join('')}</div></div>`).join('');

  $('#countries').innerHTML = Object.entries(OVERSEAS).map(([c, list]) => `<article class="country"><h3>${c} <small>${list.length} instructors</small></h3><div class="rows">${list.map(p => `<div class="row"><span class="av">${esc(p[0].replace(/老师|Sensei/g, '').trim().slice(0, 2).toUpperCase())}</span><div class="grow"><div class="t">${esc(p[0])}</div><div class="d">${esc(p[1])}</div></div><span class="pill plain">${p[2]}</span></div>`).join('')}</div></article>`).join('');

  $('#lifeFounding').innerHTML = LIFE_FOUNDING.map(n => `<span>${esc(n)}</span>`).join('');
  $('#lifeYears').innerHTML = LIFE_YEARS.map(([y, n]) => `<div class="yr"><b>${y}</b><span>${esc(n)}</span></div>`).join('');

  const nav = $('#abNav');
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return;
    const id = en.target.id.slice(3);
    $$('a', nav).forEach(a => a.classList.toggle('on', a.dataset.sec === id));
    const on = $('a.on', nav);
    if (on) nav.scrollTo({ left: on.offsetLeft - nav.clientWidth / 2 + on.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
  }), { rootMargin: '-40% 0px -55% 0px' });
  $$('#v-about .ab-sec').forEach(s => io.observe(s));
}

initAbout();
