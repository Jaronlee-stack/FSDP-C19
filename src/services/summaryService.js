'use strict';
/* Small counts for the sidebar badges and the bell, loaded when an office page opens. The Business Admin gets the extra figures. */
const clock = require('../utils/clock');
const applicationModel = require('../models/applicationModel');
const mcModel = require('../models/mcModel');
const exceptionModel = require('../models/exceptionModel');
const equipmentModel = require('../models/equipmentModel');
const followupModel = require('../models/followupModel');
const refundModel = require('../models/refundModel');
const paymentModel = require('../models/paymentModel');
const config = require('../config');
const summaryModel = require('../models/summaryModel');
const inboxModel = require('../models/adminInboxModel');

async function summary(user) {
  const ba = user.adminType === 'business';
  const day = clock.today();
  const [apps, mc, eq, due, untouched] = await Promise.all([
    applicationModel.openCount(), mcModel.pendingCount(), equipmentModel.openCount(), followupModel.dueCount(day), followupModel.untouchedCount()
  ]);
  const out = { applicationsWaiting: apps, mcPending: mc, equipmentOpen: eq, followupsDue: due, followupsUntouched: untouched, exceptionsPending: 0 };
  out.applications = apps + mc;
  out.inboxOpen = await inboxModel.openCount();
  if (ba) {
    const [ex, rf, st, extra] = await Promise.all([exceptionModel.pendingCount(), refundModel.pendingCount(), paymentModel.stats(day, config.APP_TZ), summaryModel.businessCounts()]);
    out.exceptionsPending = ex; out.refundsPending = rf; out.failedPayments = st.failed_count; out.importsOpen = extra.imports_open; out.promotionsPending = extra.promotions_pending;
    out.applications += ex;
  }
  return out;
}
module.exports = { summary };
