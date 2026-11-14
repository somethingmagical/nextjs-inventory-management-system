import assert from "node:assert/strict";
import test from "node:test";
import { compareCallingCodes, compareGeographyNames, comparePostalCodes } from "./sorting";

test("sorts geographic names alphabetically without case sensitivity", () => {
  assert.deepEqual(
    ["New Lynn", "auckland", "Auckland Airport"].sort(compareGeographyNames),
    ["auckland", "Auckland Airport", "New Lynn"],
  );
});

test("sorts postal codes naturally by number, retaining alphanumeric codes", () => {
  assert.deepEqual(
    ["10", "2", "1A", "1"].sort(comparePostalCodes),
    ["1", "1A", "2", "10"],
  );
});

test("sorts phone calling codes numerically", () => {
  assert.deepEqual(["64", "1", "44", "7"].sort(compareCallingCodes), ["1", "7", "44", "64"]);
});
