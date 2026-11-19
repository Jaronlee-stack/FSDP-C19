'use strict';
const axios = require('axios');
const config = require('../config');
const crypto = require('node:crypto');
const { query, withTx } = require('../config/db');
const messaging = () => require('./messagingService');

const TELEGRAM_API_URL = 'https://api.telegram.org';

/**
 * Handle incoming Telegram webhook message
 * Updates student profile with chat_id when they send /start
 */
async function handleWebhookMessage(message) {
  const { chat, text, from } = message;
  
  if (!text || !from) return { processed: false };

  const input = text.trim().toUpperCase();
  if (/^ASK-\d{4}-\d{3,6}$/.test(input)) {
    await requestLinkCode(input, String(chat.id));
    await sendMessage(chat.id, `If that member number is registered, we've emailed a 6-digit code to the address on file. Reply here with the code within ${CODE_TTL_MIN} minutes.`);
    return { processed: true, action: 'code_requested' };
  }
  if (/^\d{6}$/.test(input)) {
    const r = await verifyLinkCode(String(chat.id), input);
    await sendMessage(chat.id, r.success
      ? `✅ Your Telegram account is now linked!\n\nYou'll receive class reminders, grading announcements, attendance updates and event announcements here.`
      : r.message);
    return { processed: true, action: r.success ? 'linked' : 'code_rejected' };
  }

  const followUp = input === '/START' ? null : await require('./benFollowupService').handleReply(chat.id, text);
  if (followUp) {
    await sendMessage(chat.id, escHtml(followUp.reply));
    return { processed: true, action: followUp.action };
  }

  if (input !== '/START') {
    // anything else is a question for Ben (answered from the vault, or passed to the admin inbox)
    const r = await require('./benService').answer({ question: text, chatId: chat.id });
    await sendMessage(chat.id, escHtml(r.text));
    return { processed: true, action: r.kind };
  }

  // Try to find student by telegram user ID or other identifier
  // For now, we need the user to provide their member number
  try {
    // Send reply asking for member number
    await sendMessage(chat.id, `Hi! 👋\n\nTo link your Telegram account, please reply with your Aikido Shinju-Kai member number (e.g., ASK-2025-1834)\n\nYou'll then receive class reminders, grading updates, and attendance notifications here!`);
    return { processed: true, action: 'asked_for_member_number' };
  } catch (error) {
    console.error('[telegram] Failed to send reply:', error.message);
    return { processed: false, error: error.message };
  }
}

/* Linking is proved by email: the member number only triggers a code to the student's registered address,
   and the chat is linked once that code comes back from the same chat. Replies never reveal whether a member number exists. */
const CODE_TTL_MIN = 10, MAX_ATTEMPTS = 5, RESEND_COOLDOWN_SEC = 60;
const hashCode = (chatId, code) => crypto.createHash('sha256').update(`${chatId}:${code}`).digest('hex');

async function requestLinkCode(memberNo, chatId) {
  const st = (await query(
    `SELECT s.user_id, s.full_name, u.email FROM student_profile s JOIN users u ON u.id = s.user_id WHERE s.member_no = $1`, [memberNo])).rows[0];
  if (!st || !st.email) return;
  const recent = (await query(
    `SELECT 1 FROM telegram_link_code WHERE (user_id = $1 OR chat_id = $2) AND sent_at > now() - make_interval(secs => $3) LIMIT 1`,
    [st.user_id, chatId, RESEND_COOLDOWN_SEC])).rows.length;
  if (recent) return;
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await query(
    `INSERT INTO telegram_link_code (chat_id, user_id, code_hash, expires_at, attempts, sent_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4), 0, now())
     ON CONFLICT (chat_id) DO UPDATE SET user_id = EXCLUDED.user_id, code_hash = EXCLUDED.code_hash,
       expires_at = EXCLUDED.expires_at, attempts = 0, sent_at = EXCLUDED.sent_at`,
    [chatId, st.user_id, hashCode(chatId, code), CODE_TTL_MIN]);
  await messaging().sendEmailNotification({
    email: st.email, name: st.full_name, notificationType: 'REGISTRATION_CONFIRMATION',
    subject: `Your Telegram link code: ${code}`,
    message: `Someone asked to link a Telegram account to your Aikido Shinju-Kai membership. Your code is <b style="font-size:22px;letter-spacing:4px">${code}</b>. It expires in ${CODE_TTL_MIN} minutes.`,
    secondaryMessage: 'If this was not you, ignore this email. Nothing is linked without this code.'
  });
}

