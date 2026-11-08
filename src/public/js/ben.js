/* =====================================================================
   AIKIDO SHINJU-KAI — ben.js  (chat assistant on public pages and the member portal)
   ===================================================================== */
'use strict';

document.body.insertAdjacentHTML('beforeend', `<button class="ben-fab" id="benFab" aria-expanded="false" aria-controls="benPanel" aria-label="Ask Ben"><span class="ben-av"><img src="__ROOT__mascot-still.webp" data-anim="__ROOT__mascot.webp" alt=""><svg viewBox="0 0 120 120"><use href="#ben"/></svg></span><span class="ping"></span><span class="label">Ask Ben</span></button>
<div class="ben-panel" id="benPanel" role="dialog" aria-label="Chat with Ben">
  <div class="bp-head"><span class="ben-av"><img src="__ROOT__mascot-still.webp" data-anim="__ROOT__mascot.webp" alt=""><svg viewBox="0 0 120 120"><use href="#ben"/></svg></span><div><b>Ben</b><small>Shinju-Kai assistant · online</small></div><button id="benClose" aria-label="Close chat"><svg class="ic"><use href="#i-x"/></svg></button></div>
  <div class="bp-body" id="benBody"></div>
  <form class="bp-in" id="benForm"><input id="benInput" placeholder="Ask about classes, fees, grading" autocomplete="off" aria-label="Message Ben"><button aria-label="Send"><svg class="ic"><use href="#i-send"/></svg></button></form>
</div>`.replaceAll('__ROOT__', ROOT));

/* ---------- 11. BEN CHATBOT ---------- */
const BEN = [
  [/trial|try|first class/i, 'A trial session is S$29 for first-time visitors, once per person, at the HQ Dojo in Thomson V One. No uniform needed.'],
  [/join|register|sign ?up|member/i, 'Registration is S$60: registration, handbook, membership book and year-one dues. You pay for your dogi and a lesson package in the same checkout, then sign the form digitally. Takes about 6 minutes.'],
  [/expire|expiry|valid/i, '10 lessons last 11 weeks, 25 lessons 4 months and 50 lessons 6 months. Your portal shows the exact expiry date of every package, and lessons are used from the one expiring first.'],
  [/miss|absent|no.?show|skip|didn.?t (go|come|attend)|can.?t (go|come|make)|sick|\bill\b|\bmc\b|medical|make.?up|catch.?up/i, 'Each booking uses 1 lesson. If you can\'t make it, cancel at least 4 hours before class and the lesson goes back to your package. If you miss a class without cancelling, the lesson stays used, it isn\'t refunded, and it doesn\'t count as a session toward your next grading. There are no make-up classes, so cancel early if your plans change.'],
  [/fee|price|cost|pay|package|lesson/i, 'Adult packs: 10 lessons S$270, 25 lessons S$600, 50 lessons S$980, or unlimited for S$96 every 2 weeks. Children: 1-month S$150, 6-month S$139/month, 50 lessons S$1,200.'],
  [/dogi|uniform|size/i, 'Dogi: Cotton S$30, Heavyweight S$45, Competition S$60. Sizes run 000 (about 100 cm tall) to 7 (190 cm and up).'],
  [/card/i, 'Your membership number arrives by email right after you register. Collect your physical student card at your principal dojo on your first lesson.'],
  [/grad|belt|kyu|dan|promot/i, 'To apply for grading you need 3+ months of membership, no outstanding fees, enough sessions at your grade, and your instructor marking you Qualified. Next grading: 13 Dec, applications close 29 Nov.'],
  [/book|class|schedule|time/i, 'Online booking covers HQ Dojo classes. Book up to 1 month ahead and at least 1 day before. Community club dojos run term courses you register for through the club.'],
  [/where|dojo|location|address|hq/i, 'HQ Dojo is at Thomson V One, 9 Sin Ming Road #B1-02, near Bright Hill MRT. We also train at 60+ community dojos in Singapore and overseas.'],
  [/cancel|refund/i, 'Cancel at least 4 hours before class to get the lesson back. Inside 4 hours, or if you don\'t turn up, the lesson stays used and the class doesn\'t count toward grading.'],
  [/hour|open|contact|phone|email/i, 'Office: Mon–Fri 10 AM–9 PM, Sat–Sun 8 AM–6 PM. Call +65 6513 1588 or email hq@aikidoshinjukai.com.sg.'],
  [/^(hi|hello|hey|osu)/i, 'Osu! What would you like to know?']
];
function openBen() { $('#benPanel').classList.add('open'); $('#benFab').setAttribute('aria-expanded', 'true'); document.body.classList.add('ben-open'); setTimeout(() => $('#benInput').focus({ preventScroll: true }), 200); }
function closeBen() { $('#benPanel').classList.remove('open'); $('#benFab').setAttribute('aria-expanded', 'false'); document.body.classList.remove('ben-open'); }
function benSay(text, who) {
  const m = document.createElement('div'); m.className = 'msg ' + who; m.textContent = text;
  $('#benBody').appendChild(m); $('#benBody').scrollTop = $('#benBody').scrollHeight;
}
function benAsk(q) {
  if (!q.trim()) return;
  benSay(q, 'u');
  const t = document.createElement('div'); t.className = 'msg b typing'; t.innerHTML = '<i></i><i></i><i></i>';
  $('#benBody').appendChild(t); $('#benBody').scrollTop = $('#benBody').scrollHeight;
  const hit = BEN.find(([r]) => r.test(q));
  setTimeout(() => { t.remove(); benSay(hit ? hit[1] : "I don't know that one yet. The HQ office can help: +65 6513 1588 or hq@aikidoshinjukai.com.sg.", 'b'); }, 700 + Math.random() * 400);
}
function initBen() {
  benSay("Osu! I'm Ben. Ask me about trial classes, fees, lesson expiry, dojo locations or grading.", 'b');
  const q = document.createElement('div'); q.className = 'quick';
  q.innerHTML = (document.body.dataset.portal ? ['What if I miss a class?', 'When do lessons expire?', 'Am I eligible for grading?', 'How do I cancel?'] : ['Trial class', 'How to join', 'Lesson packages', 'When do lessons expire?', 'Where is HQ?']).map(s => `<button type="button">${s}</button>`).join('');
  $('#benBody').appendChild(q);
  q.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') benAsk(e.target.textContent); });
  $('#benFab').addEventListener('click', () => $('#benPanel').classList.contains('open') ? closeBen() : openBen());
  $('#benClose').addEventListener('click', closeBen);
  document.addEventListener('click', e => { if (e.target.closest('[data-ben-open]')) openBen(); });
  $('#benForm').addEventListener('submit', e => { e.preventDefault(); benAsk($('#benInput').value); $('#benInput').value = ''; });
  $$('.ben-av img').forEach(img => {
    const fail = () => img.parentElement.classList.add('fallback');
    if (img.complete && !img.naturalWidth) fail();
    img.addEventListener('error', fail);
  });
  const still = url('mascot-still.webp');
  if (!reduce) new Image().src = url('mascot.webp');
  $$('.ben-av img[data-anim]').forEach(img => {
    const host = img.closest('.ben-fab, .cta, .bp-head') || img;
    host.addEventListener('mouseenter', () => { if (!reduce) img.src = img.dataset.anim + '#' + Date.now(); });
    host.addEventListener('mouseleave', () => { img.src = still; });
  });
}

initBen();