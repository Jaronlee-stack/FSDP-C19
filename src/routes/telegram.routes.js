'use strict';
/* Telegram bot webhook endpoint */
const router = require('express').Router();
const telegramBotService = require('../services/telegramBotService');

// Webhook endpoint for Telegram updates
router.post('/webhook', async (req, res) => {
  try {
    const { message, callback_query } = req.body;

    // Handle text messages
    if (message) {
      const result = await telegramBotService.handleWebhookMessage(message);
      return res.json({ ok: true, processed: result.processed });
    }

    // Handle callback queries (inline buttons) - future enhancement
    if (callback_query) {
      return res.json({ ok: true });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('[telegram-webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Link member number to telegram chat (called by student via reply)
router.post('/link', async (req, res) => {
  try {
    const { memberNo, telegramChatId } = req.body;

    if (!memberNo || !telegramChatId) {
      return res.status(400).json({ error: 'memberNo and telegramChatId required' });
    }

    const result = await telegramBotService.linkStudentTelegram(memberNo, telegramChatId);
    
    if (result.success) {
      res.json({ ok: true, userId: result.userId });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('[telegram-link] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
