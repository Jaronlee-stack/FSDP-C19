'use strict';
/* Notifications: every send writes a sent_log row, then goes out to the audience's linked Telegram chats.
   Who may be written to depends on the role: the front desk can only send an approved template to one HQ class or one student;
   a Business Admin can also write their own message and send to everyone, a dojo, a grade, lapsed members or members with unpaid dues. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, forbidden, badRequest, conflict } = require('../utils/errors');
const notificationModel = require('../models/notificationModel');
const sentLogModel = require('../models/sentLogModel');
const sessionModel = require('../models/sessionModel');
const memberModel = require('../models/memberModel');
const { nextId } = require('../models/ids');
const auditService = require('./auditService');
const telegramBotService = require('./telegramBotService');

const isBA = user => user.adminType === 'business';
const FD_AUDIENCES = ['lesson', 'student'];
const BA_AUDIENCES = ['lesson', 'student', 'all', 'dojo', 'grade', 'lapsed', 'unpaid'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

async function overview(user) {
  const [templates, log] = await Promise.all([notificationModel.templates(), notificationModel.sentLog(20)]);
  return {
    templates: templates.map(t => ({ id: t.id, name: t.name, body: t.body })),
    sentLog: log.map(l => ({ id: l.id, at: l.sent_at, audience: l.audience, title: l.title, templateId: l.template_id, by: l.sent_by_name })),
    audiences: isBA(user) ? BA_AUDIENCES : FD_AUDIENCES, canWriteOwn: isBA(user)
  };
}

/* who an audience reaches: { n, label }. Used by the preview and by send, so both always agree. */
async function resolveAudience(user, audience, tx) {
  const allowed = isBA(user) ? BA_AUDIENCES : FD_AUDIENCES;
  if (!allowed.includes(audience.type)) throw forbidden('You cannot send to that audience.', 'AUDIENCE_NOT_ALLOWED');
  {
    let n = 0, label = '', key = null;
    const t = audience.target;
    const need = () => { if (!t) throw badRequest('Choose who to send this to.', 'VALIDATION_ERROR'); return t; };
    if (audience.type === 'lesson') {
      const s = await sessionModel.getDesk(need(), tx);
      if (!s || s.dojo_id !== 'hq') throw notFound('That HQ class was not found.', 'LESSON_NOT_FOUND');
      n = await notificationModel.recipients.lesson(s.lesson_id, tx); key = s.lesson_id;
      label = `${s.class_type} · ${DAY[(new Date(s.session_date + 'T00:00:00Z').getUTCDay() + 6) % 7]} ${Number(s.session_date.slice(8, 10))} ${MON[Number(s.session_date.slice(5, 7)) - 1]} ${s.start_time}`;
    } else if (audience.type === 'student') {
      const st = await memberModel.findByMemberNo(need(), clock.today(), tx);
      if (!st) throw notFound('No student has that member number.', 'MEMBER_NOT_FOUND');
      n = await notificationModel.recipients.student(st.user_id, tx); label = st.full_name; key = st.user_id;
    } else if (audience.type === 'all') { n = await notificationModel.recipients.all(tx); label = 'All members'; }
    else if (audience.type === 'dojo') {
      if (!(await memberModel.dojoExists(need(), tx))) throw notFound('That dojo does not exist.', 'INVALID_DOJO');
      key = t; n = await notificationModel.recipients.dojo(t, tx); label = `Members of ${t}`;
    } else if (audience.type === 'grade') {
      if (!(await memberModel.rankExists(need(), tx))) throw notFound('That grade does not exist.', 'INVALID_RANK');
      key = t; n = await notificationModel.recipients.grade(t, tx); label = `Grade ${t}`;
    } else if (audience.type === 'lapsed') { n = await notificationModel.recipients.lapsed(tx); label = 'Lapsed members'; }
    else { n = await notificationModel.recipients.unpaid(tx); label = 'Members with unpaid dues'; }
    return { n, label, key };
  }
}
/* "Sent to N people" before anything is sent (nothing is written) */
async function preview(user, audience) {
  const { n, label } = await resolveAudience(user, audience);
  return { audience: label, recipients: n };
}
async function send(user, input) {
  const out = await logSend(user, input);
  const chats = await (out.key == null ? notificationModel.telegramChats[input.audience.type]() : notificationModel.telegramChats[input.audience.type](out.key));
  const tg = await telegramBotService.broadcast(chats, out.title, out.body);
  return { id: out.id, recipients: out.recipients, audience: out.audience, title: out.title, telegram: tg };
}
async function logSend(user, { templateId, title, body, audience }) {
  return withTx(async tx => {
    const allowed = isBA(user) ? BA_AUDIENCES : FD_AUDIENCES;
    if (!allowed.includes(audience.type)) throw forbidden('You cannot send to that audience.', 'AUDIENCE_NOT_ALLOWED');
    let tpl = null;
    if (templateId) { tpl = await notificationModel.template(templateId, tx); if (!tpl) throw notFound('That template does not exist.', 'TEMPLATE_NOT_FOUND'); }
    if (!tpl && !isBA(user)) throw forbidden('The front desk can only send an approved template.', 'TEMPLATE_REQUIRED');
    const text = tpl ? tpl.name : (title || '').trim();
    if (!text) throw badRequest('Write a message first.', 'VALIDATION_ERROR');
    const { n, label, key } = await resolveAudience(user, audience, tx);
    if (!n) throw conflict('There is nobody to send this to.', 'NO_RECIPIENTS');
    const id = await nextId(tx, 'sent_log', 'id', 'SL-', 2);
    await sentLogModel.insert({ id, at: clock.now(), sentBy: user.id, audience: label, title: text, templateId: tpl ? tpl.id : null }, tx);
    await auditService.record(tx, user, { action: 'notification.sent', entityType: 'notification', entityId: tpl ? tpl.id : id, summary: `Sent a notification to ${label} (${n} ${n === 1 ? 'person' : 'people'})`,
      details: { sentLogId: id, templateId: tpl ? tpl.id : null, audienceType: audience.type, recipients: n } });
    return { id, recipients: n, audience: label, title: text, body: tpl ? tpl.body : (body || '').trim(), key };
  });
}
module.exports = { overview, send, preview };
