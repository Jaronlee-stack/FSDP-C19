/* =====================================================================
   AIKIDO SHINJU-KAI — public.js  (home, about, class pages)
   Writes the shared nav and footer into every public page, then runs
   the home page widgets when on the home page.
   ===================================================================== */
'use strict';

/* class + dojo menus are built from data so every page lists the same items */
const NAV_CLASSES = [['adult', 'Adult Class'], ['children', 'Children Class'], ['mixed', 'Mixed Class (Adults & Children)'], ['ladies', 'Ladies Class'], ['senior', 'Senior SG50 Class'],
  ['weapon', 'Weapon Class'], ['advanced', 'Advanced Class'], ['instructional', 'Instructional Class'], ['private', 'Private Class'], ['sep', 'Sports Education Programme (SEP)'],
  ['corporate', 'Corporate Programme'], ['academy', 'Shinju-Kai Academy']];
const ddItem = (href, label) => `<a href="${href}">${esc(label)}<svg class="ic"><use href="#i-arrow"/></svg></a>`;

document.body.insertAdjacentHTML('afterbegin', `  <header class="nav">
    <div class="nav-in">
      <a class="brand" href="index.html"><img src="https://aikidoshinjukai.com.sg/images/logo.png" alt="">AIKIDO SHINJU-KAI</a>
      <nav class="links" aria-label="Main">
        <div class="dd">
          <a href="about.html">About<svg class="ic"><use href="#i-chev"/></svg></a>
          <div class="dd-menu">
            ${ddItem('about.html#ab-benefits', 'Benefits of Aikido')}${ddItem('about.html#ab-history', 'Our History')}${ddItem('about.html#ab-vision', 'Vision & Mission')}
            ${ddItem('about.html#ab-shihan', 'Philip Lee Shihan')}${ddItem('about.html#ab-instructors', 'Our Instructors')}${ddItem('about.html#ab-overseas', 'Overseas Instructors')}
            ${ddItem('about.html#ab-family', 'Our Extended Family')}${ddItem('about.html#ab-life', 'Life Members')}${ddItem('about.html#ab-careers', 'Careers')}
          </div>
        </div>
        <div class="dd">
          <a href="classes.html">Classes<svg class="ic"><use href="#i-chev"/></svg></a>
          <div class="dd-menu">
            <a class="dd-all" href="classes.html">All classes<svg class="ic"><use href="#i-arrow"/></svg></a>
            ${NAV_CLASSES.map(([id, n]) => ddItem('class.html#' + id, n)).join('')}
          </div>
        </div>
        <div class="dd">
          <a href="dojos.html">Dojos<svg class="ic"><use href="#i-chev"/></svg></a>
          <div class="dd-menu">
            <a class="dd-all" href="dojos.html">All dojos &amp; map<svg class="ic"><use href="#i-arrow"/></svg></a>
            ${DOJOS.map(d => ddItem('dojo.html#' + d.id, d.name)).join('')}
          </div>
        </div>
        <a href="fees.html" data-nav="fees">Fees</a>
        <a href="about.html#ab-instructors">Instructors</a>
        <a href="index.html#faq">FAQ</a>
      </nav>
      <div class="nav-acts">
        <a class="nav-login" href="../student_portal/login.html">Log in</a>
        <a class="btn btn-light" href="join.html">Join Now<span class="dot"><svg class="ic"><use href="#i-plus"/></svg></span></a>
        <button class="menu-btn" data-sm-open aria-expanded="false" aria-controls="sm">Menu<span class="plus"></span></button>
      </div>
    </div>
  </header>`);
