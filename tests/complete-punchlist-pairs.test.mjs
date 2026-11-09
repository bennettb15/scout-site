import test from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import { selectCompleteReportSources, completeReportNoteRecords, wrapReportText, requiresCompletionApproval, isCompletionCapture, reportStatusColor } from '../api-lib/completePunchlistReport.js';
import { completeReportPagePlans, completeReportPairForPortalRow, buildPunchListPdf, pdfFilenameTimestamp } from '../api/punch-list.js';

const photo = (id, date, status = 'active', issue = 'issue') => ({ id, captured_at: date, org_id: 'org', property_id: 'prop', issue_id: issue, issue_status: status });
const event = (id, type, date, group, extra = {}) => ({ id, activity_type: type, created_at: date, from_value: group, org_id: 'org', property_id: 'prop', observation_id: 'issue', ...extra });
const select = (status, shots, activity = []) => selectCompleteReportSources({ status, shots, activity, issueId: 'issue', observationId: 'issue', orgId: 'org', propertyId: 'prop' });
test('report filenames show Eastern time with the correct daylight-saving abbreviation', () => {
  assert.equal(pdfFilenameTimestamp(new Date('2026-11-09T13:14:36Z')), '2026-11-09-08-14-36-EST');
  assert.equal(pdfFilenameTimestamp(new Date('2026-07-01T01:02:03Z')), '2026-06-30-21-02-03-EDT');
  assert.equal(pdfFilenameTimestamp(new Date('2026-11-01T05:30:00Z')), '2026-11-01-01-30-00-EDT');
  assert.equal(pdfFilenameTimestamp(new Date('2026-11-01T06:30:00Z')), '2026-11-01-01-30-00-EST');
});
test('report flags match the portal status colors', () => {
  assert.equal(reportStatusColor('active'), '#dc2626');
  assert.equal(reportStatusColor('pending_review'), '#ea580c');
  assert.equal(reportStatusColor('resolved'), '#15803d');
});
test('complete punchlist keeps original and follow-up notes, including unchanged wording, with their own dates', () => {
  for (const note of ['Repaired downspout', 'Broken downspout']) {
    const records = completeReportNoteRecords({ reason: 'Broken downspout', reportPair: {
      original: { reason: 'Broken downspout', capturedAt: '2026-11-04' },
      completion: { reason: note, capturedAt: '2026-11-05' },
    } });
    assert.deepEqual(records.map((r) => [r.label, r.note, r.createdAt]), [
      ['Original note', 'Broken downspout', '2026-11-04'], ['Updated note', note, '2026-11-05'],
    ]);
  }
});
test('complete punchlist still renders when a property address is unavailable', async () => {
  const pdf = await buildPunchListPdf([{ id: 'item', status: 'active', property: { name: 'Address unavailable' }, trade: 'general', priority: 'medium' }], [], null, true);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});
test('resolved app photo matches the portal preview and excludes a historical shot absent from portal photos', () => {
  const preview = { previewUrl: 'https://example.test/resolved-app-photo' };
  const row = { status: 'resolved', shotId: 'current', capturedAt: '2026-09-24T13:12:00Z',
    reason: 'Test revise wording', preview, scoutPreview: preview };
  const pair = completeReportPairForPortalRow(row, {}, [photo('historical', '2026-09-24T13:02:00Z'), photo('current', '2026-09-24T13:12:00Z', 'resolved')]);
  assert.equal(pair.original, null);
  assert.equal(pair.completion.shotId, 'current');
  assert.equal(pair.completion.preview, preview);
  assert.equal(pair.completion.kind, 'portal_photo');
});
test('approved portal upload is paired with the same before and resolved photos shown in the portal', () => {
  const uploaded = { previewUrl: 'https://example.test/approved-upload' };
  const before = { previewUrl: 'https://example.test/before' };
  const row = { status: 'resolved', shotId: 'before', capturedAt: '2026-09-24T13:02:00Z', reason: 'Original issue',
    preview: uploaded, scoutPreview: before, completionResolution: { resolvedAt: '2026-09-25T10:00:00Z',
      photos: [{ activityId: 'submission', capturedAt: '2026-09-25T09:00:00Z', preview: uploaded, note: 'Completed' }] } };
  const pair = completeReportPairForPortalRow(row, {}, [{ ...photo('before', '2026-09-24T13:02:00Z'), reason: 'Original issue' }]);
  assert.equal(pair.original.preview, before);
  assert.equal(pair.completion.preview, uploaded);
  assert.equal(pair.completion.activityId, 'submission');
  assert.equal(pair.hasApproval, true);
  assert.equal(pair.approvedAt, '2026-09-25T10:00:00Z');
});
test('open report uses the portal current and previous flagged photos', () => {
  const current = { previewUrl: 'https://example.test/current' };
  const previous = { previewUrl: 'https://example.test/previous', flagReason: 'Prior flag' };
  const row = { status: 'active', shotId: 'current', capturedAt: '2026-11-07T11:40:00Z',
    reason: 'Still flagged', preview: current, scoutPreview: current,
    photoHistory: { prior: { shotId: 'previous', capturedAt: '2026-10-01T11:40:00Z', preview: previous } } };
  const pair = completeReportPairForPortalRow(row, {}, [photo('historical', '2026-09-01'), photo('current', '2026-11-07T11:40:00Z')]);
  assert.equal(pair.original.preview, previous);
  assert.equal(pair.current.preview, current);
  assert.equal(pair.completion, null);
  assert.deepEqual(completeReportNoteRecords({ reportPair: pair }).map(({ label, note }) => [label, note]),
    [['Original note', 'Prior flag'], ['Current note', 'Still flagged']]);
});

