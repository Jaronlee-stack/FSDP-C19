'use strict';
const axios = require('axios');
const config = require('../config');
const telegramBotService = require('./telegramBotService');

const BREVO_API_URL = 'https://api.brevo.com/v3';

const NOTIFICATION_TYPES = {
  CLASS_REMINDER: { label: 'Class Reminder', type: 'reminder' },
  GRADING_ANNOUNCEMENT: { label: 'Grading Announcement', type: 'grading' },
  REGISTRATION_CONFIRMATION: { label: 'Registration Confirmation', type: 'registration' },
  ATTENDANCE_UPDATE: { label: 'Attendance Update', type: 'attendance' },
  EVENT_ANNOUNCEMENT: { label: 'Event Announcement', type: 'event' },
};

async function sendEmailNotification({ email, name, notificationType, subject, message, details = {}, actionUrl = null, actionText = 'View Details', secondaryMessage = null }) {
  if (!config.brevo?.apiKey) {
    console.warn('[notification] Brevo API key not configured');
    return { success: false, reason: 'API key not configured' };
  }

  const typeInfo = NOTIFICATION_TYPES[notificationType] || NOTIFICATION_TYPES.CLASS_REMINDER;

  try {
    const response = await axios.post(`${BREVO_API_URL}/smtp/email`, {
      to: [{ email, name }],
      sender: { name: config.brevo.senderName, email: config.brevo.senderEmail },
      subject,
      htmlContent: generateEmailHTML({ name, typeInfo, message, details, actionUrl, actionText, secondaryMessage }),
      replyTo: { email: config.brevo.senderEmail, name: config.brevo.senderName },
    }, {
      headers: { 'api-key': config.brevo.apiKey, 'Content-Type': 'application/json' }
    });

    console.log(`[notification] Email sent to ${email}`);
    return { success: true, messageId: response.data?.messageId };
  } catch (error) {
    console.error(`[notification] Email failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function sendTelegramAnnouncement({ title, message, details = {} }) {
  if (!config.telegram?.botToken || !config.telegram?.adminChatId) {
    console.warn('[notification] Telegram config not set');
    return { success: false, reason: 'Telegram not configured' };
  }

  const telegramApiUrl = `https://api.telegram.org/bot${config.telegram.botToken}`;
  let formattedMessage = `<b>${title}</b>\n\n${message}`;

  if (Object.keys(details).length > 0) {
    formattedMessage += '\n\n<b>Details:</b>\n';
    Object.entries(details).forEach(([key, value]) => {
      if (value) formattedMessage += `${key}: <code>${value}</code>\n`;
    });
  }

  try {
    await axios.post(`${telegramApiUrl}/sendMessage`, {
      chat_id: config.telegram.adminChatId,
      text: formattedMessage,
      parse_mode: 'HTML',
    });
    return { success: true };
  } catch (error) {
    console.error('[notification] Telegram failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function sendTelegramNotification({ userId, title, message, details = {} }) {
  if (!config.telegram?.botToken) {
    console.warn('[notification] Telegram bot token not configured');
    return { success: false, reason: 'Bot token not configured' };
  }

  try {
    return await telegramBotService.notifyStudent(userId, title, message, details);
  } catch (error) {
    console.error('[notification] Telegram personal notification failed:', error.message);
    return { success: false, error: error.message };
  }
}

function generateEmailHTML({ name, typeInfo, message, details, actionUrl, actionText, secondaryMessage }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:-apple-system,'Segoe UI',Roboto;color:#2c3e50}.header{background:linear-gradient(135deg,#1a472a,#2d5a3d);color:#fff;padding:32px;text-align:center}.content{padding:40px 32px}.badge{background:#3d7a52;color:#fff;padding:6px 12px;border-radius:20px;font-size:12px}.detail{background:#f9fafb;border-left:4px solid #3d7a52;padding:20px;margin:24px 0}.button{background:#3d7a52;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none}.footer{background:#f9fafb;padding:32px;text-align:center;border-top:1px solid #e5e7eb;font-size:13px;color:#667085}</style></head><body><div class="header"><div style="font-size:24px;font-weight:700;">🥋 Aikido Shinju-Kai</div><div class="badge" style="margin-top:12px;">${typeInfo.label}</div></div><div class="content"><div style="font-size:18px;font-weight:600;color:#1a472a;margin-bottom:16px;">Hello ${name},</div><p>${message}</p>${details.className || details.date ? `<div class="detail">${details.className ? `<div><b>Class:</b> ${details.className}</div>` : ''}${details.date ? `<div><b>Date:</b> ${details.date}</div>` : ''}${details.time ? `<div><b>Time:</b> ${details.time}</div>` : ''}</div>` : ''}${actionUrl ? `<div style="text-align:center;margin:32px 0;"><a href="${actionUrl}" class="button">${actionText}</a></div>` : ''}${secondaryMessage ? `<p style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:24px;font-size:14px;">${secondaryMessage}</p>` : ''}</div><div class="footer"><b>Aikido Shinju-Kai</b><br>📍 Multiple Dojos | 📞 +65 6712 3456</div></body></html>`;
}

module.exports = { sendEmailNotification, sendTelegramAnnouncement, sendTelegramNotification, NOTIFICATION_TYPES };
