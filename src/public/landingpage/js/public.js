/* =====================================================================
   AIKIDO SHINJU-KAI — public.js  (home, about, class pages)
   Writes the shared nav and footer into every public page, then runs
   the home page widgets when on the home page.
   ===================================================================== */
'use strict';

document.body.insertAdjacentHTML('afterbegin', `  <header class="nav">
    <div class="nav-in">
      <a class="brand" href="index.html"><img src="https://aikidoshinjukai.com.sg/images/logo.png" alt="">AIKIDO SHINJU-KAI</a>
      <nav class="links" aria-label="Main">
        <div class="dd">
          <a href="about.html">About<svg class="ic"><use href="#i-chev"/></svg></a>
          <div class="dd-menu">
            <a href="about.html#ab-benefits">Benefits of Aikido<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="about.html#ab-history">Our History<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="about.html#ab-vision">Vision &amp; Mission<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="about.html#ab-shihan">Philip Lee Shihan<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="about.html#ab-instructors">Our Instructors<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="about.html#ab-overseas">Overseas Instructors<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="about.html#ab-family">Our Extended Family<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="about.html#ab-life">Life Members<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="about.html#ab-careers">Careers<svg class="ic"><use href="#i-arrow"/></svg></a>
          </div>
        </div>
        <div class="dd">
          <a href="index.html#classes">Classes<svg class="ic"><use href="#i-chev"/></svg></a>
          <div class="dd-menu">
            <a href="class.html#adult">Adult Class<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="class.html#children">Children Class<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="class.html#mixed">Mixed Class (Adults &amp; Children)<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="class.html#ladies">Ladies Class<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="class.html#senior">Senior SG50 Class<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="class.html#weapon">Weapon Class<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="class.html#advanced">Advanced Class<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="class.html#instructional">Instructional Class<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="class.html#private">Private Class<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="class.html#sep">Sports Education Programme (SEP)<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="class.html#corporate">Corporate Programme<svg class="ic"><use href="#i-arrow"/></svg></a>
            <a href="class.html#academy">Shinju-Kai Academy<svg class="ic"><use href="#i-arrow"/></svg></a>
          </div>
        </div>
        <a href="index.html#pricing">Fees</a>
        <a href="about.html#ab-instructors">Instructors</a>
        <a href="index.html#find">Dojos</a>
        <a href="index.html#faq">FAQ</a>
      </nav>
      <div class="nav-acts">
        <a class="nav-login" href="login.html">Member log in</a>
        <a class="btn btn-light" href="join.html">Join Now<span class="dot"><svg class="ic"><use href="#i-plus"/></svg></span></a>
        <button class="menu-btn" data-sm-open aria-expanded="false" aria-controls="sm">Menu<span class="plus"></span></button>
      </div>
    </div>
  </header>`);
document.querySelector('main').insertAdjacentHTML('afterend', `  <footer class="site-foot">
    <div class="foot">
      <div class="foot-top">
        <div class="about"><a class="brand" href="index.html"><img src="https://aikidoshinjukai.com.sg/images/logo.png" alt="">AIKIDO SHINJU-KAI</a><p>Honouring tradition and leading the future of Aikido in Singapore since 1988. Recognised by Aikido World Headquarters, Japan.</p></div>
        <div><h4>Train</h4><ul><li><a href="about.html">About us</a></li><li><a href="index.html#classes">Class types</a></li><li><a href="index.html#find">Our dojos</a></li><li><a href="index.html#instructors">Instructors</a></li><li><a href="index.html#faq">Grading</a></li></ul></div>
        <div><h4>Membership</h4><ul><li><a href="join.html">Register</a></li><li><a href="index.html#pricing">Fees</a></li><li><a href="trial.html#trial">Book a trial</a></li><li><a href="login.html">Member log in</a></li></ul></div>
        <div><h4>Contact</h4><ul class="num"><li>+65 6513 1588</li><li>+65 6256 0111</li><li>hq@aikidoshinjukai.com.sg</li></ul></div>
        <div><h4>Office hours</h4><ul><li>Mon–Fri · 10 AM – 9 PM</li><li>Sat–Sun · 8 AM – 6 PM</li></ul></div>
      </div>
      <div class="foot-big" aria-hidden="true">SHINJU-KAI 合気道</div>
      <div class="foot-bot"><span>© 2026 Aikido Shinju-Kai. Student project concept.</span><span>Privacy · Terms · Accessibility · <a href="#" data-reset style="color:inherit">Reset prototype data</a></span></div>
    </div>
  </footer>`);

/* signed-in members get a shortcut back to their portal */
if (AUTH.role === 'student') { const l = $('.nav-login'); l.textContent = 'My portal'; l.href = 'student/index.html'; }

