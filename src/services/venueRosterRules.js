'use strict';
/* The rule for one row of a venue roster file. Pure: no database, no file reading.
   A row enrols the student only if the member number exists, the name matches that member's record after normalising
   (case, accents, punctuation and extra spaces ignored, nothing fuzzy), and the class code is one of the venue's weekly classes.
   Anything else is flagged with the issue type shown on the Import issues page. */

const normaliseName = s => String(s || '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const normaliseCode = s => String(s || '').trim().toUpperCase();
const normaliseMemberNo = s => String(s || '').trim().toUpperCase();

/* column index of a header, matched on the normalised header text; -1 when the file has no such column */
const columnIndex = (headers, wanted) => headers.findIndex(h => normaliseName(h) === normaliseName(wanted));

/* { action: 'enrol' } or { action: 'flag', issueType, detail } */
function classify({ memberNo, name, classCode }, { student, classId }) {
  if (!memberNo) return { action: 'flag', issueType: 'Missing information', detail: 'No member number on this row.' };
  if (!student) return { action: 'flag', issueType: 'Unknown member', detail: `No student has member number ${memberNo}.` };
  if (!normaliseName(name)) return { action: 'flag', issueType: 'Missing information', detail: `No name on this row for ${memberNo}.` };
  if (normaliseName(name) !== normaliseName(student.full_name)) {
    return { action: 'flag', issueType: 'Name mismatch', detail: `Name "${name}" does not match member ${memberNo}, who is "${student.full_name}".` };
  }
  if (!normaliseCode(classCode)) return { action: 'flag', issueType: 'Missing information', detail: `No class on the row for ${memberNo}.` };
  if (!classId) return { action: 'flag', issueType: 'Unknown class', detail: `Class "${classCode}" is not a weekly class at this venue.` };
  return { action: 'enrol' };
}

module.exports = { normaliseName, normaliseCode, normaliseMemberNo, columnIndex, classify };
