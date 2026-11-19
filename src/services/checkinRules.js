'use strict';
/* The rule for one QR scan (an NFC tag opens the same page, so it follows the same rule). Pure: no database and no clock of its own.
   A student is marked present only if ALL of these hold:
     1. the student's principal dojo (student_profile.dojo_id) is the dojo the code belongs to
     2. the student has a class booked at that dojo today
     3. the scan is within 15 minutes of that class's start, before or after
     4. the student is not already marked for that class
   Anything else records nothing, and the student is taken to the student landing page.

   dojoId: the dojo the scanned code belongs to        studentDojoId: the student's principal dojo
   now: Date                                           bookings: today's classes at that dojo, { lessonId, start: Date, attended: boolean }
   returns { action: 'marked' | 'already' | 'none', reason?, lessonId? } */
const WINDOW_MIN = 15;

function decide({ dojoId, studentDojoId, now, bookings, windowMin = WINDOW_MIN }) {
  if (!studentDojoId || studentDojoId !== dojoId) return { action: 'none', reason: 'WRONG_DOJO' };
  if (!bookings.length) return { action: 'none', reason: 'NO_BOOKING' };

  /* the booking closest to now, so a student with two classes today gets the right one */
  const nearest = bookings
    .map(b => ({ b, gap: Math.abs(b.start.getTime() - now.getTime()) }))
    .sort((x, y) => x.gap - y.gap)[0];

  if (nearest.gap > windowMin * 60000) return { action: 'none', reason: 'OUTSIDE_WINDOW', lessonId: nearest.b.lessonId };
  if (nearest.b.attended) return { action: 'already', lessonId: nearest.b.lessonId };
  return { action: 'marked', lessonId: nearest.b.lessonId };
}

module.exports = { decide, WINDOW_MIN };
