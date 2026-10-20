import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { issuePhotoFitRect } from "../api/punch-list.js";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const photoSlot = { x: 12, y: 98, width: 430, height: 236 };

function jpegWithExifOrientation(jpeg, orientation) {
  assert.equal(jpeg.readUInt16BE(0), 0xffd8);
  const exif = Buffer.from([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
    orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  return Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
}

test("punch-list PDF fits landscape, portrait, and EXIF-rotated photos without distortion", () => {
  const doc = new PDFDocument({ autoFirstPage: false });
  const landscape = fs.readFileSync(path.join(publicDir, "field-walkthrough-hero.jpg"));
  const portrait = fs.readFileSync(path.join(publicDir, "scout-app-camera.jpg"));

  for (const [photo, expectedLandscape] of [
    [landscape, true],
    [portrait, false],
    [jpegWithExifOrientation(landscape, 6), false],
    [jpegWithExifOrientation(landscape, 8), false],
  ]) {
    const image = doc.openImage(photo);
    const displayedWidth = image.orientation >= 5 && image.orientation <= 8 ? image.height : image.width;
    const displayedHeight = image.orientation >= 5 && image.orientation <= 8 ? image.width : image.height;
    const rect = issuePhotoFitRect(
      doc,
      photo,
      photoSlot.x,
      photoSlot.y,
      photoSlot.width,
      photoSlot.height
    );

    assert.equal(rect.hasImage, true);
    assert.equal(rect.isLandscape, expectedLandscape);
    assert.ok(rect.x >= photoSlot.x && rect.y >= photoSlot.y);
    assert.ok(rect.x + rect.width <= photoSlot.x + photoSlot.width + 0.001);
    assert.ok(rect.y + rect.height <= photoSlot.y + photoSlot.height + 0.001);
    assert.ok(Math.abs(rect.width / rect.height - displayedWidth / displayedHeight) < 0.001);
  }
});
