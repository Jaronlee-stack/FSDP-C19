'use strict';
/* Venue roster import (Business Admin): an Excel file of one venue's weekly enrolments. Only enrolments are written, and only additions:
   nothing is removed and no profile is changed. Rows that cannot be matched go to Import issues. */
const ExcelJS = require('exceljs');
const { withTx } = require('../config/db');
const { badRequest, notFound } = require('../utils/errors');
const { nextId } = require('../models/ids');
const referenceModel = require('../models/referenceModel');
const venueRosterModel = require('../models/venueRosterModel');
const auditService = require('./auditService');
const rules = require('./venueRosterRules');

const MAX_BYTES = 1024 * 1024, MAX_ROWS = 1000;

async function venueOrThrow(dojoId) {
  if (dojoId === 'hq') throw badRequest('HQ classes are not imported from venue files.', 'INVALID_DOJO');
  if (!(await referenceModel.listDojos()).some(d => d.id === dojoId)) throw notFound('That venue does not exist.', 'INVALID_DOJO');
}

async function getMapping(dojoId) {
  await venueOrThrow(dojoId);
  const m = await venueRosterModel.getMapping(dojoId);
  return m ? { memberNoColumn: m.member_no_col, nameColumn: m.name_col, classColumn: m.class_col } : null;
}

async function saveMapping(user, dojoId, body) {
  await venueOrThrow(dojoId);
  return withTx(async tx => {
    await venueRosterModel.saveMapping(dojoId, body, user.id, tx);
    await auditService.record(tx, user, { action: 'venue.import_mapping_saved', entityType: 'venue', entityId: dojoId,
      summary: `Saved the roster file column mapping for ${dojoId}`, details: body });
    return body;
  });
}

/* the cells of the first sheet as arrays of text, header row first */
async function readSheet(data) {
  const buf = Buffer.from(data, 'base64');
  if (!buf.length || buf.length > MAX_BYTES) throw badRequest('The file is empty or larger than 1 MB.', 'FILE_TOO_LARGE');
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); } catch (_) { throw badRequest('That file could not be read as an Excel (.xlsx) workbook.', 'FILE_UNREADABLE'); }
  const sheet = wb.worksheets[0];
  if (!sheet) throw badRequest('The workbook has no sheet.', 'FILE_UNREADABLE');
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, row => {
    const cells = [];
    for (let c = 1; c <= row.cellCount; c++) cells[c - 1] = String(row.getCell(c).text ?? '').trim();
    rows.push({ rowNo: row.number, cells });
  });
  return rows;
}

async function importRoster(user, dojoId, { fileName, data }) {
  await venueOrThrow(dojoId);
  const mapping = await venueRosterModel.getMapping(dojoId);
  if (!mapping) throw badRequest('Set the column mapping for this venue before uploading its roster.', 'MAPPING_REQUIRED');

  const sheet = await readSheet(data);
  if (!sheet.length) throw badRequest('The file has no rows.', 'FILE_UNREADABLE');
  const headers = sheet[0].cells;
  const cols = {
    memberNo: rules.columnIndex(headers, mapping.member_no_col),
    name: rules.columnIndex(headers, mapping.name_col),
    cls: rules.columnIndex(headers, mapping.class_col),
  };
  const missing = Object.entries({ [mapping.member_no_col]: cols.memberNo, [mapping.name_col]: cols.name, [mapping.class_col]: cols.cls })
    .filter(([, i]) => i < 0).map(([h]) => `"${h}"`);
  if (missing.length) throw badRequest(`The file has no column ${missing.join(', ')}. Check the venue's mapping.`, 'COLUMN_MISSING');

  const body = sheet.slice(1);
  if (body.length > MAX_ROWS) throw badRequest(`A roster file can have at most ${MAX_ROWS} rows.`, 'FILE_TOO_LARGE');

  return withTx(async tx => {
    const summary = { fileName, rows: body.length, enrolled: 0, alreadyEnrolled: 0, flagged: 0, issues: [] };
    const enrolledInFile = new Set();
    const classCache = new Map();

    for (const { rowNo, cells } of body) {
      const memberNo = rules.normaliseMemberNo(cells[cols.memberNo]);
      const name = cells[cols.name] || '';
      const classCode = rules.normaliseCode(cells[cols.cls]);

      let verdict;
      if (memberNo && enrolledInFile.has(memberNo)) {
        verdict = { action: 'flag', issueType: 'Duplicate row', detail: `Member ${memberNo} is already enrolled from an earlier row in this file.` };
      } else {
        const student = memberNo ? await venueRosterModel.studentByMemberNo(memberNo, tx) : null;
        if (!classCache.has(classCode)) classCache.set(classCode, classCode ? await venueRosterModel.classIdByCode(dojoId, classCode, tx) : null);
        verdict = rules.classify({ memberNo, name, classCode }, { student, classId: classCache.get(classCode) });
        if (verdict.action === 'enrol') {
          enrolledInFile.add(memberNo);
          if (await venueRosterModel.enrol(student.user_id, classCache.get(classCode), tx)) summary.enrolled++;
          else summary.alreadyEnrolled++;
          continue;
        }
      }

      summary.flagged++;
      const id = await nextId(tx, 'import_issue', 'id', 'I-', 2);
      const issue = { id, fileName, rowNo, issueType: verdict.issueType, personName: name, detail: verdict.detail };
      await venueRosterModel.addIssue(issue, tx);
      summary.issues.push({ id, rowNo, issueType: verdict.issueType, detail: verdict.detail });
    }

    await auditService.record(tx, user, { action: 'venue.roster_imported', entityType: 'venue', entityId: dojoId,
      summary: `Imported ${fileName} for ${dojoId}: ${summary.enrolled} enrolled, ${summary.flagged} flagged`,
      details: { fileName, rows: summary.rows, enrolled: summary.enrolled, alreadyEnrolled: summary.alreadyEnrolled, flagged: summary.flagged } });
    return summary;
  });
}

module.exports = { getMapping, saveMapping, importRoster };
