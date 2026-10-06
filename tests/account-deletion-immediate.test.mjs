import assert from "node:assert/strict";
import test from "node:test";
import { scheduleImmediateAccountDeletion } from "../api/account-deletion.js";
import { processRequestedAccountDeletion } from "../api-lib/accountDeletionProcessor.js";

test("immediate deletion schedules only the authenticated user's request", async () => {
  const previous = process.env.ACCOUNT_DELETION_WORKER_ENABLED;
  process.env.ACCOUNT_DELETION_WORKER_ENABLED = "true";
  try {
    const scheduled = [];
    const calls = [];
    const service = {};
    const didSchedule = scheduleImmediateAccountDeletion(service, "request-4", "user-4", {
      schedule: (promise) => scheduled.push(promise),
      runWorker: async (client, claim) => calls.push({ client, claim }),
    });
    assert.equal(didSchedule, true);
    assert.equal(scheduled.length, 1);
    await scheduled[0];
    assert.deepEqual(calls, [{ client: service, claim: { requestId: "request-4", userId: "user-4" } }]);
  } finally {
    if (previous === undefined) delete process.env.ACCOUNT_DELETION_WORKER_ENABLED;
    else process.env.ACCOUNT_DELETION_WORKER_ENABLED = previous;
  }
});

test("immediate deletion leaves requests for the daily worker when disabled", () => {
  const previous = process.env.ACCOUNT_DELETION_WORKER_ENABLED;
  delete process.env.ACCOUNT_DELETION_WORKER_ENABLED;
  try {
    assert.equal(scheduleImmediateAccountDeletion({}, "request-4", "user-4", {
      schedule: () => assert.fail("must not schedule"),
    }), false);
  } finally {
    if (previous === undefined) delete process.env.ACCOUNT_DELETION_WORKER_ENABLED;
    else process.env.ACCOUNT_DELETION_WORKER_ENABLED = previous;
  }
});

test("immediate claim is scoped to both request and user and ignores completed work", async () => {
  const filters = [];
  const service = {
    from(table) {
      assert.equal(table, "account_deletion_requests");
      return {
        update(value) { assert.equal(value.status, "processing"); return this; },
        eq(column, value) { filters.push([column, value]); return this; },
        in(column, values) { filters.push([column, values]); return this; },
        select() { return this; },
        async maybeSingle() { return { data: null, error: null }; },
      };
    },
    rpc: () => assert.fail("must not claim another user's request"),
  };
  assert.deepEqual(await processRequestedAccountDeletion(service, {
    requestId: "request-4", userId: "user-4",
  }), { status: "already_processing_or_completed" });
  assert.deepEqual(filters, [
    ["id", "request-4"],
    ["user_id", "user-4"],
    ["status", ["pending", "failed"]],
  ]);
});
