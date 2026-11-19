'use strict';
/* AIKIDO SHINJU-KAI — admin-venues.js  (office portal, Business Admin: external venues)
   The saved Excel column layout per venue, the roster upload and the venue attendance export. Every write goes through ASK.act.baVenue*
   and the server checks the rules; this file only reads the file and shows what came back. Loaded before admin-business.js, which calls vnInit. */

const vnMaxFile = 70 * 1024;

function vnVenues() {
  return (ASK.ref.dojos || []).filter(d => d.id !== 'hq');
}

function vnFillSelect(sel, withAll) {
  const opts = vnVenues().map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
  sel.innerHTML = (withAll ? '<option value="all">All venues</option>' : '') + opts;
}

function vnInit() {
  vnFillSelect($('#vnDojo'), false);
  vnFillSelect($('#vnExportCentre'), true);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
  $('#vnTo').value = today;
  $('#vnFrom').value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date(Date.now() - 30 * 86400000));
  $('#vnDojo').addEventListener('change', vnLoad);
  $('#vnMapSave').addEventListener('click', vnSaveMapping);
  $('#vnUpload').addEventListener('click', vnUpload);
  $('#vnExport').addEventListener('click', vnExport);
  return vnLoad();
}

async function vnLoad() {
  $('#vnResult').hidden = true;
  const m = await run(() => ASK.load.baVenueMapping($('#vnDojo').value));
  $('#vnMemberNo').value = m ? m.memberNoColumn : '';
  $('#vnName').value = m ? m.nameColumn : '';
  $('#vnClass').value = m ? m.classColumn : '';
}

async function vnSaveMapping() {
  const body = {
    memberNoColumn: $('#vnMemberNo').value.trim(),
    nameColumn: $('#vnName').value.trim(),
    classColumn: $('#vnClass').value.trim(),
  };
  if (!body.memberNoColumn || !body.nameColumn || !body.classColumn) { toast('Fill in all three column headings.', 'bad'); return; }
  if (await run(() => ASK.act.baVenueMappingSave($('#vnDojo').value, body))) toast('Layout saved for this venue.');
}

const vnReadBase64 = file => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
  fr.onerror = () => reject(new Error('The file could not be read.'));
  fr.readAsDataURL(file);
});

async function vnUpload() {
  const file = $('#vnFile').files[0];
  if (!file) { toast('Choose an Excel file first.', 'bad'); return; }
  if (!/\.xlsx$/i.test(file.name)) { toast('Use an .xlsx file.', 'bad'); return; }
  if (file.size > vnMaxFile) { toast('That file is too large. Split the roster into smaller files.', 'bad'); return; }
  const data = await vnReadBase64(file).catch(e => { ASK.errToast(e); return null; });
  if (!data) return;
  const r = await run(() => ASK.act.baRosterImport($('#vnDojo').value, { fileName: file.name, data }));
  if (!r) return;
  vnShowResult(r);
  toast(`${plural(r.enrolled, 'student')} enrolled${r.flagged ? `, ${plural(r.flagged, 'row')} on Import issues` : ''}.`, r.flagged ? 'bad' : 'ok');
}

function vnShowResult(r) {
  const issues = (r.issues || []).map(i => `<div class="row"><div><b>Row ${esc(i.rowNo)}</b> · ${esc(i.issueType)}<br><span class="sub">${esc(i.detail)}</span></div></div>`).join('');
  $('#vnResult').innerHTML = `
    <div class="sub" style="margin-top:12px">${esc(r.rows)} rows read · ${esc(r.enrolled)} enrolled · ${esc(r.alreadyEnrolled)} already enrolled · ${esc(r.flagged)} flagged</div>
    ${issues ? `<div class="rows" style="margin-top:8px">${issues}</div>
      <button class="sbtn" type="button" data-page-link="imports" style="margin-top:10px">Open Import issues</button>` : ''}`;
  $('#vnResult').hidden = false;
}

function vnExport() {
  const centre = $('#vnExportCentre').value;
  const from = $('#vnFrom').value, to = $('#vnTo').value;
  if (!from || !to) { toast('Choose the first and last day.', 'bad'); return; }
  run(() => ASK.baVenueCsv({ from, to, centre }));
}