test('original photo is the earliest flagged capture for the same issue, not the most recent previous photo', () => {
  const shots = [photo('latest', '2026-10-03'), photo('original', '2026-10-01'), photo('other', '2026-09-01', 'active', 'different')];
  const result = select('active', shots);
  assert.equal(result.original.id, 'original');
  assert.equal(result.submission, null);
  assert.equal(result.captured, null);
});
test('pending selects the latest submission while resolved selects the approved group, excluding newer unapproved uploads', () => {
  const activity = [event('old', 'completion_submitted', '2026-10-02', 'old'),
    event('approved', 'completion_submitted', '2026-10-03', 'approved'),
    event('review', 'completion_approved', '2026-10-04', 'approved'),
    event('new', 'completion_submitted', '2026-10-05', 'new')];
  assert.equal(select('pending_review', [], activity).submission.id, 'new');
  const resolved = select('resolved', [], activity);
  assert.equal(resolved.submission.id, 'approved');
  assert.equal(resolved.approval.id, 'review');
});
test('reopening invalidates old approval evidence, and app-capture approval uses its exact shot', () => {
  const old = [event('old', 'completion_submitted', '2026-10-02', 'old'), event('approval', 'completion_approved', '2026-10-03', 'old'),
    event('reopen', 'status_changed', '2026-10-04', 'resolved', { to_value: 'active' })];
  assert.equal(select('resolved', [], old).approval, null);
  const shots = [photo('original', '2026-10-01'), photo('completed', '2026-10-05', 'pending_review')];
  const review = event('review', 'completion_approved', '2026-10-06', 'pending_review', { shot_id: 'completed' });
  assert.equal(select('resolved', shots, [...old, review]).captured.id, 'completed');
});
test('a new pending app photo supersedes an already reviewed portal submission', () => {
  const events = [event('old', 'completion_submitted', '2026-10-02', 'old'), event('approval', 'completion_approved', '2026-10-03', 'old')];
  const result = select('pending_review', [photo('new-app', '2026-10-04', 'pending_review')], events);
  assert.equal(result.submission, null);
  assert.equal(result.captured.id, 'new-app');
});
test('cross-property photos and completion activity cannot pair, and resolved without approval never labels a photo approved', () => {
  const result = select('resolved', [photo('original', '2026-10-01'), { ...photo('bad', '2026-09-01'), property_id: 'other' }],
    [{ ...event('approval', 'completion_approved', '2026-10-04', 'group'), org_id: 'other' }]);
  assert.equal(result.original.id, 'original');
  assert.equal(result.submission, null);
  assert.equal(result.captured, null);
  assert.equal(result.approval, null);
  assert.equal(result.latestObservation, null);
});
test('manually resolved issues use the current portal photo without calling it an approved completion', () => {
  const original = photo('original', '2026-09-24T09:02:00Z');
  const latest = photo('latest', '2026-09-24T09:12:00Z', 'resolved');
  const result = selectCompleteReportSources({ status: 'resolved', shots: [original, latest], activity: [],
    issueId: 'issue', observationId: 'issue', shotId: 'latest', orgId: 'org', propertyId: 'prop' });
  assert.equal(result.original.id, 'original');
  assert.equal(result.latestObservation.id, 'latest');
  assert.equal(result.submission, null);
  assert.equal(result.captured, null);
  assert.equal(result.approval, null);
});
test('an original flagged capture does not become a completion photo when its workflow status changes', () => {
  const original = { ...photo('original', '2026-10-01', 'resolved'), capture_kind: 'flagged_capture' };
  assert.equal(isCompletionCapture(original), false);
  assert.equal(select('active', [original]).original.id, 'original');
  assert.equal(isCompletionCapture({ ...original, capture_kind: 'resolved_capture' }), true);
});
test('long note history retains every note, author, date and paragraph, and flows to continuation pages', () => {
  const doc = new PDFDocument({ autoFirstPage: false });
  const row = { id: 'item', reason: 'Original observation', activity: Array.from({ length: 70 }, (_, i) => ({
    id: `note-${i}`, activityType: 'note_added', actorEmail: `person${i}@example.test`, createdAt: '2026-11-05T10:00:00Z',
    note: `NOTE_${i}_START ${'Detailed note text. '.repeat(20)}\nSecond paragraph. NOTE_${i}_END`,
  })) };
  const records = completeReportNoteRecords(row);
  assert.equal(records.length, 71);
  const plan = completeReportPagePlans(doc, [row])[0];
  assert.ok(plan.pages.length > 2);
  assert.ok(plan.pages[0].length <= 9);
  assert.ok(plan.pages.slice(1).every((page) => page.length <= 46));
  const text = plan.pages.flat().map((line) => line.text).join(' ');
  for (let i = 0; i < 70; i++) {
    assert.ok(text.includes(`NOTE_${i}_START`)); assert.ok(text.includes(`NOTE_${i}_END`));
    assert.ok(text.includes(`person${i}@example.test`));
  }
  const token = 'a'.repeat(1500);
  const lines = wrapReportText(doc, token, 500);
  assert.equal(lines.join(''), token);
  assert.ok(lines.every((line) => doc.widthOfString(line) <= 500));
  doc.end();
});
test('manual resolution cannot bypass approval; unchanged resolved state and reopening remain available', () => {
  assert.equal(requiresCompletionApproval('active', 'resolved'), true);
  assert.equal(requiresCompletionApproval('pending_review', 'resolved'), true);
  assert.equal(requiresCompletionApproval('resolved', 'resolved'), false);
  assert.equal(requiresCompletionApproval('resolved', 'active'), false);
});
