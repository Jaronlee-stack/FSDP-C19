'use strict';
/* Admin inbox: questions Ben could not answer with confidence. Ben calls escalate(); staff reply in the office portal.
   A reply goes back to the person on Telegram when the question came from a linked chat. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, badRequest } = require('../utils/errors');
const inboxModel = require('../models/adminInboxModel');
const { nextId } = require('../models/ids');
const auditService = require('./auditService');
const telegram = () => require('./telegramBotService');

const CHOICES = ['this_user', 'faq', 'knowledge', 'not_for_bot'];
const MAX_QUESTION = 1000, MAX_REASON = 300, MAX_REPLY = 1500;

const shape = x => ({
  id: x.id, question: x.question, reason: x.reason, checkedNotes: x.checked_notes ? x.checked_notes.split(', ') : [],
  channel: x.channel, who: x.asker_name || null, memberNo: x.member_no || null,
  status: x.status, choice: x.reply_choice || null, reply: x.reply || null, knowledgeNote: x.knowledge_note || null,
  createdAt: x.created_at, answeredBy: x.answered_by_name || null, answeredAt: x.answered_at || null, delivery: x.delivery || null
});

const list = async status => (await inboxModel.list(status)).map(shape);
const openCount = () => inboxModel.openCount();

/* Entry point for Ben. No signed-in user: the system raises it. Never throws to the caller for an audit failure. */
async function escalate({ question, reason, checkedNotes = [], channel = 'telegram', chatId = null, userId = null }) {
  const q = String(question || '').trim(), why = String(reason || '').trim();
  if (!q) throw badRequest('The question is empty.', 'VALIDATION_ERROR');
  if (q.length > MAX_QUESTION || why.length > MAX_REASON) throw badRequest('The question or reason is too long.', 'VALIDATION_ERROR');
  if (!['telegram', 'portal'].includes(channel)) throw badRequest('Unknown channel.', 'VALIDATION_ERROR');
  const notes = (Array.isArray(checkedNotes) ? checkedNotes : []).map(n => String(n).slice(0, 80)).join(', ').slice(0, 500);
  return withTx(async tx => {
    const id = await nextId(tx, 'admin_inbox_item', 'id', 'INB-', 4);
    await inboxModel.insert({ id, question: q, reason: why, checkedNotes: notes, channel, chatId: chatId ? String(chatId) : null, userId, at: clock.now() }, tx);
    await auditService.recordSafe(tx, null, { action: 'inbox.escalated', entityType: 'inbox', entityId: id, summary: `Ben escalated a question to the admin inbox (${id})`, details: { channel, reasonLength: why.length } });
    return shape(await inboxModel.get(id, tx));
  });
}

/* staff reply. Sends the reply on Telegram after the database change is committed (never while holding the row lock). */
async function answer(user, id, { choice, reply, knowledgeNote }) {
  if (!CHOICES.includes(choice)) throw badRequest('Choose what to do with this question.', 'VALIDATION_ERROR');
  if (choice === 'knowledge' && !knowledgeNote) throw badRequest('Name the knowledge note to update.', 'VALIDATION_ERROR');
  if (!reply || reply.length > MAX_REPLY) throw badRequest('Write a reply (up to 1,500 characters).', 'VALIDATION_ERROR');
  const chatId = await withTx(async tx => {
    const x = await inboxModel.get(id, tx, true);
    if (!x) throw notFound('That question was not found.', 'INBOX_ITEM_NOT_FOUND');
    if (x.status !== 'open') throw conflict('This question was already answered.', 'ALREADY_ANSWERED');
    await inboxModel.answer(id, { status: 'answered', choice, reply, knowledgeNote: knowledgeNote || null, by: user.id, at: clock.now(), delivery: null }, tx);
    await auditService.record(tx, user, { action: 'inbox.answered', entityType: 'inbox', entityId: id, summary: `Answered admin inbox item ${id} (${choice})`, details: { choice, knowledgeNote: knowledgeNote || null, replyLength: reply.length } });
    return x.chat_id;
  });
  let delivery = 'portal';
  if (chatId) {
    const sent = await telegram().sendMessage(chatId, escHtml(reply));
    delivery = sent.success ? 'telegram' : 'telegram_failed';
  }
  await inboxModel.setDelivery(id, delivery);
  return { item: shape(await inboxModel.get(id)), delivery };
}

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = { list, openCount, escalate, answer, shape, CHOICES };
