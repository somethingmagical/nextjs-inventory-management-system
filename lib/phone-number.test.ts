import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePhoneNumber,
  optionalPhoneNumberSchema,
  parseInternationalPhoneNumber,
  requiredPhoneNumberSchema,
} from "./phone-number";

test("parses international phone numbers and normalizes international access prefixes", () => {
  assert.equal(parseInternationalPhoneNumber("+64 21 123 4567")?.number, "+64211234567");
  assert.equal(parseInternationalPhoneNumber("0064 21 123 4567")?.number, "+64211234567");
});

test("normalizes a repeated calling code while preserving unparseable local values", () => {
  assert.equal(normalizePhoneNumber("+64 +64 21 123 4567"), "+64211234567");
  assert.equal(normalizePhoneNumber("123"), "123");
});

test("phone schemas reject an unparseable duplicated calling code", () => {
  assert.equal(requiredPhoneNumberSchema.safeParse("+64 +1").success, false);
  assert.equal(optionalPhoneNumberSchema.safeParse("+64 +1").success, false);
  assert.equal(optionalPhoneNumberSchema.safeParse("").success, true);
});