document.querySelector('main').insertAdjacentHTML('afterend', `  <footer class="site-foot">
    <div class="foot">
      <div class="foot-top">
        <div class="about"><a class="brand" href="index.html"><img src="https://aikidoshinjukai.com.sg/images/logo.png" alt="">AIKIDO SHINJU-KAI</a><p>Honouring tradition and leading the future of Aikido in Singapore since 1988. Recognised by Aikido World Headquarters, Japan.</p></div>
        <div><h4>Train</h4><ul><li><a href="about.html">About us</a></li><li><a href="classes.html">Classes</a></li><li><a href="dojos.html">Our dojos</a></li><li><a href="about.html#ab-instructors">Instructors</a></li><li><a href="index.html#faq">FAQ</a></li></ul></div>
        <div><h4>Membership</h4><ul><li><a href="join.html">Register</a></li><li><a href="fees.html">Fees</a></li><li><a href="trial.html#trial">Book a trial</a></li><li><a href="../student_portal/login.html">Log in</a></li></ul></div>
        <div><h4>Contact</h4><ul class="num"><li>+65 6513 1588</li><li>+65 6256 0111</li><li>hq@aikidoshinjukai.com.sg</li><li>Thomson V One, 9 Sin Ming Road, #B1-02</li></ul></div>
        <div><h4>Office hours</h4><ul><li>Mon–Fri · 10 AM – 9 PM</li><li>Sat–Sun · 8 AM – 6 PM</li><li>Closed on public holidays</li></ul></div>
      </div>
      <div class="foot-big" aria-hidden="true">SHINJU-KAI 合気道</div>
      <div class="foot-bot"><span>© 2026 Aikido Shinju-Kai. Student project concept.</span><span>Privacy · Terms · Accessibility · <a href="#" data-reset style="color:inherit">Reset prototype data</a></span></div>
    </div>
  </footer>`);

/* highlight the current top-level page in the nav */
{
  const file = (location.pathname.split('/').pop() || 'index.html');
  const map = { 'classes.html': 'classes.html', 'class.html': 'classes.html', 'fees.html': 'fees.html', 'dojos.html': 'dojos.html', 'dojo.html': 'dojos.html', 'about.html': 'about.html' };
  const cur = map[file];
  if (cur) $$('.links > a, .links > .dd > a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === cur));
}

/* signed-in members get a shortcut back to their portal */
if (AUTH.role === 'student') { const l = $('.nav-login'); l.textContent = 'My portal'; l.href = url('student_portal/index.html'); }

SM_LINKS = [['About', 'about.html'], ['Classes', 'classes.html'], ['Dojos', 'dojos.html'], ['Fees', 'fees.html'],
  ['Instructors', 'about.html#ab-instructors'], ['Book a trial', 'trial.html#trial'], ['Join now', 'join.html'], ['Log in', '../student_portal/login.html']];

// close the nav dropdowns after a choice (hover/focus would keep them open)
$$('.dd').forEach(dd => {
  $$('.dd-menu a', dd).forEach(a => a.addEventListener('click', () => { dd.classList.add('shut'); a.blur(); }));
  dd.addEventListener('mouseleave', () => dd.classList.remove('shut'));
});

function logoLoop(el, names) {
  const track = $('.loop-track', el);
  const one = names.map(n => `<span class="loop-item">${esc(n)}</span>`).join('');
  track.innerHTML = one + one + one;
  const SPEED = 38, HOVER = 8;
  let x = 0, v = SPEED, target = SPEED, last = performance.now(), drag = null;
  el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') target = HOVER; });
  el.addEventListener('pointerleave', () => { target = SPEED; });
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, start: x, t: performance.now(), lastX: e.clientX }; el.classList.add('drag'); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    const now = performance.now();
    v = -(e.clientX - drag.lastX) / Math.max(1, now - drag.t) * 1000;
    drag.t = now; drag.lastX = e.clientX;
    x = drag.start - (e.clientX - drag.x);
  });
  const end = e => { if (!drag) return; const moved = Math.abs((e && e.clientX || drag.x) - drag.x) > 6; drag = null; el.classList.remove('drag'); v = Math.max(-3000, Math.min(3000, v)); if (moved) { el.dataset.dragged = 1; setTimeout(() => delete el.dataset.dragged, 80); } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  const tick = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!drag) { v += (target - v) * (1 - Math.exp(-dt / 0.45)); x += v * dt; }
    const third = track.scrollWidth / 3;
    if (third) { x = ((x % third) + third) % third; }
    track.style.transform = `translate3d(${-x}px,0,0)`;
    requestAnimationFrame(tick);
  };
  if (!reduce) requestAnimationFrame(tick);
}

