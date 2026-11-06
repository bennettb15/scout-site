import sharp from 'sharp';

const IMAGE_BUDGET_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_BYTES = 350 * 1024;
const ENCODING_ATTEMPTS = [
  [1200, 76],
  [1000, 68],
  [800, 60],
  [600, 48],
  [440, 38],
  [320, 30],
  [240, 25],
];

export function completeReportPhotoByteLimit(itemCount) {
  const photoSlots = Math.max(1, Math.ceil(itemCount) * 2 + 1);
  return Math.min(MAX_IMAGE_BYTES, Math.floor(IMAGE_BUDGET_BYTES / photoSlots));
}

export async function compactCompleteReportPhoto(input, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('Invalid complete report photo size limit.');
  }
  for (const [size, quality] of ENCODING_ATTEMPTS) {
    const output = await sharp(input)
      .rotate()
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality })
      .toBuffer();
    if (output.length <= maxBytes) return output;
  }
  throw new Error('A report photo could not be reduced enough for the PDF.');
}
