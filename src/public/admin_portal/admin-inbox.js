'use strict';
/* AIKIDO SHINJU-KAI — admin-inbox.js  (office portal, both roles: questions Ben could not answer)
   Lists the questions Ben escalated and sends the staff reply through ASK.act.inboxReply. The server checks every rule and sends
   the reply on Telegram; this file only shows what came back. Loaded before admin-business.js, which calls ibInit. */

const IB = { status: 'open', items: [], selected: null, seq: 0 };
const IB_CHOICES = [
  ['this_user', 'Answer this person only'],
  ['faq', 'Add to the FAQ'],
  ['knowledge', 'Update a knowledge note'],
  ['not_for_bot', 'Not for Ben: tell them to contact HQ']
];

Object.assign(ASK.load, {
  inbox: status => ASK.get('/admin/inbox' + (status ? '?status=' + encodeURIComponent(status) : ''))
});
Object.assign(ASK.act, {
  inboxReply: (id, body) => ASK.api('POST', '/admin/inbox/' + encodeURIComponent(id) + '/reply', body).then(r => {
    if (ASK.refreshSummary) ASK.refreshSummary();
    return r;
  })
});

const ibWhen = iso => new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' });
const ibWho = i => (i.who ? `${esc(i.who)}${i.memberNo ? ` · ${esc(i.memberNo)}` : ''}` : (i.channel === 'telegram' ? 'Unlinked Telegram chat' : 'No name on file'));
const ibChannel = i => (i.channel === 'telegram' ? 'Telegram' : 'Portal');

function ibInit() {
  $('#ibTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-f]');
    if (b) { IB.status = b.dataset.f; IB.selected = null; $$('#ibTabs [data-f]').forEach(x => x.classList.toggle('on', x === b)); ibLoad(); }
  });
  $('#ibRows').addEventListener('click', e => {
    const r = e.target.closest('[data-id]');
    if (r) { IB.selected = r.dataset.id; ibRender(); }
  });
  $('#ibChoice').addEventListener('change', ibChoiceChanged);
  $('#ibSend').addEventListener('click', ibSend);
  return ibLoad();
}

async function ibLoad() {
  const n = ++IB.seq;
  const r = await run(() => ASK.load.inbox(IB.status));
  if (!r || n !== IB.seq) return;
  IB.items = r.items || [];
  if (IB.selected && !IB.items.some(i => i.id === IB.selected)) IB.selected = null;
  ibRender();
}

function ibRender() {
  const open = IB.status === 'open';
  $('#ibEmpty').textContent = open ? 'Nothing waiting. Ben has answered everything it was sure about.' : 'No answered questions yet.';
  $('#ibEmpty').hidden = IB.items.length > 0;
  $('#ibRows').innerHTML = IB.items.map(i => `
    <div class="row" data-id="${esc(i.id)}" style="cursor:pointer;${IB.selected === i.id ? 'background:var(--paper-2,#f4f1ea)' : ''}">
      <div><b>${esc(i.question)}</b><br><span class="sub">${ibWho(i)} · ${esc(ibChannel(i))} · ${esc(ibWhen(i.createdAt))}</span></div>
      <span class="sub">${esc(i.reason)}</span>
    </div>`).join('');
  ibRenderDetail();
}

function ibRenderDetail() {
  const i = IB.items.find(x => x.id === IB.selected);
  $('#ibDetailEmpty').hidden = !!i;
  $('#ibDetail').hidden = !i;
  if (!i) return;
  const notes = i.checkedNotes.length ? i.checkedNotes.map(n => esc(n)).join(', ') : 'none';
  const answered = i.status !== 'open';
  $('#ibInfo').innerHTML = `
    <p><b>Asked:</b> "${esc(i.question)}"</p>
    <p class="sub"><b>Why Ben was not sure:</b> ${esc(i.reason)}<br><b>Notes Ben checked:</b> ${notes}<br>${esc(ibChannel(i))} · ${ibWho(i)} · ${esc(ibWhen(i.createdAt))}</p>`;
  $('#ibFormWrap').hidden = answered;
  $('#ibAnswered').hidden = !answered;
  if (answered) {
    const how = IB_CHOICES.find(c => c[0] === i.choice);
    const sent = i.delivery === 'telegram' ? 'Sent on Telegram' : i.delivery === 'telegram_failed' ? 'Telegram did not accept it' : 'Shown in the portal only';
    $('#ibAnswered').innerHTML = `<p><b>${esc(how ? how[1] : i.choice)}</b>${i.knowledgeNote ? ` · ${esc(i.knowledgeNote)}` : ''}</p>
      <p>${esc(i.reply || '')}</p><p class="sub">${esc(i.answeredBy || 'Staff')} · ${esc(ibWhen(i.answeredAt))} · ${esc(sent)}</p>`;
  } else {
    $('#ibChoice').innerHTML = IB_CHOICES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    $('#ibReply').value = '';
    $('#ibNote').value = '';
    $('#ibHint').textContent = i.channel === 'telegram' && i.chatId !== false
      ? 'Your reply goes to this person on Telegram when the chat is linked.'
      : 'Your reply is saved to the inbox only.';
    ibChoiceChanged();
  }
}

function ibChoiceChanged() {
  $('#ibNoteWrap').hidden = $('#ibChoice').value !== 'knowledge';
}

async function ibSend() {
  const i = IB.items.find(x => x.id === IB.selected);
  if (!i) return;
  const body = { choice: $('#ibChoice').value, reply: $('#ibReply').value.trim() };
  const note = $('#ibNote').value.trim();
  if (note) body.knowledgeNote = note;
  if (!body.reply) { toast('Write a reply first.', 'bad'); return; }
  if (body.choice === 'knowledge' && !note) { toast('Name the knowledge note to update.', 'bad'); return; }
  const r = await run(() => ASK.act.inboxReply(i.id, body));
  if (!r) return;
  if (r.delivery === 'telegram_failed') toast('Saved, but Telegram did not accept the reply. Tell the person another way.', 'bad');
  else toast(r.delivery === 'telegram' ? 'Reply sent on Telegram.' : 'Reply saved.');
  IB.selected = null;
  ibLoad();
}