async function verifyLinkCode(chatId, code) {
  const fail = { success: false, message: 'That code is wrong or has expired. Send your member number again to get a new one.' };
  return withTx(async tx => {
    const row = (await query(`SELECT user_id, code_hash, expires_at, attempts FROM telegram_link_code WHERE chat_id = $1 FOR UPDATE`, [chatId], tx)).rows[0];
    if (!row) return fail;
    if (new Date(row.expires_at) < new Date() || row.attempts >= MAX_ATTEMPTS) {
      await query(`DELETE FROM telegram_link_code WHERE chat_id = $1`, [chatId], tx);
      return fail;
    }
    const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hashCode(chatId, code)));
    if (!ok) {
      await query(`UPDATE telegram_link_code SET attempts = attempts + 1 WHERE chat_id = $1`, [chatId], tx);
      return { success: false, message: `That code is not right. ${MAX_ATTEMPTS - row.attempts - 1} tries left.` };
    }
    await query(`UPDATE student_profile SET telegram_chat_id = NULL WHERE telegram_chat_id = $1`, [chatId], tx);
    await query(`UPDATE student_profile SET telegram_chat_id = $1 WHERE user_id = $2`, [chatId, row.user_id], tx);
    await query(`DELETE FROM telegram_link_code WHERE chat_id = $1 OR user_id = $2`, [chatId, row.user_id], tx);
    console.log(`[telegram] Student ${row.user_id} linked a Telegram chat`);
    return { success: true, userId: row.user_id };
  });
}

/**
 * Send message to a user via Telegram bot
 */
async function sendMessage(chatId, text, options = {}) {
  if (!config.telegram?.botToken) {
    console.warn('[telegram] Bot token not configured');
    return { success: false };
  }

  try {
    const response = await axios.post(`${TELEGRAM_API_URL}/bot${config.telegram.botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...options,
    });

    return { success: true, messageId: response.data?.result?.message_id };
  } catch (error) {
    console.error(`[telegram] Failed to send message to ${chatId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification to student's personal Telegram
 */
async function notifyStudent(userId, title, message, details = {}) {
  try {
    // Get student's telegram chat ID
    const result = await query(
      `SELECT telegram_chat_id FROM student_profile WHERE user_id = $1`,
      [userId]
    );

    if (!result.rows[0]?.telegram_chat_id) {
      console.warn(`[telegram] No telegram_chat_id for student ${userId}`);
      return { success: false, reason: 'Chat ID not linked' };
    }

    const chatId = result.rows[0].telegram_chat_id;

    // Format message
    let formattedMessage = `<b>${title}</b>\n\n${message}`;
    
    if (Object.keys(details).length > 0) {
      formattedMessage += '\n\n<b>Details:</b>\n';
      Object.entries(details).forEach(([key, value]) => {
        if (value) {
          const label = key.replace(/([A-Z])/g, ' $1').trim();
          formattedMessage += `<code>${label}:</code> ${value}\n`;
        }
      });
    }

    return await sendMessage(chatId, formattedMessage);
  } catch (error) {
    console.error(`[telegram] Failed to notify student ${userId}:`, error.message);
    return { success: false, error: error.message };
  }
}

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* one announcement to many chats, paced under Telegram's ~30 messages/second limit */
async function broadcast(chatIds, title, body) {
  if (!config.telegram?.botToken || !chatIds.length) return { sent: 0, failed: 0, linked: chatIds.length };
  const text = `<b>${escHtml(title)}</b>${body ? `\n\n${escHtml(body)}` : ''}\n\n— Aikido Shinju-Kai`;
  let sent = 0, failed = 0;
  for (const id of chatIds) {
    const r = await sendMessage(id, text);
    r.success ? sent++ : failed++;
    await new Promise(res => setTimeout(res, 40));
  }
  return { sent, failed, linked: chatIds.length };
}

module.exports = {
  broadcast,
  handleWebhookMessage,
  requestLinkCode,
  verifyLinkCode,
  sendMessage,
  notifyStudent,
};
