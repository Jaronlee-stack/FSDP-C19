'use strict';
/* AIKIDO SHINJU-KAI — instructor.js  (instructor portal pages) */

const inst = { present: new Set(), filter: 'All', q: '', agDay: (TODAY.getDay() + 6) % 7 };
const MY_INS = 'Bob Tan Sensei';
const timeLabelExact = d => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;

function renderInstTimetable() {
  const mon = mondayOf(TODAY), mine = CLASSES.filter(c => c.ins === MY_INS);
  const isLive = (c, d) => +addDays(mon, d) === +TODAY && c.time === '19:00';
  let html = '<div class="hd"></div>';
  for (let d = 0; d < 7; d++) { const dt = addDays(mon, d); html += `<div class="hd${+dt === +TODAY ? ' today' : ''}">${DAY[dt.getDay()]}<b>${dt.getDate()}</b></div>`; }
  TIMES.forEach(t => {
    html += `<div class="tm">${timeLabel(t)}</div>`;
    for (let d = 0; d < 7; d++) {
      const c = mine.find(x => x.day === d && x.time === t), live = c && isLive(c, d);
      html += `<div class="cell">${c ? `<button class="slotb${live ? ' live' : ''}" data-tt="${CLASSES.indexOf(c)}"><b>${c.type}</b><span>${live ? 'Active now · ' : ''}${c.booked} booked</span></button>` : ''}</div>`;
    }
  });
  $('#instGrid').innerHTML = html;

  const chips = [...Array(7)].map((_, d) => {
    const dt = addDays(mon, d), has = mine.some(c => c.day === d);
    return `<button type="button" class="ag-day${d === inst.agDay ? ' on' : ''}${+dt === +TODAY ? ' today' : ''}" data-ag="${d}"><span>${DAY[dt.getDay()]}</span><b>${dt.getDate()}</b>${has ? '<i></i>' : ''}</button>`;
  }).join('');
  const dt = addDays(mon, inst.agDay);
  const items = mine.filter(c => c.day === inst.agDay).sort((a, b) => a.time.localeCompare(b.time)).map(c => {
    const live = isLive(c, inst.agDay);
    return `<button type="button" class="ag-item${live ? ' live' : ''}" data-tt="${CLASSES.indexOf(c)}"><span class="ag-time">${timeLabel(c.time)}<small>60 min</small></span><span class="ag-main"><b>${c.type}</b><span>HQ Dojo · ${c.booked} of ${c.cap} booked</span></span><span class="ag-st">${live ? 'Active now' : 'Roster'}</span></button>`;
  }).join('');
  $('#instAgenda').innerHTML = `<div class="ag-days">${chips}</div><div class="ag-head">${dayName(dt)} ${fmtDate(dt)}</div><div class="ag-list">${items || '<p class="ag-empty">No classes to teach this day.</p>'}</div>`;
}

