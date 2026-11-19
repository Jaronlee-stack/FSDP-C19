'use strict';
/* Ben's follow-up outreach: newcomers and students whose attendance is declining, who have linked Telegram.
   Ben sends one fixed message a week at most, logs it on the follow-up, and reads the reply.
   A clear yes closes the follow-up. Anything else goes to the admin inbox and the follow-up stays open. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { nextId } = require('../models/ids');
const followupModel = require('../models/followupModel');
const policyModel = require('../models/policyModel');
const benFollowupModel = require('../models/benFollowupModel');
const auditService = require('./auditService');
const adminInboxService = require('./adminInboxService');
const rules = require('./benFollowupRules');
const telegram = () => require('./telegramBotService');

const OUTREACH_KINDS = ['newcomer', 'declining'];
const ONE_PER_WEEK_DAYS = 7;
const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function logAttempt(followupId, method, outcome, note) {
  return withTx(async tx => {
    const id = await nextId(tx, 'followup_attempt', 'id', 'FA-', 2);
    await followupModel.insertAttempt({ id, followupId, at: clock.now(), method, outcome, note }, tx);
  });
}

async function runOutreach(actor = null) {
  const today = clock.today();
  const policy = await policyModel.getAll();
  const declineDays = policy.follow_decline_days || 14;
  const summary = { checked: 0, sent: 0, noChat: 0, optedOut: 0, recentlyMessaged: 0, failed: 0 };

  for (const kind of OUTREACH_KINDS) {
    const cands = await followupModel.candidates(kind, today, declineDays);
    const chats = await benFollowupModel.chatsFor(cands.map(c => c.user_id));
    for (const c of cands) {
      summary.checked++;
      const chat = chats.get(c.user_id);
      if (!chat) { summary.noChat++; continue; }
      if (await benFollowupModel.optedOut(c.user_id)) { summary.optedOut++; continue; }
      if (await benFollowupModel.messagedSince(c.user_id, clock.addDays(today, -ONE_PER_WEEK_DAYS))) { summary.recentlyMessaged++; continue; }

      const followupId = await withTx(async tx => {
        const open = await followupModel.findOpen(c.user_id, kind, tx);
        if (open) return open.id;
        const id = await nextId(tx, 'followup', 'id', 'F-', 2);
        await followupModel.insert({ id, userId: c.user_id, kind, ownerId: null, dueDate: today }, tx);
        return id;
      });

      const text = rules.outreachText(kind, c.full_name);
      const sent = await telegram().sendMessage(chat, escHtml(text));
      if (!sent.success) { summary.failed++; continue; }
      await logAttempt(followupId, 'Telegram', 'Ben message sent', text);
      summary.sent++;
    }
  }

  await withTx(tx => auditService.recordSafe(tx, actor, { action: 'followup.ben_outreach', entityType: 'followup',
    summary: `Ben sent ${summary.sent} follow-up message${summary.sent === 1 ? '' : 's'}`, details: summary }));
  return summary;
}

/* Called for every text from a linked chat. Returns null when Ben is not waiting on this student, so the normal Q&A runs. */
async function handleReply(chatId, text) {
  const st = await benFollowupModel.linkedByChat(chatId);
  if (!st) return null;
  const pending = await benFollowupModel.awaitingReply(st.user_id);
  if (!pending) return null;
  const note = String(text).slice(0, 300);

  if (rules.isOptOut(text)) {
    await logAttempt(pending.followup_id, 'Telegram', 'Opted out', note);
    return { action: 'opted_out', reply: "We've noted that. Ben won't send you any more follow-up messages." };
  }
  if (rules.isAffirmative(text)) {
    await withTx(async tx => {
      await followupModel.update(pending.followup_id, { status: 'done' }, tx);
      const id = await nextId(tx, 'followup_attempt', 'id', 'FA-', 2);
      await followupModel.insertAttempt({ id, followupId: pending.followup_id, at: clock.now(), method: 'Telegram', outcome: 'Replied: coming back', note }, tx);
    });
    return { action: 'closed', reply: 'Thank you! We look forward to seeing you in class.' };
  }

  await logAttempt(pending.followup_id, 'Telegram', 'Replied: passed on', note);
  await adminInboxService.escalate({ question: String(text).trim().slice(0, 1000), reason: 'Reply to a Ben follow-up message',
    channel: 'telegram', chatId: String(chatId), userId: st.user_id });
  return { action: 'passed_on', reply: "Thanks, we've passed your message to our team. They'll reply here." };
}

module.exports = { runOutreach, handleReply, OUTREACH_KINDS };