SM_LINKS = [['About', 'about.html'], ['Classes', 'index.html#classes'], ['Fees', 'index.html#pricing'], ['Instructors', 'about.html#ab-instructors'],
  ['Dojos', 'index.html#find'], ['Book a trial', 'trial.html#trial'], ['Join now', 'join.html'], ['Member log in', 'login.html']];

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
  const end = () => { if (!drag) return; drag = null; el.classList.remove('drag'); v = Math.max(-3000, Math.min(3000, v)); };
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

function marquee(root, track) {
  const B = 'https://aikidoshinjukai.com.sg/images/instructors/';
  const card = ([n, d, img, shihan]) => `<article class="ins${shihan ? ' ins-lead' : ''}"><div class="ph"><img src="${B + img}" alt="${esc(n)}" loading="lazy" onerror="this.remove()"><span class="ini" aria-hidden="true">${initials(n)}</span></div><div class="meta"><span class="nm">${esc(n)}</span><span class="dan">${d}</span></div></article>`;
  const html = INSTRUCTORS.map(card).join('');
  track.innerHTML = html + html;
  $$('.ins', track).forEach((el, i) => { if (i >= INSTRUCTORS.length) el.setAttribute('aria-hidden', 'true'); });
  const FAST = reduce ? 0 : 55, SLOW = reduce ? 0 : 12;
  let speed = FAST, target = FAST, x = 0, last = performance.now();
  root.addEventListener('mouseenter', () => target = SLOW);
  root.addEventListener('mouseleave', () => target = FAST);
  const tick = now => {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    speed += (target - speed) * Math.min(1, dt * 4);
    const half = track.scrollWidth / 2;
    x -= speed * dt; if (half && -x >= half) x += half;
    track.style.transform = `translate3d(${x}px,0,0)`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function initHome() {
  logoLoop($('#dojoLoop'), DOJOS.filter(d => !d.status).map(d => d.name).concat(['Shanghai', 'Johor Bahru', 'Batam']));
  marquee($('#marquee'), $('#mqTrack'));
  initDojos();
  $$('#v-home .qa button').forEach(b => b.addEventListener('click', () => {
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

const CLASS_IMGS = ['adult/1.jpg', 'mixed/1.jpg', 'children/1.jpg', 'weapons/1.jpg', 'ladies/1.jpg', 'adult/2.jpg', 'seniors/1.jpg', 'weapons/2.jpg', 'ladies/2.jpg', 'private/1.jpg'];
function initDojos() {
  const B = 'https://aikidoshinjukai.com.sg/images/classes/';
  const regions = ['All'].concat([...new Set(DOJOS.map(d => d.region))]);
  $('#regionFilter').innerHTML = regions.map((r, i) => `<button type="button" class="fpill${i ? '' : ' on'}" data-r="${r}">${r}</button>`).join('');
  const toItem = d => ({ ...d, img: B + CLASS_IMGS[DOJOS.indexOf(d) % CLASS_IMGS.length] });
  const frame = $('#dojoMap'), panel = $('#mapPanel');
  let timer = null;
  const showMap = d => {
    $('#mapName').textContent = d.name;
    $('#mapAddr').textContent = d.addr;
    $('#mapTags').innerHTML = `<span class="pill ${d.status ? 'bad' : 'ok'}">${d.status || 'Open'}</span><span class="pill plain">${d.region}</span>${d.id === 'hq' ? '<span class="pill navy plain">Online booking · gradings</span>' : '<span class="pill plain">Term courses</span>'}`;
    const q = encodeURIComponent(d.addr);
    $('#mapOpen').href = `https://www.google.com/maps/search/?api=1&query=${q}`;
    $('#mapOpen').setAttribute('aria-label', `Open ${d.name} in Google Maps`);
    clearTimeout(timer);
    frame.classList.add('fade'); panel.classList.remove('ready');
    timer = setTimeout(() => { frame.src = `https://maps.google.com/maps?q=${q}&t=&z=16&ie=UTF8&iwloc=&output=embed`; }, 260);
  };
  frame.addEventListener('load', () => { if (frame.getAttribute('src')) { frame.classList.remove('fade'); panel.classList.add('ready'); } });
  const car = depthCarousel($('#dojoCarousel'), DOJOS.map(toItem), { onChange: showMap });
  showMap(DOJOS[0]);
  $('#regionFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    $$('#regionFilter .fpill').forEach(x => x.classList.toggle('on', x === b));
    car.setItems(DOJOS.filter(d => b.dataset.r === 'All' || d.region === b.dataset.r).map(toItem));
  });
}


if (PAGE === 'home') initHome();
