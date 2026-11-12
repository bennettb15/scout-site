export function selectReviewReadySource(sources, pendingRows, currentRequest = null) {
  if (currentRequest && ["queued", "generating"].includes(currentRequest.status)) {
    const source = sources?.find((candidate) => candidate.id === currentRequest.sourcePackageId);
    if (source) return { source, request: currentRequest };
  }
  const pendingSessionIds = new Set();
  const pendingSubmissionIds = new Set();
  const pendingShotIds = new Set();
  let hasUnscopedPending = false;
  let hasPendingWithoutSession = false;
  for (const row of pendingRows || []) {
    if (row.status !== "pending_review") continue;
    if (row.session?.id) pendingSessionIds.add(row.session.id);
    if (row.fieldResolutionActivityId) pendingSubmissionIds.add(row.fieldResolutionActivityId);
    if (row.shotId) pendingShotIds.add(row.shotId);
    if (!row.session?.id) hasPendingWithoutSession = true;
    if (!row.session?.id && !row.fieldResolutionActivityId && !row.shotId) hasUnscopedPending = true;
  }

  for (const source of sources || []) {
    const request = currentRequest?.sourcePackageId === source.id
      ? currentRequest
      : source.latestRequest || null;
    if (request?.status === "ready" && request.resultPackageId) continue;
    if (request && ["queued", "generating"].includes(request.status)) {
      return { source, request };
    }
    if (hasUnscopedPending) continue;
    if (source.pendingSubmissionIds?.length) {
      if (source.pendingSubmissionIds.some((id) => pendingSubmissionIds.has(id))) continue;
    } else if (source.legacyShotIds?.length) {
      if (source.legacyShotIds.some((id) => pendingShotIds.has(id))) continue;
    } else if (!source.sessionId || hasPendingWithoutSession || pendingSessionIds.has(source.sessionId)) continue;
    return { source, request };
  }
  return null;
}