/* ---------- instructor marquee: moves on its own, but visitors can also swipe, drag,
   scroll or use the arrows, so nobody has to wait for a face to come round ---------- */
const INS_IMG = 'https://aikidoshinjukai.com.sg/images/instructors/';
const insSlug = n => n.replace(/ (Sensei|Shihan)$/, '').toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '-');
const insCard = (n, dan, img) => `<article class="ins"><div class="ph"><img src="${INS_IMG + (img || insSlug(n) + '.jpg')}" alt="${esc(n)}" loading="lazy" draggable="false" onerror="this.remove()"><span class="ini" aria-hidden="true">${initials(n)}</span></div><div class="meta"><span class="nm">${esc(n)}</span><span class="dan">${esc(dan)}</span></div></article>`;

function scrollMarquee(root, cardsHTML, { dir = 1, speed = 42, label = 'Instructors' } = {}) {
  root.classList.add('mqs');
  root.innerHTML = `<div class="mqs-scroll" tabindex="0" role="region" aria-label="${esc(label)}. Scroll sideways to browse"><div class="mq-track">${cardsHTML}${cardsHTML}</div></div>
    <button type="button" class="mqs-btn prev" aria-label="Scroll back">${icon('left')}</button><button type="button" class="mqs-btn next" aria-label="Scroll forward">${icon('right')}</button>`;
  const sc = $('.mqs-scroll', root), track = $('.mq-track', root);
  const cards = $$('.ins', track); cards.forEach((c, i) => { if (i >= cards.length / 2) c.setAttribute('aria-hidden', 'true'); });
  const half = () => track.scrollWidth / 2;
  let pos = 0, v = 0, last = performance.now(), hover = false, holdUntil = 0, drag = null;
  const hold = ms => { holdUntil = performance.now() + ms; v = 0; };
  const wrapPos = () => { const h = half(); if (!h) return; if (pos >= h) pos -= h; else if (pos < 1) pos += h; };
  requestAnimationFrame(() => { pos = dir < 0 ? half() : 1; sc.scrollLeft = pos; });

  sc.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hover = true; });
  sc.addEventListener('pointerleave', () => { hover = false; });
  sc.addEventListener('scroll', () => { if (Math.abs(sc.scrollLeft - pos) > 2) hold(1800); }, { passive: true });
  sc.addEventListener('touchstart', () => hold(3000), { passive: true });
  sc.addEventListener('focusin', () => hold(4000));
  // mouse drag (touch screens already scroll natively)
  sc.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button) return; drag = { x: e.clientX, s: sc.scrollLeft, moved: false, id: e.pointerId }; });
  sc.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 4) { drag.moved = true; sc.classList.add('drag'); try { sc.setPointerCapture(drag.id); } catch (_) {} }
    if (drag.moved) { hold(1800); sc.scrollLeft = drag.s - dx; pos = sc.scrollLeft; }
  });
  const end = () => { if (!drag) return; const moved = drag.moved; drag = null; sc.classList.remove('drag'); if (moved) { sc.dataset.justDragged = '1'; setTimeout(() => delete sc.dataset.justDragged, 60); } };
  sc.addEventListener('pointerup', end); sc.addEventListener('pointercancel', end);
  sc.addEventListener('click', e => { if (sc.dataset.justDragged) { e.preventDefault(); e.stopPropagation(); } }, true);
  const step = () => (cards[0] ? cards[0].getBoundingClientRect().width + 18 : 240) * 2;
  $('.mqs-btn.prev', root).addEventListener('click', () => { hold(2600); sc.scrollBy({ left: -step(), behavior: reduce ? 'auto' : 'smooth' }); });
  $('.mqs-btn.next', root).addEventListener('click', () => { hold(2600); sc.scrollBy({ left: step(), behavior: reduce ? 'auto' : 'smooth' }); });
  sc.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); hold(2600); sc.scrollBy({ left: step() / 2, behavior: 'smooth' }); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); hold(2600); sc.scrollBy({ left: -step() / 2, behavior: 'smooth' }); }
  });

  const tick = now => {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const held = hover || drag || now < holdUntil || reduce;
    if (held) {
      // let the visitor scroll freely; only keep the loop seamless at the ends
      pos = sc.scrollLeft;
      const h = half();
      if (h && !drag && (pos >= h || pos < 1)) { wrapPos(); sc.scrollLeft = pos; }
    } else {
      v += (speed * dir - v) * Math.min(1, dt * 3);
      pos += v * dt; wrapPos(); sc.scrollLeft = pos;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- HOME: animated logo + title that enters and exits on a loop ---------- */
const HERO_SCENES = [
  { lines: ['AIKIDO', 'SHINJU-KAI'], cls: 'latin', sub: 'Est. 1988 · Recognised by the Aikikai Hombu Dojo, Japan' },
  { lines: ['合気道'], cls: 'kanji', sub: 'Ai · Ki · Dō — the way of harmonising energy' }
];
function heroTitle() {
  const words = $('#lpWords'), sub = $('#lpSub'), logo = $('#lpLogo');
  const paint = sc => {
    let i = 0;
    words.className = 'lp-words ' + sc.cls;
    words.innerHTML = sc.lines.map(l => `<span class="lp-line">${[...l].map(ch => `<span class="ch" style="--i:${i++}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')}</span>`).join('');
    sub.textContent = sc.sub;
  };
  if (reduce) { paint(HERO_SCENES[0]); words.classList.add('in'); sub.classList.add('in'); return; }
  let k = 0;
  const play = () => {
    const sc = HERO_SCENES[k % HERO_SCENES.length];
    paint(sc);
    requestAnimationFrame(() => requestAnimationFrame(() => { words.classList.add('in'); sub.classList.add('in'); }));
    if (k && logo.animate) logo.animate([{ transform: 'rotateY(0) scale(1)' }, { transform: 'rotateY(180deg) scale(1.08)', offset: .5 }, { transform: 'rotateY(360deg) scale(1)' }], { duration: 1100, easing: 'cubic-bezier(.6,0,.2,1)' });
    setTimeout(() => {
      words.classList.add('out'); sub.classList.remove('in');
      setTimeout(() => { words.classList.remove('in', 'out'); k++; play(); }, 950);
    }, sc.cls === 'kanji' ? 3400 : 3800);
  };
  setTimeout(play, 650);   // let the logo land first
}

/* a few slow sakura petals drifting across the hero */
function heroPetals() {
  const box = $('#lpPetals'); if (!box || reduce) return;
  box.innerHTML = [...Array(12)].map((_, i) => `<i style="--x:${(i * 37 + 7) % 100}%;--d:${9 + (i * 7) % 8}s;--delay:${-(i * 1.7) % 12}s;--s:${0.6 + (i % 4) * 0.18}"></i>`).join('');
}

function initHome() {
  heroTitle();
  // dojo names drift along the bottom of the hero; each one opens its dojo page
  logoLoop($('#dojoLoop'), DOJOS.filter(d => !d.status).map(d => d.name).concat(['Shanghai', 'Johor Bahru', 'Batam']));
  $('#dojoLoop').addEventListener('click', e => {
    if ($('#dojoLoop').dataset.dragged) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY), it = hit && hit.closest('.loop-item'); if (!it) return;
    const d = DOJOS.find(x => x.name === it.textContent); if (d) location.href = 'dojo.html#' + d.id;
  });
  heroPetals();
  $$('.qa button').forEach(b => b.addEventListener('click', () => {
    const open = b.parentElement.classList.toggle('open'); b.setAttribute('aria-expanded', open);
  }));
}

/* ---------- 14. DEPTH CAROUSEL (React Bits port) ---------- */
function depthCarousel(root, items, { onChange } = {}) {
  const stage = $('.dc-stage', root), dots = $('.dc-dots', root);
  const cfg = { depth: 170, spread: 62, tilt: 22, visible: 4, falloff: 0.2, blur: 5, duration: 700, w: 250 };
  let cards = [], pos = 0, focus = 0, scale = 1, anim = 0, drag = null, movedAt = 0;
  const N = () => items.length;
  const wrapD = d => { const n = N(); if (n > 1) { d = ((d % n) + n) % n; if (d > n / 2) d -= n; } return d; };
  const layout = p => {
    cards.forEach((el, i) => {
      const d = wrapD(i - p), back = Math.max(0, d), shown = Math.abs(d) <= cfg.visible + 0.5;
      const tz = -cfg.depth * d, tx = cfg.spread * d, ry = cfg.tilt * Math.min(Math.max(d, 0), 1);
      let op = d < 0 ? Math.max(0, 1 + d) : 1; if (!shown) op = 0;
      const br = Math.max(0.15, 1 - back * cfg.falloff), bl = Math.min(cfg.blur, back / cfg.visible * cfg.blur);
      el.style.transform = `translate(-50%,-50%) scale(${scale}) translateX(${tx.toFixed(1)}px) translateZ(${tz.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg)`;
      el.style.opacity = op.toFixed(3);
      el.style.filter = `brightness(${br.toFixed(3)}) blur(${bl.toFixed(2)}px)`;
      el.style.zIndex = String(Math.round(2000 - d * 20));
      el.style.pointerEvents = shown && op > 0.05 ? 'auto' : 'none';
      el.setAttribute('aria-hidden', i !== focus);
      $('.tint', el).style.opacity = Math.min(0.86, back * cfg.falloff * 1.25).toFixed(3);
    });
  };
  const tweenTo = (target, animate = true) => {
    cancelAnimationFrame(anim);
    const from = pos, t0 = performance.now(), dur = animate && !reduce ? cfg.duration : 0;
    const step = now => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      pos = from + (target - from) * e; layout(pos);
      if (k < 1) anim = requestAnimationFrame(step);
      else { const n = N(); pos = ((pos % n) + n) % n; layout(pos); }
    };
    anim = requestAnimationFrame(step);
  };
  const paintDots = () => $$('.dc-dot', dots).forEach((d, i) => { d.classList.toggle('on', i === focus); d.setAttribute('aria-selected', i === focus); });
  const setFocus = (raw, animate = true, force = false) => {
    const n = N(); if (!n) return;
    const idx = ((raw % n) + n) % n;
    let delta = idx - pos; delta = ((delta % n) + n) % n; if (delta > n / 2) delta -= n;
    tweenTo(pos + delta, animate);
    const changed = idx !== focus || force;
    focus = idx; paintDots();
    if (changed && onChange) onChange(items[idx], idx);
  };
  const build = () => {
    stage.innerHTML = items.map((it, i) => `<div class="dc-card" data-i="${i}" aria-roledescription="slide" aria-label="${i + 1} of ${items.length}: ${esc(it.name)}"><img src="${it.img}" alt="" draggable="false" onerror="this.style.opacity=0"><span class="code">${esc(it.code)}</span>${it.status ? `<span class="closed">${esc(it.status)}</span>` : ''}<div class="cap"><b>${esc(it.name)}</b><span>${esc(it.region)} · ${esc(it.addr.split(',').slice(-1)[0].trim())}</span></div><span class="tint"></span></div>`).join('');
    cards = $$('.dc-card', stage);
    dots.innerHTML = items.map((it, i) => `<button type="button" class="dc-dot" role="tab" data-i="${i}" aria-label="${esc(it.name)}"></button>`).join('');
    cancelAnimationFrame(anim); pos = 0; focus = 0; layout(0); paintDots();
  };
  $('.dc-arrow.prev', root).addEventListener('click', () => setFocus(focus - 1));
  $('.dc-arrow.next', root).addEventListener('click', () => setFocus(focus + 1));
  dots.addEventListener('click', e => { const b = e.target.closest('.dc-dot'); if (b) setFocus(+b.dataset.i); });
  stage.addEventListener('click', e => { if (performance.now() - movedAt < 250) return; const c = e.target.closest('.dc-card'); if (c) setFocus(+c.dataset.i); });
  root.addEventListener('pointerdown', e => {
    if (e.target.closest('.dc-arrow, .dc-dots') || N() < 2) return;
    cancelAnimationFrame(anim);
    drag = { x: e.clientX, start: pos, lastX: e.clientX, lastT: performance.now(), v: 0, moved: false, id: e.pointerId };
  });
  root.addEventListener('pointermove', e => {
    if (!drag) return;
    const stepPx = Math.max(cfg.w * 0.55 * scale, 40), dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 4) { drag.moved = true; try { root.setPointerCapture(drag.id); } catch (_) {} }
    if (!drag.moved) return;
    const now = performance.now();
    drag.v = (e.clientX - drag.lastX) / Math.max(now - drag.lastT, 1); drag.lastX = e.clientX; drag.lastT = now;
    pos = drag.start - dx / stepPx; layout(pos);
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) { setFocus(focus, true); return; }
    movedAt = performance.now();
    const stepPx = Math.max(cfg.w * 0.55 * scale, 40);
    setFocus(Math.round(pos - d.v * 180 / stepPx));
  };
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
  root.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setFocus(focus - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setFocus(focus + 1); }
  });
  new ResizeObserver(en => {
    const w = en[0].contentRect.width;
    scale = Math.min(1, Math.max(0.55, w / (cfg.w + cfg.spread * 2 + 120)));
    layout(pos);
  }).observe(root);
  build();
  return {
    setItems(list) { items = list; build(); if (onChange && items[0]) onChange(items[0], 0); },
    setFocus
  };
}

