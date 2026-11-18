'use strict';
const axios = require('axios');
const config = require('../config');
const { query } = require('../config/db');

const TELEGRAM_API_URL = 'https://api.telegram.org';

/**
 * Handle incoming Telegram webhook message
 * Updates student profile with chat_id when they send /start
 */
async function handleWebhookMessage(message) {
  const { chat, text, from } = message;
  
  if (!text || !from) return { processed: false };

  // Only handle /start command to register chat ID
  if (text.trim() !== '/start') {
    return { processed: false, reason: 'Only /start is handled' };
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

/**
 * Link student to their Telegram chat ID
 * Call this after student provides their member number
 */
async function linkStudentTelegram(memberNo, telegramChatId, db = null) {
  try {
    const result = await (db || query)(
      `UPDATE student_profile 
       SET telegram_chat_id = $1 
       WHERE member_no = $2
       RETURNING user_id`,
      [String(telegramChatId), memberNo.toUpperCase()]
    );

    if (!result.rows.length) {
      return { success: false, error: 'Member number not found' };
    }

    // Send confirmation message
    await sendMessage(telegramChatId, `✅ Your Telegram account is now linked!\n\nYou'll receive notifications for:\n📅 Class reminders\n🏆 Grading announcements\n📝 Attendance updates\n🎉 Event announcements`);

    console.log(`[telegram] Student ${memberNo} linked with chat ${telegramChatId}`);
    return { success: true, userId: result.rows[0].user_id };
  } catch (error) {
    console.error('[telegram] Failed to link student:', error.message);
    return { success: false, error: error.message };
  }
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

module.exports = {
  handleWebhookMessage,
  linkStudentTelegram,
  sendMessage,
  notifyStudent,
};
