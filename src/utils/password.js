'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

const ROUNDS = 10;
const hash = plain => bcrypt.hash(plain, ROUNDS);
const compare = (plain, hashed) => bcrypt.compare(plain, hashed);

/* a hash of a random value, compared against when the account does not exist so the response time does not reveal it */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), ROUNDS);
const dummyCompare = plain => bcrypt.compare(plain, DUMMY_HASH);

/* one-time temporary password (letters and digits, no look-alikes) */
function randomPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

/* Returns a message when the password is not acceptable, else null. `avoid` lists values it must not equal
   (email, member number, user id, local part of the email), compared case-insensitively. */
function checkStrength(plain, { avoid = [] } = {}) {
  if (typeof plain !== 'string' || plain.length < 8) return 'Use at least 8 characters.';
  if (Buffer.byteLength(plain, 'utf8') > 72) return 'Use at most 72 bytes (about 72 characters).';
  if (!/[A-Za-z]/.test(plain)) return 'Include at least one letter.';
  if (!/[0-9]/.test(plain)) return 'Include at least one number.';
  const low = plain.toLowerCase();
  if (avoid.some(v => typeof v === 'string' && v && v.toLowerCase() === low)) return 'Do not use your email, ID or member number as your password.';
  return null;
}

module.exports = { hash, compare, dummyCompare, randomPassword, checkStrength };
