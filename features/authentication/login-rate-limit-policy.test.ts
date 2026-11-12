import assert from "node:assert/strict";
import test from "node:test";
import {
  createLoginAttemptKeys,
  getTrustedClientIp,
  loginAttemptLimits,
} from "./login-rate-limit-policy";

test("trusts forwarded client IPs only when explicitly enabled", () => {
  assert.equal(getTrustedClientIp("198.51.100.10", false), null);
  assert.equal(getTrustedClientIp("198.51.100.10", true), "198.51.100.10");
  assert.equal(getTrustedClientIp("invalid, 2001:db8::1", true), "2001:db8::1");
  assert.equal(getTrustedClientIp("invalid", true), null);
});

test("creates private account and network buckets with separate thresholds", () => {
  const keys = createLoginAttemptKeys(" Admin@Example.com ", "198.51.100.10", "test-secret");
  assert.equal(keys.length, 2);
  assert.equal(keys[0].limit, loginAttemptLimits.ip);
  assert.equal(keys[0].resetOnSuccess, false);
  assert.equal(keys[1].limit, loginAttemptLimits.emailAndIp);
  assert.equal(keys[1].resetOnSuccess, true);
  assert.ok(keys.every(({ key }) => /^[a-f0-9]{64}$/.test(key)));
  assert.ok(keys.every(({ key }) => !key.includes("admin")));
  assert.deepEqual(
    keys.map(({ key }) => key),
    createLoginAttemptKeys("admin@example.com", "198.51.100.10", "test-secret").map(({ key }) => key),
  );
});

test("uses a higher email-only threshold when no trusted client IP is available", () => {
  const keys = createLoginAttemptKeys("admin@example.com", null, "test-secret");
  assert.equal(keys.length, 1);
  assert.equal(keys[0].limit, loginAttemptLimits.emailWithoutIp);
});
