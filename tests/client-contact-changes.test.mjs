import assert from "node:assert/strict";
import test from "node:test";
import {
  changedClientProperties,
  contactDraftForProperty,
  formatClientPhone,
  saveClientContactChanges,
} from "../src/lib/clientContactChanges.js";

const properties = [
  { id: "one", propertyName: "First", clientEmail: "one@example.com", clientPhone: "6145555555", revision: 2, canEdit: true },
  { id: "two", propertyName: "Second", clientEmail: "two@example.com", clientPhone: "7405550000", revision: 3, canEdit: true },
  { id: "three", propertyName: "Read only", clientEmail: "three@example.com", clientPhone: "", revision: 1, canEdit: false },
];

test("standard US phone numbers display in the requested format without creating unsaved changes", () => {
  assert.equal(formatClientPhone("6145555555"), "(614)555-5555");
  assert.equal(formatClientPhone("+1 614 555 5555"), "(614)555-5555");
  assert.equal(formatClientPhone("555-1234"), "555-1234");
  assert.equal(formatClientPhone("614-555-5555 ext"), "614-555-5555 ext");
  assert.equal(contactDraftForProperty(properties[0], {}).clientPhone, "(614)555-5555");
  assert.deepEqual(changedClientProperties(properties, { one: { clientEmail: "one@example.com", clientPhone: "(614)555-5555" } }), []);
});

test("one save action sends every edited property and keeps failures identifiable", async () => {
  const drafts = {
    one: { clientEmail: "new-one@example.com", clientPhone: "614 555 5555" },
    two: { clientEmail: "two@example.com", clientPhone: "7405551234" },
    three: { clientEmail: "changed@example.com", clientPhone: "" },
  };
  const requests = [];
  const request = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (body.propertyId === "two") {
      return { ok: false, json: async () => ({ error: "Changed elsewhere." }) };
    }
    return { ok: true, json: async () => ({ property: { ...properties[0], ...body, revision: 3 } }) };
  };

  const result = await saveClientContactChanges({ properties, drafts, accessToken: "test-token", request });
  assert.deepEqual(requests.map((requestBody) => requestBody.propertyId), ["one", "two"]);
  assert.equal(requests[0].clientPhone, "(614)555-5555");
  assert.equal(requests[1].clientPhone, "(740)555-1234");
  assert.deepEqual(result.saved.map((property) => property.id), ["one"]);
  assert.deepEqual(result.failed.map((failure) => failure.property.id), ["two"]);
  assert.equal(result.failed[0].error, "Changed elsewhere.");
});
