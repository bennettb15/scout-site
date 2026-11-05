export function restoredComparisonSelection(versions, request) {
  const before = versions.find((v) => v.id === request?.beforePackageId && v.sessionType === 'full_documentation');
  const after = versions.find((v) => v.id === request?.afterPackageId);
  if (before && after) return { beforeId: before.id, afterId: after.id, customEnd: after.id !== versions[0]?.id };
  return { beforeId: versions.find((v, i) => i > 0 && v.sessionType === 'full_documentation')?.id || '', afterId: versions[0]?.id || '', customEnd: false };
}

export function matchingComparisonRequest(request, beforeId, afterId, now = Date.now()) {
  return request && request.beforePackageId === beforeId && request.afterPackageId === afterId &&
    Date.parse(request.expiresAt) > now ? request : null;
}

export function comparisonProgressMessage(request, delayed = false) {
  if (request?.status === 'queued') return delayed ? 'Report startup is delayed; retrying automatically.' : 'Starting the report worker…';
  return ({ validating: 'Checking the selected report versions…', preparing_photos: 'Loading and preparing the documented photos…',
    rendering: 'Creating the side-by-side comparison PDF…', uploading: 'Finishing your PDF download…' })[request?.progressStep] || 'Loading the selected photos and generating your comparison PDF…';
}
