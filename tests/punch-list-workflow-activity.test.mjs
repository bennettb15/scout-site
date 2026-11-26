import assert from "node:assert/strict";
import test from "node:test";
import { shouldWriteWorkflowActivity } from "../api-lib/punchListWorkflow.js";

test("a visible Priority change records activity when the observation already has the target value", () => {
  assert.equal(shouldWriteWorkflowActivity({
    field: "priority", currentValue: "medium", nextValue: "medium", displayedFromValue: "low",
  }), true);
});

test("an unchanged control does not record duplicate activity", () => {
  assert.equal(shouldWriteWorkflowActivity({
    field: "priority", currentValue: "medium", nextValue: "medium", displayedFromValue: "medium",
  }), false);
  assert.equal(shouldWriteWorkflowActivity({
    field: "status", currentValue: "active", nextValue: "active", displayedFromValue: "resolved",
  }), false);
});

test("a visible Trade change also records activity", () => {
  assert.equal(shouldWriteWorkflowActivity({
    field: "trade", currentValue: "plumbing", nextValue: "plumbing", displayedFromValue: "windows",
  }), true);
});
