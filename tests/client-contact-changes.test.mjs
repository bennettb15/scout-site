import assert from "node:assert/strict";
import test from "node:test";
import {
  changedClientProperties,
  contactDraftForProperty,
  formatClientPhone,
  saveClientContactChanges,
  saveClientNameChange,
} from "../src/lib/clientContactChanges.js";

const properties = [
  { id: "one", propertyName: "First", clientName: "Alice", clientEmail: "one@example.com", clientPhone: "6145555555", revision: 2, canEdit: true },
  { id: "two", propertyName: "Second", clientName: "Beth", clientEmail: "two@example.com", clientPhone: "7405550000", revision: 3, canEdit: true },
  { id: "three", propertyName: "Read only", clientName: "Chris", clientEmail: "three@example.com", clientPhone: "", revision: 1, canEdit: false },
];

test("standard US phone numbers display in the requested format without creating unsaved changes", () => {
  assert.equal(formatClientPhone("6145555555"), "(614)555-5555");
  assert.equal(formatClientPhone("+1 614 555 5555"), "(614)555-5555");
  assert.equal(formatClientPhone("555-1234"), "555-1234");
  assert.equal(formatClientPhone("614-555-5555 ext"), "614-555-5555 ext");
  assert.equal(contactDraftForProperty(properties[0], {}).clientPhone, "(614)555-5555");
  assert.deepEqual(changedClientProperties(properties, { one: { clientEmail: "one@example.com", clientPhone: "(614)555-5555" } }), []);
  assert.deepEqual(changedClientProperties(properties, { one: { clientName: "Alicia" } }).map((property) => property.id), ["one"]);
});

test("one save action sends every edited property and keeps failures identifiable", async () => {
  const drafts = {
    one: { clientName: "Alicia", clientEmail: "new-one@example.com", clientPhone: "614 555 5555" },
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
  assert.equal(requests[0].clientName, "Alicia");
  assert.equal(requests[1].clientName, "Beth");
  assert.equal(requests[1].clientPhone, "(740)555-1234");
  assert.deepEqual(result.saved.map((property) => property.id), ["one"]);
  assert.deepEqual(result.failed.map((failure) => failure.property.id), ["two"]);
  assert.equal(result.failed[0].error, "Changed elsewhere.");
});

test("finishing a client-name edit saves that name with the property's current contact fields", async () => {
  let sent;
  const updated = { ...properties[0], clientName: "Alicia", revision: 3 };
  const saved = await saveClientNameChange({
    property: properties[0],
    clientName: " Alicia ",
    accessToken: "test-token",
    request: async (_url, options) => {
      sent = JSON.parse(options.body);
      return { ok: true, json: async () => ({ property: updated }) };
    },
  });
  assert.equal(sent.clientName, "Alicia");
  assert.equal(sent.clientEmail, "one@example.com");
  assert.equal(sent.clientPhone, "6145555555");
  assert.equal(saved.clientName, "Alicia");
});
