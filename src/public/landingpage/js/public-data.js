'use strict';
/* AIKIDO SHINJU-KAI — public-data.js
   The public forms talk to the API: the HQ classes of a day, trial / guest-pass booking, and membership registration.
   The server works out every price; the pages only show what they are told. */

/* HQ group classes a visitor can join on one day ('YYYY-MM-DD'): [{ lessonId, time, end, type, ins, cap, left, kids }] */
ASK.load.sessions = async day => (await ASK.get('/public/sessions?date=' + encodeURIComponent(day))).sessions;

ASK.act.trial = body => ASK.post('/public/trial-bookings', body);
ASK.act.register = body => ASK.post('/public/registrations', body);
