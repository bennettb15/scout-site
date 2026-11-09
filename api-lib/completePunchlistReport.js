const key = (value) => String(value || '').trim().toLowerCase();
export const reportStatusColor = (status) => key(status) === 'resolved' ? '#15803d' : key(status) === 'pending_review' ? '#ea580c' : '#dc2626';
const time = (value) => Date.parse(value || '') || 0;
const oldestFirst = (a, b) => time(a.captured_at || a.created_at) - time(b.captured_at || b.created_at) || key(a.id).localeCompare(key(b.id));
const newestActivityFirst = (a, b) => time(b.created_at) - time(a.created_at) || key(b.id).localeCompare(key(a.id));
export const isCompletionCapture = (shot) => {
  const kind = key(shot?.capture_kind || shot?.first_capture_kind);
  if (kind && !['reference', 'carried_forward'].includes(kind)) return kind === 'resolved_capture';
  return Boolean(shot?.is_resolved_in_session || ['pending_review', 'resolved'].includes(key(shot?.snapshot_issue_status || shot?.issue_status)));
};
const groupId = (row) => key(row.from_value || row.id);

export function requiresCompletionApproval(current, next) {
  return key(next) === 'resolved' && key(current) !== 'resolved';
}

export function selectCompleteReportSources({ status, issueId, observationId, shotId, orgId, propertyId, shots = [], activity = [] }) {
  const identities = new Set([key(issueId), key(observationId)].filter(Boolean));
  const scoped = shots.filter((shot) => key(shot.org_id) === key(orgId) && key(shot.property_id) === key(propertyId) &&
    (identities.has(key(shot.issue_id)) || (shotId && key(shot.id) === key(shotId))));
  const original = scoped.filter((shot) => !isCompletionCapture(shot)).sort(oldestFirst)[0] || null;
  const events = activity.filter((event) => key(event.org_id) === key(orgId) && key(event.property_id) === key(propertyId) &&
    (!observationId || key(event.observation_id) === key(observationId))).sort(newestActivityFirst);
  const reopened = events.find((event) => event.activity_type === 'completion_rejected' || (event.activity_type === 'status_changed' && key(event.to_value) === 'active'));
  const afterReopen = (event) => !reopened || time(event.created_at) > time(reopened.created_at);
  let submission = null;
  let captured = null;
  let approval = null;
  if (status === 'pending_review') {
    const reviewed = events.find((event) => ['completion_approved', 'completion_rejected'].includes(event.activity_type));
    const cutoff = Math.max(time(reopened?.created_at), time(reviewed?.created_at));
    submission = events.find((event) => event.activity_type === 'completion_submitted' && afterReopen(event) && time(event.created_at) > cutoff &&
      !events.some((review) => ['completion_approved', 'completion_rejected'].includes(review.activity_type) &&
        key(review.from_value) === groupId(event) && time(review.created_at) >= time(event.created_at))) || null;
    captured = scoped.filter((shot) => isCompletionCapture(shot) && time(shot.captured_at || shot.created_at) > cutoff).sort(oldestFirst).at(-1) || null;
    if (submission && (!captured || time(submission.created_at) >= time(captured.captured_at || captured.created_at))) captured = null;
    else if (captured) submission = null;
  } else if (status === 'resolved') {
    approval = events.find((event) => event.activity_type === 'completion_approved' && afterReopen(event)) || null;
    if (approval) {
      // Portal approvals bind to a submission group. App-capture approvals bind to a shot.
      const group = key(approval.from_value);
      if (group && group !== 'pending_review') {
        const groupPhotos = events.filter((event) => event.activity_type === 'completion_submitted' && groupId(event) === group &&
          afterReopen(event) && time(event.created_at) <= time(approval.created_at));
        submission = groupPhotos.find((event) => key(event.id) === group) || groupPhotos[0] || null;
      } else {
        captured = scoped.find((shot) => key(shot.id) === key(approval.shot_id) && isCompletionCapture(shot) &&
          time(shot.captured_at || shot.created_at) <= time(approval.created_at)) || null;
      }
    }
  }
  // A manually resolved issue can have a newer portal photo without a completion approval.
  // Keep it separate from approved completion evidence so the PDF can label it accurately.
  const latestObservation = status === 'resolved' && !approval
    ? scoped.find((shot) => key(shot.id) === key(shotId) && key(shot.id) !== key(original?.id)) || null
    : null;
  return { original, submission, captured, approval, latestObservation };
}

export function completeReportNoteRecords(row) {
  const records = [];
  const original = row.reportPair?.original;
  const current = row.reportPair?.current;
  if (current) {
    if (original?.reason) records.push({ label: 'Previous note', note: original.reason, createdAt: original.capturedAt, actorEmail: original.actorEmail || '' });
    const currentReason = String(current.reason || row.reason || row.title || '').trim();
    if (currentReason) records.push({ label: 'Current note', note: currentReason, createdAt: current.capturedAt || row.capturedAt, actorEmail: current.actorEmail || '' });
  } else {
    const reason = String(original?.reason || (!row.reportPair ? row.reason || row.title : '')).trim();
    if (reason) records.push({ label: 'Original note', note: reason, createdAt: original?.capturedAt || row.capturedAt, actorEmail: original?.actorEmail || '' });
    const followUp = row.reportPair?.completion;
    const followUpReason = String(followUp?.reason || '').trim();
    if (followUpReason) records.push({ label: 'Updated note', note: followUpReason, createdAt: followUp.capturedAt, actorEmail: followUp.actorEmail || '' });
    if (row.reason && reason && row.reason.trim() !== reason && row.reason.trim() !== followUpReason) records.push({ label: 'Latest observation note', note: row.reason, createdAt: row.capturedAt, actorEmail: '' });
  }
  if (row.dueDate) records.push({ label: 'Due date', note: String(row.dueDate), createdAt: null, actorEmail: '' });
  const seen = new Set();
  for (const event of [...(row.activity || [])].sort((a, b) => time(a.createdAt) - time(b.createdAt) || key(a.id).localeCompare(key(b.id)))) {
    if (!event.note?.trim() || (event.id && seen.has(event.id))) continue;
    if (event.id) seen.add(event.id);
    records.push({ label: ({ note_added: 'Note', completion_submitted: 'Completion submission', completion_approved: 'Approval note', completion_rejected: 'Review note' })[event.activityType] || 'Workflow note',
      note: event.note.trim(), createdAt: event.createdAt, actorEmail: event.actorEmail || '' });
  }
  return records.length ? records : [{ label: 'Notes', note: 'No notes recorded.', createdAt: null, actorEmail: '' }];
}

export function wrapReportText(doc, value, width, size = 10) {
  doc.font('Helvetica').fontSize(size);
  const lines = [];
  for (const paragraph of String(value || '').replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && doc.widthOfString(`${line} ${word}`) > width) { lines.push(line); line = ''; }
      while (doc.widthOfString(word) > width) {
        if (line) { lines.push(line); line = ''; }
        let length = 1;
        while (length < word.length && doc.widthOfString(word.slice(0, length + 1)) <= width) length++;
        lines.push(word.slice(0, length)); word = word.slice(length);
      }
      if (word) line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}
