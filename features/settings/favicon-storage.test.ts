import assert from "node:assert/strict";
import test from "node:test";
import { getFaviconEntry, getFaviconFormat } from "./favicon-storage";

test("favicon uploads must be files within the size limit", () => {
  assert.equal(getFaviconEntry(null).status, "invalid");
  assert.equal(getFaviconEntry(new File([], "empty.ico")).status, "valid");
  assert.equal(
    getFaviconEntry(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.ico")).status,
    "invalid",
  );
});

test("recognizes complete PNG headers", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  png.set([0x49, 0x48, 0x44, 0x52], 12);
  png[19] = 32;
  png[23] = 32;

  assert.deepEqual(getFaviconFormat(png), { extension: "png", mimeType: "image/png" });
});

test("recognizes ICO headers and rejects unsupported or truncated files", () => {
  const ico = new Uint8Array(22);
  ico[2] = 1;
  ico[4] = 1;

  assert.deepEqual(getFaviconFormat(ico), { extension: "ico", mimeType: "image/x-icon" });
  assert.equal(getFaviconFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
  assert.equal(getFaviconFormat(new TextEncoder().encode("<svg />")), null);
});
