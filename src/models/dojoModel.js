'use strict';
/* dojo: the venue a QR code or NFC tag belongs to. dojo.qr_token is the payload printed in that venue's code. */
const { query } = require('../config/db');

const findByQrToken = (token, db) => query(
  `SELECT id, name, short_name FROM dojo WHERE qr_token = $1`, [token], db).then(r => r.rows[0] || null);

module.exports = { findByQrToken };
