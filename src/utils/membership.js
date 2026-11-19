'use strict';
/* The status a member is shown with. Nothing changes the stored account_status when a membership runs out, so an Active
   membership whose expiry date has passed reads as Expired. Used by every place that shows a member's status. */
const clock = require('./clock');

function memberStatus(accountStatus, expiry, today) {
  if (accountStatus !== 'Active' || !expiry) return accountStatus;
  const day = expiry instanceof Date ? clock.ymd(expiry) : String(expiry).slice(0, 10);
  return day < today ? 'Expired' : accountStatus;
}

module.exports = { memberStatus };
