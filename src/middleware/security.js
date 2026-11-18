'use strict';
/* helmet with an explicit Content-Security-Policy. The static pages hold one small inline <script> (a trailing-slash redirect),
   so it is allowed by hash instead of opening script-src to 'unsafe-inline'. The hashes are computed from the files at startup. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const helmet = require('helmet');
const config = require('../config');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function inlineScriptHashes(dir) {
  const out = new Set();
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) {
        const html = fs.readFileSync(p, 'utf8');
        for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) out.add(`'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
      }
    }
  };
  try { walk(dir); } catch (_) { /* no public folder: no hashes */ }
  return [...out];
}

function security() {
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...inlineScriptHashes(PUBLIC_DIR)],
    'script-src-attr': ["'none'"],   // no inline event handlers anywhere (image fallbacks use data-fallback, see core.js)
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    'img-src': ["'self'", 'data:', 'blob:', 'https://aikidoshinjukai.com.sg'],
    /* YouTube demonstrations (student curriculum) and the Google Maps embed on the dojo pages */
    'frame-src': ['https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://maps.google.com', 'https://www.google.com'],
    'connect-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"]
  };
  if (config.isProd) directives['upgrade-insecure-requests'] = [];
  return helmet({
    contentSecurityPolicy: { useDefaults: false, directives },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: config.isProd
  });
}

module.exports = security;
