'use strict';
/* AIKIDO SHINJU-KAI — class.js  (one template, class chosen by #adult, #children, ...) */

/* ---------- CLASS PAGES (content from aikidoshinjukai.com.sg/classes/…) ---------- */
const CI = 'https://aikidoshinjukai.com.sg/images/classes/';
const CLASS_PAGES = [
  { id: 'adult', name: 'Adult Class', k: '大', img: 'adult/1.jpg',
    intro: 'The core class at every Shinju-Kai dojo. Smooth, circular movements that redirect an attacker\'s force instead of meeting it head-on.',
    who: 'Adults aged 12 and above, all grades',
    about: ['Aikido is built for self-defence against someone larger or stronger. Instead of using strength, you learn to blend with an attack and lead it away.', 'The class is open to men and women of every grade above the age of 12, from first-day white belts to black belts.'],
    facts: [['users', 'Who', 'Ages 12 & above', 'Men and women'], ['award', 'Grades', 'All grades', 'White belt to Dan'], ['clock', 'Length', '60 minutes', 'Daily across dojos'], ['card', 'Fees', 'Lesson packages', 'From S$270 for 10 lessons']],
    gain: [['体', 'Fitness', 'Whole-body conditioning, flexibility and stamina.'], ['信', 'Self-confidence', 'Calm, assured movement on and off the mat.'], ['礼', 'Discipline & respect', 'Dojo etiquette and care for your training partners.'], ['和', 'Stress & friendship', 'A release after work and a community to train with.']] },
  { id: 'children', name: 'Children Class', k: '子', img: 'children/1.jpg',
    intro: 'Aikido for young students, grounded in harmony and mutual respect. Children learn to fall safely and protect themselves without relying on strength.',
    who: 'Children aged 5 to 12, all grades',
    about: ['Kids learn self-defence for everyday falls and slips as well as attacks, using soft, circular movements instead of force.', 'The class builds the foundations children need to move up to the Adult class when they are ready.'],
    facts: [['users', 'Who', 'Ages 5 – 12', 'Boys and girls'], ['award', 'Grades', 'All grades', 'Children\'s kyu syllabus'], ['clock', 'Length', '60 minutes', 'Weekday & weekend slots'], ['card', 'Fees', 'Children packages', '1-month from S$150']],
    gain: [['体', 'Fitness', 'Core strength, flexibility and stamina.'], ['集', 'Focus & reflexes', 'Attention and quick reactions through partner drills.'], ['動', 'Motor skills', 'Balance, coordination and safe falling (ukemi).'], ['礼', 'Confidence & respect', 'Discipline, etiquette and self-belief.']] },
  { id: 'mixed', name: 'Mixed Class (Adults & Children)', k: '和', img: 'mixed/1.jpg',
    intro: 'Parents, children and friends on the same mat. Instructors adapt each technique to every student\'s age and ability.',
    who: 'All ages and fitness levels, training together',
    about: ['A family-friendly class where students of different ages learn from each other.', 'Training side by side strengthens family bonds and makes it easier to keep a regular routine together.'],
    facts: [['users', 'Who', 'All ages', 'Adults & children together'], ['award', 'Grades', 'All grades', 'Techniques adapted per student'], ['clock', 'Length', '60 minutes', 'See class schedules'], ['card', 'Fees', 'Standard packages', 'Adult or children rates']],
    gain: [['家', 'Family time', 'Shared training that strengthens family bonds.'], ['学', 'Learn together', 'Different ages learning from each other.'], ['体', 'Fitness for all', 'Suitable for every fitness level.'], ['和', 'Harmony', 'Respect and cooperation between partners.']] },
  { id: 'ladies', name: 'Ladies Class', k: '女', img: 'ladies/1.jpg',
    intro: 'A women-only class. Aikido\'s soft, circular technique suits defending against a larger, stronger opponent.',
    who: 'Women looking for confidence and a new way to work out',
    about: ['Aikido does not rely on size or strength, which makes it well suited to women.', 'Alongside self-defence, the class trains mental focus, discipline and respect in a supportive setting.'],
    facts: [['users', 'Who', 'Women only', 'Ages 12 & above'], ['award', 'Grades', 'All grades', 'Beginners welcome'], ['clock', 'Length', '60 minutes', 'See class schedules'], ['card', 'Fees', 'Lesson packages', 'Same as adult rates']],
    gain: [['護', 'Self-defence', 'Techniques that work against a bigger attacker.'], ['信', 'Confidence', 'Assurance that carries into daily life.'], ['体', 'A new workout', 'Full-body exercise without heavy impact.'], ['心', 'Focus', 'Mental discipline and calm under pressure.']] },
  { id: 'senior', name: 'Senior SG50 Class', k: '寿', img: 'seniors/1.jpg',
    intro: 'Gentle Aikido for those aged 50 and above, including Class 3A elderly. Timing and body mechanics replace strength.',
    who: 'Adults aged 50 and above',
    about: ['Soft, smooth movements keep physical strain low while keeping you healthy and active.', 'Shinju-Kai is the only provider of Aikido classes for Class 3A elderly in Singapore.'],
    facts: [['users', 'Who', 'Ages 50 & above', 'Incl. Class 3A elderly'], ['award', 'Grades', 'All grades', 'No experience needed'], ['clock', 'Length', '60 minutes', 'See class schedules'], ['shield', 'Intensity', 'Low strain', 'All fitness levels']],
    gain: [['健', 'Stay active', 'Keep healthy with regular, gentle movement.'], ['衡', 'Balance', 'Better balance and coordination to prevent falls.'], ['柔', 'Flexibility', 'Soft movements that loosen joints.'], ['護', 'Basic self-defence', 'Practical skills for every fitness level.']] },
  { id: 'weapon', name: 'Weapon Class', k: '剣', img: 'weapons/1.jpg',
    intro: 'Traditional Japanese weapons — jo (staff), bokken (wooden sword) and tanto (knife) — to deepen your empty-hand Aikido.',
    who: 'Students who want to deepen Aikido principles',
    about: ['Weapons work sharpens ma-ai (distancing) and timing, the same principles behind every empty-hand technique.', 'It also connects you to the heritage of Japanese martial arts.'],
    facts: [['shield', 'Weapons', 'Jo · Bokken · Tanto', 'Staff, sword, knife'], ['award', 'Grades', 'Kyu & Dan', 'Weapons appear in grading'], ['clock', 'Length', '60 minutes', 'See class schedules'], ['card', 'Fees', 'Lesson packages', 'Bring your own or borrow']],
    gain: [['間', 'Ma-ai & timing', 'Distance and timing that improve every technique.'], ['動', 'Body movement', 'Posture and spatial awareness.'], ['伝', 'Heritage', 'A link to classical Japanese martial arts.'], ['心', 'Focus', 'Concentration and mental discipline.']] },
  { id: 'advanced', name: 'Advanced Class', k: '上', img: 'adult/2.jpg',
    intro: 'For experienced students ready to go further: complex throws and locks, multiple attackers and weapons work.',
    who: 'Experienced students with a solid foundation',
    about: ['The class goes deeper into advanced technique, teaching methodology and the philosophy of Aikido.', 'It is the main preparation for black belt (Shodan) grading.'],
    facts: [['users', 'Who', 'Experienced students', 'Instructor recommended'], ['award', 'Grades', 'Senior kyu & Dan', 'Black belt preparation'], ['clock', 'Length', '60 minutes', 'See class schedules'], ['card', 'Fees', 'Lesson packages', 'Members only']],
    gain: [['技', 'Advanced technique', 'Complex throws, locks and multiple attackers.'], ['剣', 'Weapons', 'Weapons work at a higher level.'], ['教', 'Teaching skills', 'How to explain and demonstrate technique.'], ['段', 'Dan preparation', 'Ready for black belt grading.']] },
  { id: 'instructional', name: 'Instructional Class', k: '師', img: 'weapons/2.jpg',
    intro: 'For senior students who want to become Shinju-Kai instructors. Learn to teach, run a class and carry an instructor\'s responsibilities.',
    who: 'Senior students aspiring to become instructors',
    about: ['Covers teaching methodology, class management and how to structure lessons and adapt them to different skill levels.', 'Senior instructors mentor you as you prepare for formal instructor certification.'],
    facts: [['users', 'Who', 'Senior students', 'Aspiring instructors'], ['award', 'Outcome', 'Instructor certification', 'Formal Shinju-Kai pathway'], ['user', 'Mentors', 'Senior instructors', 'One-to-one guidance'], ['mail', 'Enquire', 'HQ office', 'hq@aikidoshinjukai.com.sg']],
    gain: [['教', 'Teaching method', 'How to break down and teach technique.'], ['組', 'Class management', 'Structuring and running a safe class.'], ['導', 'Mentorship', 'Guidance from senior instructors.'], ['証', 'Certification', 'Preparation for formal instructor certification.']] },
  { id: 'private', name: 'Private Class', k: '個', img: 'private/1.jpg',
    intro: 'One-to-one instruction at HQ, built around your goals and your schedule. Open to members and non-members.',
    who: 'Beginners, grading candidates, or anyone refining technique',
    about: ['A complete beginner can get a strong start; a grading candidate can focus on exactly what the examiners will look for.', 'Lessons are personalised and scheduled flexibly at the Headquarters Dojo.'],
    facts: [['users', 'Who', 'Members & non-members', 'Any level'], ['pin', 'Where', 'HQ Dojo', 'Thomson V One'], ['clock', 'Schedule', 'Flexible', 'Booked with the office'], ['card', 'Fees', 'S$120 per hour', 'One-to-one']],
    gain: [['個', 'Personalised', 'Lessons built around your needs and goals.'], ['技', 'Specific skills', 'Focused work on the techniques you choose.'], ['段', 'Grading prep', 'Targeted preparation before your grading.'], ['時', 'Flexible timing', 'Train when it suits you.']] },
  { id: 'sep', name: 'Sports Education Programme (SEP)', k: '学', img: 'children/2.jpg',
    intro: 'Aikido in Singapore schools through the MOE Sports Education Programme. Shinju-Kai has been the sole Aikido SEP provider since 2006.',
    who: 'Schools and their students across Singapore',
    about: ['Students learn Aikido fundamentals in a structured, age-appropriate way, led by certified instructors.', 'The programme is recognised by the Singapore Sports Council and MOE.'],
    facts: [['users', 'Who', 'MOE schools', 'Primary & secondary'], ['award', 'Since', '2006', 'Sole Aikido SEP provider'], ['shield', 'Recognised by', 'MOE & SSC', 'Certified instructors'], ['mail', 'Enquire', 'HQ office', 'hq@aikidoshinjukai.com.sg']],
    gain: [['体', 'Fitness & coordination', 'Physical literacy for growing students.'], ['礼', 'Discipline & respect', 'Dojo values in a school setting.'], ['組', 'Teamwork', 'Partner practice builds cooperation.'], ['伝', 'Culture', 'Appreciation of Japanese martial arts.']] },
  { id: 'corporate', name: 'Corporate Programme', k: '社', img: 'mixed/2.jpg',
    intro: 'Team-building through Aikido for companies and organisations. Content, focus and duration are customised to your team.',
    who: 'Companies and organisations',
    about: ['Aikido\'s philosophy of blending with conflict translates directly to the workplace: communication, calm under pressure and leadership.', 'No martial arts experience is needed.'],
    facts: [['users', 'Who', 'Companies & teams', 'Any size'], ['award', 'Experience', 'None needed', 'All fitness levels'], ['clock', 'Duration', 'Customised', 'One-off or series'], ['mail', 'Enquire', 'Corporate enquiry', 'Via Contact Us']],
    gain: [['組', 'Team cohesion', 'Communication and trust between colleagues.'], ['和', 'Conflict resolution', 'Defuse tension instead of escalating it.'], ['静', 'Stress management', 'Stay calm under pressure.'], ['導', 'Leadership', 'Leadership grounded in Aikido philosophy.']] },
  { id: 'academy', name: 'Shinju-Kai Academy', k: '塾', img: 'adult/3.jpg',
    intro: 'An intensive, structured curriculum for dedicated students who want comprehensive Aikido education and faster development.',
    who: 'Serious practitioners seeking accelerated development',
    about: ['Academy students get priority access to classes and seminars and mentorship from senior Shihan-level instructors.', 'Outstanding students have a pathway to instructor certification. Apply through the HQ office.'],
    facts: [['users', 'Who', 'Dedicated students', 'By application'], ['award', 'Mentors', 'Shihan-level', 'Senior instructors'], ['cal', 'Access', 'Priority', 'Classes & seminars'], ['mail', 'Apply', 'HQ office', 'hq@aikidoshinjukai.com.sg']],
    gain: [['速', 'Accelerated growth', 'An intensive, structured curriculum.'], ['導', 'Shihan mentorship', 'Guidance from the most senior instructors.'], ['会', 'Exclusive events', 'International seminars and members-only events.'], ['証', 'Instructor pathway', 'Grading support and a route to certification.']] }
];
const CLASS_CTA = {
  sep: ['Bring Aikido to your school', 'Talk to our HQ office about running SEP at your school.', [['Email HQ', 'mailto:hq@aikidoshinjukai.com.sg', 'mail'], ['Call +65 6513 1588', 'tel:+6565131588', 'phone']]],
  corporate: ['Plan a session for your team', 'Tell us your team size, goals and dates and we\'ll design the programme.', [['Email HQ', 'mailto:hq@aikidoshinjukai.com.sg', 'mail'], ['Call +65 6513 1588', 'tel:+6565131588', 'phone']]],
  academy: ['Apply to the Academy', 'Send your grade, training history and goals to the HQ office.', [['Email HQ', 'mailto:hq@aikidoshinjukai.com.sg', 'mail'], ['Register first', 'join.html', 'plus']]],
  instructional: ['Ask about instructor training', 'Speak to your instructor or the HQ office about joining.', [['Email HQ', 'mailto:hq@aikidoshinjukai.com.sg', 'mail'], ['Register first', 'join.html', 'plus']]],
  private: ['Book a private class', 'S$120 per hour at HQ. Call or email to pick a time.', [['Buy a private class', 'trial.html#private', 'arrow'], ['Call +65 6513 1588', 'tel:+6565131588', 'phone']]]
};
function initClassPages() {
  $('#cpNav').innerHTML = '<a href="classes.html">All classes</a>' + CLASS_PAGES.map(c => `<a href="#${c.id}" data-cls="${c.id}">${esc(({ sep: 'SEP', corporate: 'Corporate', academy: 'Academy' })[c.id] || c.name.replace(' Class', '').replace(' (Adults & Children)', ''))}</a>`).join('');
}
function renderClass(id) {
  const i = CLASS_PAGES.findIndex(c => c.id === id), c = CLASS_PAGES[i];
  document.title = `${c.name} · Aikido Shinju-Kai`;
  $('#cpBg').style.backgroundImage = `url("${CI + c.img}")`;
  $('#cpBg').setAttribute('aria-label', c.name);
  $('#cpEyebrow').textContent = `Classes · ${String(i + 1).padStart(2, '0')} of ${CLASS_PAGES.length}`;
  $('#cpTitle').textContent = c.name;
  $('#cpIntro').textContent = c.intro;
  $('#cpKanji').textContent = c.k;
  $('#cpWho').textContent = c.who;
  $('#cpAbout').innerHTML = c.about.map(p => `<p>${esc(p)}</p>`).join('');
  $('#cpFacts').innerHTML = c.facts.map(([ic, l, b, s]) => `<div class="cp-fact"><span class="l">${icon(ic)}${esc(l)}</span><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
  $('#cpGainH').textContent = `Why train in the ${c.name.replace(/ \(.*\)/, '')}`;
  $('#cpGainLead').textContent = `What students get from ${c.name.replace(/ \(.*\)/, '')} at Shinju-Kai.`;
  $('#cpGain').innerHTML = c.gain.map(([k, h, p]) => `<article class="ben-card"><span class="k">${k}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></article>`).join('');
  const cta = CLASS_CTA[c.id];
  $('.cp-cta').dataset.k = c.k;
  $('#cpCtaH').textContent = cta ? cta[0] : 'Try your first class';
  $('#cpCtaP').textContent = cta ? cta[1] : 'First-time visitors can try one session at HQ for S$29. No uniform needed.';
  const acts = cta ? cta[2] : [['Book a Trial · S$29', 'trial.html#trial', 'plus'], ['Register Online', 'join.html', 'arrow']];
  $('#cpCtaActs').innerHTML = acts.map(([t, h, ic], n) => `<a class="btn ${n ? 'btn-ghost' : 'btn-light'}" href="${h}">${esc(t)}<span class="dot">${icon(ic)}</span></a>`).join('');
  $('.cp-acts').hidden = !!cta && c.id !== 'private';
  const prev = CLASS_PAGES[(i - 1 + CLASS_PAGES.length) % CLASS_PAGES.length], next = CLASS_PAGES[(i + 1) % CLASS_PAGES.length];
  $('#cpPN').innerHTML = `<a href="#${prev.id}"><small>${icon('back')}Previous</small><b>${esc(prev.name)}</b></a><a class="next" href="#${next.id}"><small>Next${icon('arrow')}</small><b>${esc(next.name)}</b></a>`;
  $$('#cpNav a').forEach(a => a.classList.toggle('on', a.dataset.cls === id));
  const on = $('#cpNav a.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
}

/* ---------- ALL CLASSES (classes.html): one card per class, filterable ---------- */
const CLASS_GROUP = { adult: 'Adults', ladies: 'Adults', senior: 'Adults', children: 'Children & family', mixed: 'Children & family',
  weapon: 'Specialist', advanced: 'Specialist', instructional: 'Specialist', private: 'Specialist', sep: 'Programmes', corporate: 'Programmes', academy: 'Programmes' };
function initClassIndex() {
  const groups = ['All', 'Adults', 'Children & family', 'Specialist', 'Programmes'];
  $('#clsFilter').innerHTML = groups.map((g, i) => `<button type="button" class="fpill${i ? '' : ' on'}" data-g="${esc(g)}">${esc(g)}</button>`).join('');
  $('#clsGrid').innerHTML = CLASS_PAGES.map(c => `<a class="cls-card" href="class.html#${c.id}" data-g="${esc(CLASS_GROUP[c.id])}">
    <div class="ph"><img src="${CI + c.img}" alt="" loading="lazy"><span class="k" aria-hidden="true">${c.k}</span></div>
    <div class="bd"><span class="tag">${esc(c.facts[0][2])}</span><h3>${esc(c.name)}</h3><p>${esc(c.intro)}</p><span class="go">View class${icon('arrow')}</span></div></a>`).join('');
  $('#clsFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    $$('#clsFilter .fpill').forEach(x => x.classList.toggle('on', x === b));
    $$('#clsGrid .cls-card').forEach(c => { c.hidden = b.dataset.g !== 'All' && c.dataset.g !== b.dataset.g; });
  });
}

function showClass() {
  const id = location.hash.slice(1);
  if (!CLASS_PAGES.some(c => c.id === id)) { history.replaceState(null, '', '#adult'); return showClass(); }
  renderClass(id);
  window.scrollTo(0, 0);
  animateIn(document.body);
}
if (PAGE === 'class') { initClassPages(); window.addEventListener('hashchange', showClass); showClass(); }
if (PAGE === 'classes') initClassIndex();
