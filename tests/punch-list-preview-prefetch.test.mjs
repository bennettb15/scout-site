import assert from "node:assert/strict";
import test from "node:test";
import { prefetchPhotoPreviewUrls } from "../api/punch-list.js";

test("Punch List prepares previews concurrently with a bounded number of requests", async () => {
  const shots = Array.from({ length: 12 }, (_, index) => ({
    id: `shot-${index}`,
    session_id: "session-1",
    storage_bucket: "scoutcapture-originals",
    storage_path: `sessions/session-1/shots/shot-${index}/photo.jpg`,
  }));
  let active = 0;
  let peak = 0;
  const service = {
    storage: {
      from(bucket) {
        assert.equal(bucket, "scoutcapture-originals");
        return {
          async createSignedUrl(path) {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active -= 1;
            return { data: { signedUrl: `https://example.test/${path}` } };
          },
        };
      },
    },
  };

  const results = await Promise.all(
    Array.from(prefetchPhotoPreviewUrls(service, shots), async ([id, promise]) => [id, await promise])
  );
  assert.equal(results.length, shots.length);
  assert.ok(peak > 1);
  assert.ok(peak <= 8);
  for (const [id, result] of results) {
    assert.match(result.value, new RegExp(`/shots/${id}/photo\\.jpg$`));
  }
});
