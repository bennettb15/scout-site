import test from 'node:test';
import assert from 'node:assert/strict';
import { uniquePropertySessions, filterGalleryPhotos, selectedGalleryPhotos, photoDateLabel } from '../src/lib/galleryData.js';

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
  assert.deepEqual(filterGalleryPhotos(photos, 'priority', 'north').map((photo) => photo.id), ['a']);
  assert.deepEqual(filterGalleryPhotos(photos, 'standard', 'north').map((photo) => photo.id), ['c']);
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
