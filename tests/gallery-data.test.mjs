import test from 'node:test';
import assert from 'node:assert/strict';
import { uniquePropertySessions, filterGalleryPhotos, galleryDayKey, galleryPhotoStatus, allDatePhotosSelected, selectedGalleryPhotos, updateDatePhotoSelection, photoDateLabel } from '../src/lib/galleryData.js';
import { publicPhoto } from '../api/original-photos.js';

test('gallery keeps only the newest report package for a property session', () => {
  const rows = [
    { id: 'old', property: { id: 'barley' }, session: { id: 'visit-1', completedAt: '2026-11-01' }, completedAt: '2026-11-02', originalPhotoCount: 8 },
    { id: 'new', property: { id: 'barley' }, session: { id: 'visit-1', completedAt: '2026-11-01' }, completedAt: '2026-11-04', originalPhotoCount: 8 },
    { id: 'other', property: { id: 'other' }, session: { id: 'visit-2' }, completedAt: '2026-11-05', originalPhotoCount: 4 },
  ];
  assert.deepEqual(uniquePropertySessions(rows, 'barley').map((row) => row.id), ['new']);
});

test('gallery photo filters stay within the supplied session photos', () => {
  const photos = [
    { id: 'a', displayName: 'North wall', isFlagged: true, isResolved: false },
    { id: 'b', displayName: 'South wall', isFlagged: false, isResolved: true },
    { id: 'c', displayName: 'North entry', isFlagged: false, isResolved: false },
  ];
  assert.deepEqual(filterGalleryPhotos(photos, 'flagged', 'north').map((photo) => photo.id), ['a']);
  assert.deepEqual(filterGalleryPhotos(photos, 'resolved').map((photo) => photo.id), ['b']);
});


test('selected photos include multiple dates even when another filter is active', () => {
  const packages = [{ id: 'november' }, { id: 'october' }];
  const loaded = {
    november: { photos: [{ id: 'a' }] },
    october: { photos: [{ id: 'b' }] },
  };
  assert.deepEqual(selectedGalleryPhotos(packages, loaded, { november: ['a'], october: ['b'] }), [
    { packageId: 'november', photoId: 'a' },
    { packageId: 'october', photoId: 'b' },
  ]);
});


test('thumbnail date uses the requested short format in New York time', () => {
  assert.equal(photoDateLabel('2026-11-05T17:00:00Z'), '11-5-26');
  assert.equal(photoDateLabel('2026-11-05T01:00:00Z'), '11-4-26');
});

test('gallery status distinguishes flagged, pending review, and resolved photos', () => {
  assert.equal(galleryPhotoStatus({ isFlagged: true }), 'flagged');
  assert.equal(galleryPhotoStatus({ isFlagged: true, issueStatus: 'pending_review' }), 'pending');
  assert.deepEqual(filterGalleryPhotos([{ id: 'pending', isFlagged: true, issueStatus: 'pending_review' }], 'flagged').map((photo) => photo.id), ['pending']);
  assert.equal(galleryPhotoStatus({ isFlagged: true, isResolved: true }), 'resolved');
});

test('gallery tags use the latest review outcome while retaining the field capture history', () => {
  const capture = { id: 'photo', is_flagged: false, is_resolved_in_session: true, issue_status: 'pending_review' };
  const pending = publicPhoto({ ...capture, current_issue_status: 'active' });
  const approved = publicPhoto({ ...capture, current_issue_status: 'resolved', review_status: 'resolved' });
  const rejected = publicPhoto({ ...capture, current_issue_status: 'active', review_status: 'active' });
  assert.equal(galleryPhotoStatus(pending), 'pending');
  assert.equal(galleryPhotoStatus(approved), 'resolved');
  assert.equal(galleryPhotoStatus(rejected), 'flagged');
  assert.equal(rejected.isResolvedInSession, true);
});

test('selecting a date spans sessions and preserves selections from other dates', () => {
  const morning = { id: 'morning', session: { completedAt: '2026-11-05T13:00:00Z' } };
  const afternoon = { id: 'afternoon', session: { completedAt: '2026-11-05T20:00:00Z' } };
  const prior = { id: 'prior', session: { completedAt: '2026-11-04T13:00:00Z' } };
  assert.equal(galleryDayKey(morning), galleryDayKey(afternoon));
  assert.notEqual(galleryDayKey(morning), galleryDayKey(prior));
  const loaded = { morning: { photos: [{ id: 'a' }] }, afternoon: { photos: [{ id: 'b' }] } };
  const selected = updateDatePhotoSelection({ prior: ['p'] }, [['morning', loaded.morning.photos], ['afternoon', loaded.afternoon.photos]], true);
  assert.deepEqual(selected, { prior: ['p'], morning: ['a'], afternoon: ['b'] });
  assert.equal(allDatePhotosSelected([morning, afternoon], loaded, selected), true);
  assert.deepEqual(updateDatePhotoSelection(selected, [['morning', loaded.morning.photos], ['afternoon', loaded.afternoon.photos]], false), { prior: ['p'], morning: [], afternoon: [] });
});