/* stand-in photos for dojos (class photos from the current site) */
const CLASS_IMGS = ['adult/1.jpg', 'mixed/1.jpg', 'children/1.jpg', 'weapons/1.jpg', 'ladies/1.jpg', 'adult/2.jpg', 'seniors/1.jpg', 'weapons/2.jpg', 'ladies/2.jpg', 'private/1.jpg'];
const CLASS_IMG_BASE = 'https://aikidoshinjukai.com.sg/images/classes/';
const dojoImg = d => CLASS_IMG_BASE + CLASS_IMGS[DOJOS.indexOf(d) % CLASS_IMGS.length];
const mapEmbed = addr => `https://maps.google.com/maps?q=${encodeURIComponent(addr)}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
const mapLink = addr => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
const dojoTags = d => `<span class="pill ${d.status ? 'bad' : 'ok'}">${esc(d.status || 'Open')}</span><span class="pill plain">${esc(d.region)}</span>${d.id === HQ ? '<span class="pill navy plain">Online booking · gradings</span>' : '<span class="pill plain">Term courses</span>'}`;

/* depth carousel + live map (dojos page). onPick lets the page sync its own list with the filter. */
function initDojos(onFilter) {
  const regions = ['All'].concat([...new Set(DOJOS.map(d => d.region))]);
  $('#regionFilter').innerHTML = regions.map((r, i) => `<button type="button" class="fpill${i ? '' : ' on'}" data-r="${r}">${r}</button>`).join('');
  const toItem = d => ({ ...d, img: dojoImg(d) });
  const frame = $('#dojoMap'), panel = $('#mapPanel');
  let timer = null;
  const showMap = d => {
    $('#mapName').textContent = d.name;
    $('#mapAddr').textContent = d.addr;
    $('#mapTags').innerHTML = dojoTags(d);
    $('#mapOpen').href = mapLink(d.addr);
    $('#mapOpen').setAttribute('aria-label', `Open ${d.name} in Google Maps`);
    const page = $('#mapPage'); if (page) { page.href = 'dojo.html#' + d.id; page.setAttribute('aria-label', `Open the ${d.name} page`); }
    clearTimeout(timer);
    frame.classList.add('fade'); panel.classList.remove('ready');
    timer = setTimeout(() => { frame.src = mapEmbed(d.addr); }, 260);
  };
  frame.addEventListener('load', () => { if (frame.getAttribute('src')) { frame.classList.remove('fade'); panel.classList.add('ready'); } });
  const car = depthCarousel($('#dojoCarousel'), DOJOS.map(toItem), { onChange: showMap });
  showMap(DOJOS[0]);
  $('#regionFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    $$('#regionFilter .fpill').forEach(x => x.classList.toggle('on', x === b));
    car.setItems(DOJOS.filter(d => b.dataset.r === 'All' || d.region === b.dataset.r).map(toItem));
    if (onFilter) onFilter(b.dataset.r);
  });
}

/* ---------- DOJOS: all dojos (carousel, map, and a card for every dojo) ---------- */
const dojoCard = d => `<a class="dojo-card" href="dojo.html#${d.id}" data-region="${esc(d.region)}">
  <div class="ph"><img src="${dojoImg(d)}" alt="" loading="lazy"><span class="code">${esc(d.code)}</span>${d.status ? `<span class="closed">${esc(d.status)}</span>` : ''}</div>
  <div class="bd"><span class="rg">${esc(d.region)}${d.id === HQ ? ' · Headquarters' : ''}</span><h3>${esc(d.name)}</h3><p>${esc(d.addr)}</p><span class="go">View dojo${icon('arrow')}</span></div></a>`;

function initDojoList() {
  $('#dojoCount').textContent = DOJOS.length;
  $('#dojoGrid').innerHTML = DOJOS.map(dojoCard).join('');
  initDojos(r => $$('#dojoGrid .dojo-card').forEach(c => { c.hidden = r !== 'All' && c.dataset.region !== r; }));
}

/* ---------- DOJO: one page per dojo, chosen by the #id in the address (dojo.html#bedok) ---------- */
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function renderDojo(id) {
  const i = DOJOS.findIndex(d => d.id === id), d = DOJOS[i], hq = d.id === HQ;
  document.title = `${d.name} · Aikido Shinju-Kai`;
  $('#djBg').style.backgroundImage = `url("${dojoImg(d)}")`;
  $('#djBg').setAttribute('aria-label', d.name);
  $('#djEyebrow').textContent = `Dojo · ${d.region}${hq ? ' · Headquarters' : ''}`;
  $('#djTitle').textContent = d.name;
  $('#djAddr').textContent = d.addr;
  $('#djActs').innerHTML = `<a class="btn btn-light" href="${mapLink(d.addr)}" target="_blank" rel="noopener">Get directions<span class="dot">${icon('map')}</span></a>`
    + (hq ? `<a class="btn btn-ghost" href="../student_portal/login.html">Book a class<span class="dot">${icon('arrow')}</span></a>` : `<a class="btn btn-ghost" href="trial.html#trial">Try a class at HQ · S$29<span class="dot">${icon('arrow')}</span></a>`);
  $('#djClosed').hidden = !d.status;
  $('#djClosed').innerHTML = d.status ? `<div class="note warn">${icon('info')}<span><b>${esc(d.status)}.</b> Classes at this dojo are paused. Members can train at the HQ Dojo or another dojo nearby in the meantime.</span></div>` : '';

  $('#djFacts').innerHTML = [
    ['pin', 'Address', d.addr.split(',').slice(-1)[0].trim(), d.addr.split(',').slice(0, -1).join(',').trim() || d.addr],
    ['map', 'Region', d.region, `Dojo code ${d.code}`],
    ['cal', 'How to train', hq ? 'Book online' : 'Term courses', hq ? 'Members book HQ classes in the portal' : 'Register through the club or your instructor'],
    hq ? ['award', 'Gradings', 'Held at HQ', 'Kyu and Dan gradings for every dojo'] : ['phone', 'Enquiries', '+65 6513 1588', 'HQ office routes you to this dojo']
  ].map(([ic, l, b, sub]) => `<div class="cp-fact"><span class="l">${icon(ic)}${esc(l)}</span><b>${esc(b)}</b><span>${esc(sub)}</span></div>`).join('');

  $('#djMap').src = mapEmbed(d.addr);
  $('#djMapOpen').href = mapLink(d.addr);
  $('#djInfo').innerHTML = hq
    ? `<h3>Visiting HQ</h3><p>Our permanent Headquarters and Shinju Hub opened in May 2024, with two training halls, a member lounge and a café.</p>
       <div class="kv"><div><span>Phone</span><span>+65 6513 1588</span></div><div><span>Email</span><span>hq@aikidoshinjukai.com.sg</span></div><div><span>Mon – Fri</span><span>10 AM – 9 PM</span></div><div><span>Sat – Sun</span><span>8 AM – 6 PM</span></div><div><span>Public holidays</span><span>Closed</span></div></div>`
    : `<h3>Training here</h3><p>This community dojo runs Shinju-Kai term courses. Schedules change each term, so the HQ office will tell you the current class times and the next intake.</p>
       <div class="kv"><div><span>Phone</span><span>+65 6513 1588</span></div><div><span>Email</span><span>hq@aikidoshinjukai.com.sg</span></div><div><span>Grading</span><span>At HQ Dojo</span></div></div>
       <p class="fine">Training packages bought online are valid at HQ only.</p>`;

  // timetable: HQ's weekly classes; community dojos point to the office
  $('#djSchedH').textContent = hq ? 'Weekly timetable' : 'Class times';
  $('#djSched').innerHTML = hq
    ? `<div class="dj-week">${DAYS_FULL.map((day, k) => {
        const list = CLASSES.filter(c => c.day === k).sort((a, b) => a.time.localeCompare(b.time));
        return `<div class="dj-day"><b>${day}</b>${list.length ? list.map(c => `<div class="dj-slot${c.kids ? ' kids' : ''}"><span class="t">${timeLabel(c.time)}</span><span class="n">${esc(c.type)}</span><span class="i">${esc(c.ins.replace(' Sensei', ''))}</span></div>`).join('') : '<span class="none">No classes</span>'}</div>`;
      }).join('')}</div><p class="fine">Every class is 60 minutes. Members book in the student portal, up to 1 month ahead.</p>`
    : `<div class="empty-dj">${icon('cal')}<div><b>Ask HQ for this term's timetable</b><span>Call +65 6513 1588 or email hq@aikidoshinjukai.com.sg. New to Aikido? Start with a S$29 trial at HQ.</span></div><a class="btn btn-dark arrow" href="trial.html#trial">Book a trial<span class="dot">${icon('arrow')}</span></a></div>`;

  const near = DOJOS.filter(x => x.region === d.region && x.id !== d.id);
  $('#djNearWrap').hidden = !near.length;
  $('#djNearH').textContent = `More dojos in the ${d.region}`;
  $('#djNear').innerHTML = near.map(dojoCard).join('');
  const prev = DOJOS[(i - 1 + DOJOS.length) % DOJOS.length], next = DOJOS[(i + 1) % DOJOS.length];
  $('#djPN').innerHTML = `<a href="#${prev.id}"><small>${icon('back')}Previous dojo</small><b>${esc(prev.name)}</b></a><a class="next" href="#${next.id}"><small>Next dojo${icon('arrow')}</small><b>${esc(next.name)}</b></a>`;
}
function showDojo() {
  const id = location.hash.slice(1);
  if (!DOJOS.some(d => d.id === id)) { history.replaceState(null, '', '#' + HQ); return showDojo(); }
  renderDojo(id);
  window.scrollTo(0, 0);
  animateIn(document.body);
}

if (PAGE === 'home') initHome();
if (PAGE === 'dojos') initDojoList();
/* dojo page: section links scroll instead of changing the #dojo in the address */
document.addEventListener('click', e => { const j = e.target.closest('[data-jump]'); if (!j) return; e.preventDefault(); const t = document.getElementById(j.dataset.jump); if (t) t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); });
if (PAGE === 'dojo') { window.addEventListener('hashchange', showDojo); showDojo(); }