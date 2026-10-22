import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageCustomerLifecycle,
  lifecycleExpiry,
  lifecycleStatus,
  pilotEndFromSignature,
} from "../api-lib/customerLifecycle.js";
import { visiblePortalPeopleForActor } from "../api-lib/portalAdminAccess.js";

test("only the two Scout owner logins can manage private customer dates", () => {
  assert.equal(canManageCustomerLifecycle("BRIAN@SCOUTCLEAR.COM"), true);
  assert.equal(canManageCustomerLifecycle("bennettb15@gmail.com"), true);
  assert.equal(canManageCustomerLifecycle("customer.owner@example.com"), false);
  assert.equal(canManageCustomerLifecycle("customer.manager@example.com"), false);
});

test("customer owners and managers do not receive platform admin email rows", () => {
  const rows = [
    { email: "brian@scoutclear.com", role: "owner" },
    { email: "bennettb15@gmail.com", role: "owner" },
    { email: "customer.owner@example.com", role: "owner" },
  ];
  assert.deepEqual(visiblePortalPeopleForActor(rows, false), [rows[2]]);
  assert.deepEqual(visiblePortalPeopleForActor(rows, true), rows);
});

test("pilot cutoff is 30 days after the signature timestamp", () => {
  assert.equal(
    pilotEndFromSignature("2026-10-19T14:35:00.000Z"),
    "2026-11-18T14:35:00.000Z"
  );
});

test("ongoing term takes over only when it starts", () => {
  const lifecycle = {
    pilot_expires_at: "2026-11-18T14:35:00.000Z",
    ongoing_started_at: "2026-11-01T12:00:00.000Z",
    ongoing_expires_at: "2027-11-01T12:00:00.000Z",
  };
  assert.equal(lifecycleExpiry(lifecycle, new Date("2026-10-20T12:00:00.000Z")), lifecycle.pilot_expires_at);
  assert.equal(lifecycleExpiry(lifecycle, new Date("2026-11-01T12:00:00.000Z")), lifecycle.ongoing_expires_at);
});

test("open-ended monthly access survives the pilot cutoff until a cancellation end is set", () => {
  const lifecycle = {
    pilot_expires_at: "2026-11-18T14:35:00.000Z",
    ongoing_started_at: "2026-11-01T12:00:00.000Z",
    ongoing_expires_at: null,
  };
  assert.equal(lifecycleExpiry(lifecycle, new Date("2026-10-20T12:00:00.000Z")), lifecycle.pilot_expires_at);
  assert.equal(lifecycleExpiry(lifecycle, new Date("2026-11-19T12:00:00.000Z")), null);
  assert.equal(lifecycleStatus(lifecycle, new Date("2026-11-19T12:00:00.000Z")), "ongoing");

  const canceled = { ...lifecycle, ongoing_expires_at: "2026-12-01T12:00:00.000Z" };
  assert.equal(lifecycleStatus(canceled, new Date("2026-11-30T12:00:00.000Z")), "ongoing");
  assert.equal(lifecycleStatus(canceled, new Date("2026-12-01T12:00:00.000Z")), "expired");
  assert.equal(lifecycleStatus({ ...canceled, access_ended_at: "2026-12-01T12:05:00.000Z" }, new Date("2026-12-02T12:00:00.000Z")), "access-ended");
});

test("a new term preserves the prior access-ended record and gets a new cutoff", () => {
  const lifecycle = {
    pilot_expires_at: "2026-11-18T14:35:00.000Z",
    access_ended_at: "2026-11-18T15:00:00.000Z",
    ongoing_started_at: "2026-11-18T14:35:00.000Z",
    ongoing_expires_at: "2027-11-18T14:35:00.000Z",
  };
  assert.equal(lifecycleStatus(lifecycle, new Date("2026-12-01T00:00:00.000Z")), "ongoing");
  assert.equal(lifecycleStatus(lifecycle, new Date("2027-11-19T00:00:00.000Z")), "expired");
});