function renderStudents() {
  const list = STUDENTS.map((s, i) => ({ s, i })).filter(({ s }) =>
    (inst.filter === 'All' || (inst.filter === 'Not attending' ? isDeclining(s) : s.st === inst.filter)) && s.n.toLowerCase().includes(inst.q));
  $('#stuRows').innerHTML = list.map(({ s, i }) => `<tr class="click" data-s="${i}"><td><div class="who"><span class="av">${initials(s.n)}</span><div><b>${esc(s.n)}</b><span>${s.age} · ${dojoName(s.dojo)}</span></div></div></td><td><span class="belt" style="--belt:${beltOf(s.g)}"><i></i>${s.g}</span></td><td class="num">${s.s} / ${s.need}</td><td>${isDeclining(s) ? `<span style="color:var(--bad);font-weight:600">${s.seen} days ago</span>` : s.seen === 0 ? 'Today' : s.seen === 1 ? 'Yesterday' : s.seen + ' days ago'}</td><td><span class="pill ${s.st === ST_QUALIFIED ? 'ok' : isDeclining(s) ? 'bad' : 'plain'}">${isDeclining(s) && s.st !== ST_QUALIFIED ? 'Not attending' : esc(s.st)}</span></td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">No students match.</td></tr>';
}

function openStudent(i) {
  const s = STUDENTS[i];
  const weeks = Array.from({ length: 8 }, (_, k) => Math.max(0, Math.round((isDeclining(s) ? 3 - k * 0.4 : 2 + Math.sin(k + i) * 1.2))));
  const max = Math.max(...weeks, 3);
  const pts = weeks.map((w, k) => `${k * 40 + 10},${70 - w / max * 56}`).join(' ');
  const ready = s.s >= s.need;
  openDrawer(s.n, `
    <div class="pcard" id="drawerCard" style="max-width:none"><div class="pcard-body"><div class="pcard-tile"><span class="pcard-holo"></span>
      <div class="pcard-top"><span class="pcard-org"><img src="https://aikidoshinjukai.com.sg/images/logo.png" alt="">SHINJU-KAI</span><span class="pcard-kanji">合気道</span></div>
      <div class="pcard-mid"><span class="pcard-av">${initials(s.n)}</span><div><div class="pcard-name">${s.n}</div><div class="pcard-rank" style="--belt:${beltOf(s.g)}"><i style="background:${beltOf(s.g)}"></i>${s.g}</div></div></div>
      <div class="pcard-bot"><span>SESSIONS AT GRADE<b>${s.s} / ${s.need}</b></span><span style="text-align:right">STATUS<b>${s.st.toUpperCase()}</b></span></div><span class="pcard-glare"></span></div>
      <div class="pcard-foot"><span class="st">${isDeclining(s) ? 'Last seen ' + s.seen + ' days ago' : 'Training regularly'}</span><button type="button" data-remind="${i}">${icon('mail')}Message</button></div></div></div>
    <div><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><b>Sessions toward next grade</b><span class="num">${Math.min(100, Math.round(s.s / s.need * 100))}%</span></div><div class="bar${ready ? '' : ' red'}"><i style="width:${Math.min(100, s.s / s.need * 100)}%"></i></div></div>
    <div><b style="font-size:13px">Classes per week · last 8 weeks</b><svg class="spark" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#16213B" stroke-width="2.5"/><circle cx="290" cy="${70 - weeks[7] / max * 56}" r="4" fill="#C1272D"/></svg></div>
    ${isDeclining(s) ? `<div class="note warn"><svg class="ic"><use href="#i-flag"/></svg><span>Not seen for ${s.seen} days. A friendly reminder often brings students back.</span></div>` : ''}
    ${s.st === ST_PROGRESS && ready ? `<div class="note"><svg class="ic"><use href="#i-award"/></svg><span><b>Hours met.</b> Mark as Qualified so ${s.n.split(' ')[0]} can apply for grading.</span></div>` : ''}`,
    s.st === ST_PROGRESS
      ? `<button class="sbtn" data-remind="${i}">${icon('send')}Send reminder</button><button class="sbtn dark" data-qualify="${i}" ${ready ? '' : 'title="Sessions not met yet"'}>${icon('award')}Mark as Qualified</button>`
      : `<button class="sbtn dark" data-remind="${i}">${icon('send')}Remind to apply for grading</button>`);
  profileCard($('#drawerCard'));
}
document.addEventListener('click', e => {
  const r = e.target.closest('[data-remind]');
  if (r) { toast(`Reminder sent to ${STUDENTS[+r.dataset.remind].n}`); return; }
  const q = e.target.closest('[data-qualify]');
  if (q) {
    const s = STUDENTS[+q.dataset.qualify];
    if (s.s < s.need) { toast(`${s.n} needs ${s.need - s.s} more sessions first.`, 'bad'); return; }
    s.st = ST_QUALIFIED;
    if (s.n === ME.name) GRADE.qualified = true;
    save();
    closeDrawer(); if ($('#stuRows')) renderStudents(); toast(`${s.n} is now Qualified for grading`);
  }
});

function renderCandidates() {
  $('#gradeList').innerHTML = CANDIDATES.map((c, i) => `<div class="row"><span class="av">${initials(c.n)}</span><div class="grow"><div class="t">${c.n}</div><div class="d">${c.from} → ${c.to} · HQ Dojo</div></div><div class="acts">${c.done ? `<span class="pill ok">Sent to HQ · ${c.result}</span>` : `<button class="sbtn dark" data-record="${i}">${icon('edit')}Record result</button>`}</div></div>`).join('');
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-record]'); if (!b) return;
  const i = +b.dataset.record, c = CANDIDATES[i];
  openDrawer(`Grading · ${c.n}`, `
    <div class="kv" style="margin:0;border-top:1px solid var(--line)"><div><span>Candidate</span><span>${c.n}</span></div><div><span>Grading for</span><span>${c.from} → ${c.to}</span></div><div><span>Session</span><span>13 Dec 2026 · HQ Dojo</span></div></div>
    <form id="recForm" style="display:grid;gap:16px" novalidate>
      <div class="fld"><span class="lbl">Result</span><div class="seg"><input type="radio" name="res" id="res1" value="Pass" checked><label for="res1">Pass</label><input type="radio" name="res" id="res2" value="Pass with merit"><label for="res2">Pass with merit</label><input type="radio" name="res" id="res3" value="Refer"><label for="res3">Refer</label></div></div>
      <div class="fld"><label for="rec-rank">Rank awarded</label><select id="rec-rank"><option>${c.to}</option><option>${c.from} (no change)</option></select></div>
      <div class="fb-intro"><b>Feedback for ${esc(c.n.split(' ')[0])}</b><span>Shown on the student's Grading page. Type, or tap Dictate to speak and edit after.</span></div>
      <div class="fld dict-fld"><div class="dict-lbl"><label for="rec-well">What went well</label><button type="button" class="dict-btn" data-dictate="rec-well" aria-pressed="false">${icon('mic')}<span>Dictate</span></button></div><textarea id="rec-well" rows="3" placeholder="e.g. Confident ukemi, calm posture in ikkyo"></textarea><span class="dict-msg" role="status" aria-live="polite"></span><span class="err">Add at least one strength.</span></div>
      <div class="fld dict-fld"><div class="dict-lbl"><label for="rec-next">What to work on next</label><button type="button" class="dict-btn" data-dictate="rec-next" aria-pressed="false">${icon('mic')}<span>Dictate</span></button></div><textarea id="rec-next" rows="3" placeholder="e.g. Keep hips lower in iriminage"></textarea><span class="dict-msg" role="status" aria-live="polite"></span><span class="err">Add one thing to work on.</span></div>
      <div class="fld" id="f-recsig"><span class="lbl">Examiner's signature</span><div id="recSig"></div><span class="hint">Signed by ${MY_INS} · ${fmtDate(new Date())}</span><span class="err">Sign to submit the proposal.</span></div>
    </form>`,
    `<button class="sbtn" data-drawer-close>Cancel</button><button class="sbtn red" id="recSend">${icon('sign')}Send to HQ</button>`, { onClose: stopDictation });
  const sig = signaturePad($('#recSig'), { startLabel: 'Sign as examiner', onChange: () => mark('#f-recsig', false) });
  ['rec-well', 'rec-next'].forEach(id => $('#' + id).addEventListener('input', () => fldOf($('#' + id)).classList.remove('invalid')));
  $('#recSend').addEventListener('click', () => {
    stopDictation();
    const well = $('#rec-well').value.trim(), next = $('#rec-next').value.trim(), signed = sig.value();
    mark(fldOf($('#rec-well')), !well); mark(fldOf($('#rec-next')), !next); mark('#f-recsig', !signed);
    if (!well || !next || !signed) { toast(!well || !next ? 'Fill in both feedback boxes.' : 'Sign the proposal first.', 'bad'); return; }
    c.done = true; c.result = radio('res');
    const to = $('#rec-rank').value;
    PROPOSALS.unshift({ n: c.n, from: c.from, to, by: MY_INS, result: c.result, well, next, fb: `${well} Next: ${next}`, sig: signed });
    if (c.n === ME.name) GRADE_FB.unshift({ from: c.from, to: c.result === 'Refer' ? c.from : to, date: new Date(TODAY), by: MY_INS, result: c.result, well, next, status: 'Sent to HQ' });
    save(); setCount('grading', CANDIDATES.filter(x => !x.done).length);
    closeDrawer(); renderCandidates(); toast(`Signed proposal for ${c.n} sent to HQ`);
  });
});

runPage({
  today() {
    const d = new Date();
    $('.page h1').textContent = `Today · ${dayName(d)} ${d.getDate()} ${MON[d.getMonth()]}`;
    const LIVE = { time: '19:00', type: 'Adults' }, key = `${isoDate(TODAY)}|${LIVE.time}`;
    const roster = STUDENTS.slice(0, 14);
    const ended = () => DB.classEnded[key];

    const drawDay = () => $('#dayList').innerHTML = [
      ['6:00 PM', 'Children Beginners', 'HQ Dojo · 10 students', 'Finished', ''],
      ['7:00 PM', 'Adults', `HQ Dojo · ${roster.length} students`, ended() ? 'Finished' : 'Active', ended() ? '' : 'bad'],
      ['8:00 PM', 'Intermediate', 'HQ Dojo · 11 students', 'Upcoming', 'navy']
    ].map(r => `<div class="row"><span class="av time${r[3] === 'Active' ? ' navy' : ''}">${r[0].replace(' ', '<br>')}</span><div class="grow"><div class="t">${r[1]}</div><div class="d">${r[2]}</div></div><span class="pill ${r[4]}">${r[3]}</span></div>`).join('');

    const drawRoster = () => {
      const e = ended();
      $('#roster').innerHTML = roster.map((s, i) => {
        const here = e ? e.present.includes(s.n) : inst.present.has(i);
        const act = e
          ? `<span class="pill ${here ? 'ok' : 'warn'}">${here ? 'Present · +1' : 'No-show'}</span>`
          : `<button class="mark${here ? ' on' : ''}" data-mark="${i}" aria-pressed="${here}">${icon('check')}<span>Present</span></button>`;
        return `<div class="row"><span class="av">${initials(s.n)}</span><div class="grow"><div class="t">${esc(s.n)}</div><div class="d"><span class="belt" style="--belt:${beltOf(s.g)}"><i></i>${s.g}</span> · ${s.s} sessions${isDeclining(s) ? ' · <b style="color:var(--bad)">not seen in ' + s.seen + ' days</b>' : ''}</div></div><div class="acts">${act}</div></div>`;
      }).join('');
    };

    const sync = () => {
      const e = ended();
      $('#presentCount').textContent = e ? e.present.length : inst.present.size;
      $('#markAll').hidden = !!e;
      $('#endClass').hidden = !!e;
      $('#rosterLocked').hidden = !e;
      if (e) $('#rosterLocked').innerHTML = `${icon('lock')}Locked · ended ${timeLabelExact(new Date(e.at))}`;
      $('#rosterSub').textContent = e
        ? `${e.present.length} present (+1 session each) · ${e.noshow.length} no-show (lesson used, not counted)`
        : 'Tap to mark present. Students tapping the NFC tag are marked automatically.';
      const lc = $('.live-card');
      lc.classList.toggle('ended', !!e);
      $('.live-card .tag').textContent = e ? 'Class ended' : 'Active now';
      $('#liveOpen').textContent = e ? 'View attendance' : 'Open roster';
      $$('#roster [data-mark]').forEach(b => { const on = inst.present.has(+b.dataset.mark); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    };

    drawDay(); drawRoster(); sync();

    $('#roster').addEventListener('click', ev => {
      const b = ev.target.closest('[data-mark]'); if (!b || ended()) return;
      const i = +b.dataset.mark; inst.present.has(i) ? inst.present.delete(i) : inst.present.add(i); sync();
    });
    $('#markAll').addEventListener('click', () => { roster.forEach((_, i) => inst.present.add(i)); sync(); toast(`All ${roster.length} students marked present`); });

    /* End class: show the outcome first, then lock attendance */
    $('#endClass').addEventListener('click', () => {
      const here = roster.filter((_, i) => inst.present.has(i)), gone = roster.filter((_, i) => !inst.present.has(i));
      openModal(`<h3 id="modalTitle">End ${LIVE.type} · ${timeLabel(LIVE.time)}?</h3>
        <p class="sub">Attendance locks once the class ends. Check the roster first.</p>
        <div class="end-sum">
          <div class="es ok"><b class="num">${here.length}</b><span>${here.length === 1 ? 'student' : 'students'} present</span><small>Each gets <b>+1 session</b> toward their next grade.</small></div>
          <div class="es warn"><b class="num">${gone.length}</b><span>no-show${gone.length === 1 ? '' : 's'}</span><small>Lesson used, <b>no refund</b>, not counted toward grading.</small></div>
        </div>
        ${gone.length ? `<details class="es-list"><summary>See who's marked as a no-show</summary><p>${gone.map(x => esc(x.n)).join(', ')}</p></details>` : ''}
        <div class="acts"><button class="sbtn red" id="doEnd">${icon('lock')}End class &amp; lock</button><button class="sbtn" data-close>Keep taking attendance</button></div>`);
      $('#doEnd').addEventListener('click', () => {
        roster.forEach(st => {
          const present = here.includes(st);
          if (st.n === ME.name) recordMyAttendance({ date: new Date(TODAY), time: LIVE.time, type: LIVE.type, ins: MY_INS, status: present ? 'present' : 'noshow' });
          else if (present) { st.s++; st.seen = 0; }
        });
        DB.classEnded[key] = { at: new Date(), present: here.map(x => x.n), noshow: gone.map(x => x.n) };
        save(); closeModal(); drawDay(); drawRoster(); sync();
        toast(`Class ended. ${plural(here.length, 'session')} counted, ${plural(gone.length, 'no-show')}.`);
      });
    });

    if (!ended()) [0, 2, 5, 9].forEach((i, k) => setTimeout(() => { if (!ended()) { inst.present.add(i); sync(); } }, 1200 + k * 900)); // simulated NFC taps
    $('#liveOpen').addEventListener('click', () => $('#roster').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }));
  },
  students() {
  const counts = { All: STUDENTS.length, [ST_PROGRESS]: STUDENTS.filter(s => s.st === ST_PROGRESS).length, [ST_QUALIFIED]: STUDENTS.filter(s => s.st === ST_QUALIFIED).length, 'Not attending': STUDENTS.filter(isDeclining).length };
  $('#stuFilter').innerHTML = Object.entries(counts).map(([k, n]) => `<button class="fpill${k === 'All' ? ' on' : ''}" data-f="${k}">${k}<span class="n">${n}</span></button>`).join('');
  $('#stuFilter').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; inst.filter = b.dataset.f; $$('#stuFilter .fpill').forEach(x => x.classList.toggle('on', x === b)); renderStudents(); });
  $('#stuSearch').addEventListener('input', e => { inst.q = e.target.value.toLowerCase(); renderStudents(); });
  $('#stuRows').addEventListener('click', e => { const r = e.target.closest('tr[data-s]'); if (r) openStudent(+r.dataset.s); });
  renderStudents();
  },
  timetable() {
  const mon = mondayOf(TODAY);
  $('#instWeekLbl').textContent = `Week of ${fmtDate(mon)} · tap a class to see its roster.`;
  const page = $('.page');
  page.addEventListener('click', e => {
    const d = e.target.closest('[data-ag]'); if (d) { inst.agDay = +d.dataset.ag; renderInstTimetable(); return; }
    const b = e.target.closest('[data-tt]'); if (!b) return;
    const c = CLASSES[+b.dataset.tt];
    openModal(`<h3 id="modalTitle">${c.type} · ${timeLabel(c.time)}</h3><p class="sub">${dojoName(c.dojo)} · ${c.booked} of ${c.cap} booked</p><div class="rows" style="margin-top:14px">${STUDENTS.slice(0, Math.min(6, c.booked)).map(s => `<div class="row"><span class="av">${initials(s.n)}</span><div class="grow"><div class="t">${s.n}</div><div class="d">${s.g}</div></div></div>`).join('')}</div><p style="font-size:13px;color:var(--muted);margin-top:8px">+ ${Math.max(0, c.booked - 6)} more. The full roster locks on the day.</p>`);
  });
  renderInstTimetable();
  },
  grading() { renderCandidates(); }
});

// search boxes: each one filters only its own list
runPage({
  today() { filterList('#rosterSearch', '#roster'); },
  grading() { filterList('#gradeSearch', '#gradeList'); }
});