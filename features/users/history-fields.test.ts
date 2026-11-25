import assert from "node:assert/strict";
import test from "node:test";
import {
  getChangedUserFields,
  getUserHistoryRetentionCutoff,
  type UserHistorySnapshot,
} from "./history-fields";

const original: UserHistorySnapshot = {
  firstName: "Alex",
  lastName: "Staff",
  email: "alex@example.test",
  phoneNumber: null,
  image: null,
  roleId: "role-user",
  role: "user",
};

test("user history reports changed field names without recording field values", () => {
  assert.deepEqual(
    getChangedUserFields(original, {
      ...original,
      email: "new@example.test",
      roleId: "role-manager",
      role: "manager",
    }, true),
    ["email", "role", "credentials"],
  );
});

test("user history retention cutoff is twelve months before the reference date", () => {
  assert.equal(
    getUserHistoryRetentionCutoff(new Date("2026-11-25T00:00:00.000Z")).toISOString(),
    "2025-11-25T00:00:00.000Z",
  );
});

test("user history retention cutoff clamps leap-day dates to the last day of the month", () => {
  assert.equal(
    getUserHistoryRetentionCutoff(new Date("2024-02-29T12:30:45.123Z")).toISOString(),
    "2023-02-28T12:30:45.123Z",
  );
});
