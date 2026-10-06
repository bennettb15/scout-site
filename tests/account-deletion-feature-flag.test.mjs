import assert from "node:assert/strict";
import test from "node:test";
import { deletionEnabledFor } from "../api/account-deletion.js";

test("only the disposable pilot email can request deletion before global launch", () => {
  const oldGlobal = process.env.ACCOUNT_DELETION_ENABLED;
  const oldPilot = process.env.ACCOUNT_DELETION_PILOT_EMAILS;
  try {
    delete process.env.ACCOUNT_DELETION_ENABLED;
    process.env.ACCOUNT_DELETION_PILOT_EMAILS = "Pilot@example.test";
    assert.equal(deletionEnabledFor("pilot@example.test"), true);
    assert.equal(deletionEnabledFor("other@example.test"), false);
    process.env.ACCOUNT_DELETION_ENABLED = "true";
    assert.equal(deletionEnabledFor("other@example.test"), true);
  } finally {
    if (oldGlobal === undefined) delete process.env.ACCOUNT_DELETION_ENABLED;
    else process.env.ACCOUNT_DELETION_ENABLED = oldGlobal;
    if (oldPilot === undefined) delete process.env.ACCOUNT_DELETION_PILOT_EMAILS;
    else process.env.ACCOUNT_DELETION_PILOT_EMAILS = oldPilot;
  }
});
