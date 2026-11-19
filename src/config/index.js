'use strict';
/* Environment parsing. Secrets only come from the environment (.env in development). Nothing here logs a secret. */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const env = process.env;
const NODE_ENV = env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const warnings = [];

const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };

/* JWT secret: required in production, a clearly-warned throwaway value in development */
let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) throw new Error('JWT_SECRET is required when NODE_ENV=production');
  jwtSecret = 'dev-only-insecure-secret-' + require('node:crypto').randomBytes(16).toString('hex');
  warnings.push('JWT_SECRET is not set: using a random development secret (sessions reset on every restart). Set JWT_SECRET in .env.');
}

/* APP_FAKE_TODAY pins the server date for development (the seed is anchored on 2026-11-06). Ignored in production. */
let fakeToday = null;
if (env.APP_FAKE_TODAY) {
  if (isProd) warnings.push('APP_FAKE_TODAY is ignored in production.');
  else if (/^\d{4}-\d{2}-\d{2}$/.test(env.APP_FAKE_TODAY) && !Number.isNaN(Date.parse(env.APP_FAKE_TODAY + 'T00:00:00Z'))) fakeToday = env.APP_FAKE_TODAY;
  else warnings.push('APP_FAKE_TODAY must look like YYYY-MM-DD: ignored.');
}

if (env.TELEGRAM_BOT_TOKEN && !env.TELEGRAM_WEBHOOK_SECRET) warnings.push('TELEGRAM_WEBHOOK_SECRET is not set: the Telegram webhook rejects every update until it is.');

module.exports = {
  NODE_ENV,
  isProd,
  PORT: int(env.PORT, 3000),
  API_PREFIX: '/api/v1',
  APP_TZ: env.APP_TZ || 'Asia/Singapore',
  FAKE_TODAY: fakeToday,
  /* pglite (default): database inside this process, no server needed. postgres: a PostgreSQL server reached with the DB_* settings below */
  dbDriver: env.DB_DRIVER === 'postgres' ? 'postgres' : 'pglite',
  pgliteDataDir: env.PGLITE_DATA_DIR || path.join(__dirname, '..', '..', 'data', 'pglite'),
  db: {
    host: env.DB_HOST || 'localhost',
    port: int(env.DB_PORT, 5432),
    database: env.DB_NAME || 'ask_dojo',
    user: env.DB_USER || 'postgres',
    password: env.DB_PASSWORD,
    max: int(env.DB_POOL_MAX, 10),
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  },
  jwt: { secret: jwtSecret, expiresIn: env.JWT_EXPIRES_IN || '8h' },
  loginRate: { windowMs: int(env.LOGIN_RATE_WINDOW_MS, 15 * 60 * 1000), max: int(env.LOGIN_RATE_MAX, 10) },
  changePwRate: { windowMs: int(env.CHANGE_PW_RATE_WINDOW_MS, 15 * 60 * 1000), max: int(env.CHANGE_PW_RATE_MAX, 5) },
  trustProxy: env.TRUST_PROXY ? (/^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY) : false,
  brevo: env.BREVO_API_KEY ? {
    apiKey: env.BREVO_API_KEY,
    senderEmail: env.BREVO_SENDER_EMAIL || 'noreply@aikidoshinjukai.com.sg',
    senderName: env.BREVO_SENDER_NAME || 'Aikido Shinju-Kai'
  } : null,
  telegram: env.TELEGRAM_BOT_TOKEN ? {
    botToken: env.TELEGRAM_BOT_TOKEN,
    adminChatId: env.TELEGRAM_ADMIN_CHAT_ID || null,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET || null
  } : null,
  /* Ben: the Ben Bot vault and the local Ollama model. Ben stays off (escalates everything) until OLLAMA_MODEL is set. */
  ben: {
    vaultPath: env.BEN_VAULT_PATH || path.join(__dirname, '..', '..', 'Ben Bot'),
    ollamaUrl: env.OLLAMA_URL || 'http://localhost:11434',
    ollamaModel: env.OLLAMA_MODEL || null,
    timeoutMs: int(env.OLLAMA_TIMEOUT_MS, 60000),
    /* cloud model (Groq, OpenAI-compatible). Used when GROQ_API_KEY is set; takes priority over Ollama. */
    groqApiKey: env.GROQ_API_KEY || null,
    groqModel: env.BEN_GROQ_MODEL || 'llama-3.1-8b-instant',
    groqUrl: env.BEN_GROQ_URL || 'https://api.groq.com/openai/v1/chat/completions'
  },
  warnings
};
