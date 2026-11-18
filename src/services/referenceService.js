'use strict';
/* Builds the public reference payload (GET /reference and /meta) in the shapes the front end constants use (see src/public/js/data.js). */
const config = require('../config');
const clock = require('../utils/clock');
const ref = require('../models/referenceModel');
const { ordinal } = require('./accountService');

const meta = () => ({ today: clock.today(), now: clock.now().toISOString(), tz: config.APP_TZ, fakeToday: !!config.FAKE_TODAY });

/* highlighted packs on the fees page. This is a marketing label, not stored in package_def. */
const BEST_PACKS = new Set(['a25', 'k6']);

const money = n => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

function packageShape(p) {
  const unlimited = p.lessons === null;
  const monthPass = /^Children (\d+)-month pass$/.exec(p.name);
  const t = monthPass ? `${monthPass[1]}-month pass` : unlimited ? 'Unlimited' : `${p.lessons} lessons`;
  let per;
  if (unlimited) per = `S$${money(p.price / 2)} a week, billed every 2 weeks`;
  else if (p.compassion_eligible) per = 'Try it out';
  else if (p.billing_unit === '/ month') per = 'Semester-based billing';
  else per = `S$${money(Math.round((p.price / p.lessons) * 100) / 100)} per lesson`;
  const valid = unlimited ? '3-month minimum'
    : p.valid_months ? `Valid ${p.valid_months} months`
      : p.valid_days % 7 === 0 ? `Valid ${p.valid_days / 7} weeks` : `Valid ${p.valid_days} days`;
  const out = {
    id: p.id, t, name: p.name, amt: p.price, d: (p.description || '').replace(/\s*\(3-month minimum\)/, ''), per,
    lessons: p.lessons, days: p.valid_days, months: p.valid_months, valid
  };
  if (p.billing_unit) out.unit = p.billing_unit;
  if (BEST_PACKS.has(p.id)) out.best = true;
  if (p.compassion_eligible) out.compassion = true;
  return out;
}

function policyShape(rows) {
  const v = {};
  for (const r of rows) v[r.setting_key] = r.value_type === 'int' ? parseInt(r.value_text, 10) : r.value_type === 'numeric' ? parseFloat(r.value_text) : r.value_type === 'bool' ? r.value_text === 'true' : r.value_text;
  return {
    registration: v.registration_fee, annualDues: v.annual_dues,
    discounts: { senior: { age: v.discount_senior_age, pct: v.discount_senior_pct }, student: { from: v.discount_student_from_age, to: v.discount_student_to_age, pct: v.discount_student_pct } },
    booking: { aheadMonths: v.booking_ahead_months, minDays: v.booking_min_days, cancelHours: v.cancel_hours, maxPackages: v.max_packages },
    compassionDays: v.compassion_days, lateFee: v.grading_late_fee
  };
}

const templateShape = t => ({
  id: t.id, code: t.code, dojo: t.dojo_id, day: t.weekday, time: t.start_time, end: t.end_time, mat: t.mat, type: t.class_type,
  ins: t.instructor_name, cap: t.capacity, kids: t.kids_only, online: t.online_bookable
});

async function reference() {
  const [dojos, belts, packages, policies, templates, instructors] = await Promise.all([
    ref.listDojos(), ref.listBelts(), ref.listActivePackages(), ref.listPublicPolicies(), ref.listPublicTemplates(), ref.listInstructors()
  ]);
  const tpl = templates.map(templateShape);
  return {
    ...meta(),
    dojos: dojos.map(d => ({ id: d.id, name: d.name, short: d.short_name, code: d.code, region: d.region, addr: d.address, status: d.status })),
    belts: belts.map(b => ({ id: b.id, g: b.name, c: b.belt_color, order: b.sort_order, fee: b.grading_fee })),
    packages: { adult: packages.filter(p => p.audience === 'adult').map(packageShape), kids: packages.filter(p => p.audience === 'kids').map(packageShape) },
    policies: policyShape(policies),
    instructors: instructors.map(i => ({ id: i.user_id, name: i.full_name, dan: `${ordinal(i.dan_grade)} Dan`, photo: i.photo_file, chief: i.is_chief })),
    timetable: { hq: tpl.filter(t => t.dojo === 'hq'), other: tpl.filter(t => t.dojo !== 'hq') }
  };
}

module.exports = { meta, reference, packageShape, policyShape };
