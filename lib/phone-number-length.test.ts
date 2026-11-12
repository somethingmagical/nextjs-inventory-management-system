import assert from "node:assert/strict";
import test from "node:test";
import { getMaxNationalPhoneInputLength } from "./phone-number-length";

test("phone input limit uses the longest national format for each country", () => {
  assert.equal(getMaxNationalPhoneInputLength("US"), 11);
  assert.equal(getMaxNationalPhoneInputLength("NZ"), 11);
  assert.equal(getMaxNationalPhoneInputLength("GB"), 11);
  assert.equal(getMaxNationalPhoneInputLength("IN"), 14);
});

test("phone input limit is unavailable for unsupported country codes", () => {
  assert.equal(getMaxNationalPhoneInputLength("ZZ"), undefined);
});
