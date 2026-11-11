import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGallerySelection } from '../api/gallery-download.js';
import { buildZip } from '../api/original-photos-download.js';

const propertyId = '11111111-1111-4111-8111-111111111111';
const packageA = '22222222-2222-4222-8222-222222222222';
const packageB = '33333333-3333-4333-8333-333333333333';
const photoA = '44444444-4444-4444-8444-444444444444';
const photoB = '55555555-5555-4555-8555-555555555555';

test('selection accepts photos from separate report dates and removes repeats', () => {
  const result = normalizeGallerySelection({ propertyId, photos: [
    { packageId: packageA, photoId: photoA },
    { packageId: packageB, photoId: photoB },
    { packageId: packageA, photoId: photoA },
  ] });
  assert.deepEqual(result?.photos, [
    { packageId: packageA, photoId: photoA },
    { packageId: packageB, photoId: photoB },
  ]);
});

test('selection rejects missing or malformed property and photo IDs', () => {
  assert.equal(normalizeGallerySelection({ propertyId: 'all', photos: [{ packageId: packageA, photoId: photoA }] }), null);
  assert.equal(normalizeGallerySelection({ propertyId, photos: [{ packageId: packageA, photoId: 'bad' }] }), null);
  assert.equal(normalizeGallerySelection({ propertyId, photos: [] }), null);
});

test('ZIP builder includes selected dated filenames', () => {
  const zip = buildZip([{ filename: '2026-11-05 - North.jpg', data: Buffer.from('test') }]);
  assert.equal(zip.subarray(0, 4).toString('hex'), '504b0304');
  assert.ok(zip.includes(Buffer.from('2026-11-05 - North.jpg')));
});
