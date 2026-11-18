'use strict';
/* counts for the Business Admin bell and sidebar */
const { query } = require('../config/db');
const businessCounts = db => query(
  `SELECT (SELECT count(*) FROM import_issue WHERE status = 'open')::int AS imports_open,
          (SELECT count(*) FROM grading_candidate WHERE promotion_status = 'Pending approval')::int AS promotions_pending`, [], db).then(r => r.rows[0]);
module.exports = { businessCounts };
