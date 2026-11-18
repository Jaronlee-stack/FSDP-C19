'use strict';
/* Telegram bot webhook. Only Telegram may call it: it must echo the secret set with setWebhook's secret_token. */
const crypto = require('node:crypto');
const router = require('express').Router();
const config = require('../config');
const telegramBotService = require('../services/telegramBotService');

const fromTelegram = req => {
  const secret = config.telegram?.webhookSecret;
  const got = req.get('X-Telegram-Bot-Api-Secret-Token');
  if (!secret || !got) return false;
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

router.post('/webhook', async (req, res) => {
  if (!fromTelegram(req)) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid webhook secret.' } });
  try {
    if (req.body.message) await telegramBotService.handleWebhookMessage(req.body.message);
  } catch (error) {
    console.error('[telegram-webhook] Error:', error.message);
  }
  res.json({ ok: true });   // always 200 to Telegram, or it retries the same update
});

module.exports = router;
