import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { buildPunchListPdf } from '../api/punch-list.js';
import { compactCompleteReportPhoto, completeReportPhotoByteLimit } from '../api-lib/completeReportPhoto.js';

test('twenty-four large photos produce a complete punchlist PDF below four MiB', async () => {
  const photos = await Promise.all(Array.from({ length: 24 }, () =>
    sharp(randomBytes(1200 * 900 * 3), { raw: { width: 1200, height: 900, channels: 3 } })
      .jpeg({ quality: 95 }).toBuffer()));
  assert.ok(photos.every((photo) => photo.length > 500 * 1024));
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: `item-${index}`,
    status: 'active',
    property: { name: 'Sample Property' },
    trade: 'general',
    priority: 'medium',
    reportPair: {
      original: { preview: { previewUrl: `https://photos.example/${index * 2}` } },
      completion: { preview: { previewUrl: `https://photos.example/${index * 2 + 1}` } },
    },
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(photos[Number(new URL(url).pathname.slice(1))], {
    headers: { 'content-type': 'image/jpeg' },
  });
  try {
    const pdf = await buildPunchListPdf(rows, [], null, true);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length < 4 * 1024 * 1024, `PDF was ${(pdf.length / 1024 / 1024).toFixed(1)} MB`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('photo compaction applies EXIF orientation before placing images in the PDF', async () => {
  const input = await sharp({ create: { width: 800, height: 1200, channels: 3, background: '#445566' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const output = await compactCompleteReportPhoto(input, completeReportPhotoByteLimit(10));
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 800);
  assert.equal(metadata.orientation, undefined);
});
