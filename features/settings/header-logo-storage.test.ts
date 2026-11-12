import assert from "node:assert/strict";
import test from "node:test";
import { getHeaderLogoEntry, getHeaderLogoFormat } from "./header-logo-storage";

test("header logo uploads must be files within the size limit", () => {
  assert.equal(getHeaderLogoEntry(null).status, "invalid");
  assert.equal(getHeaderLogoEntry(new File([], "empty.png")).status, "valid");
  assert.equal(
    getHeaderLogoEntry(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png")).status,
    "invalid",
  );
});

test("recognizes PNG, JPEG, and WebP headers and rejects other formats", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  png.set([0x49, 0x48, 0x44, 0x52], 12);
  png[19] = 32;
  png[23] = 32;
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const webp = new Uint8Array(12);
  webp.set(new TextEncoder().encode("RIFF"));
  webp.set(new TextEncoder().encode("WEBP"), 8);

  assert.deepEqual(getHeaderLogoFormat(png), { extension: "png", mimeType: "image/png" });
  assert.deepEqual(getHeaderLogoFormat(jpeg), { extension: "jpg", mimeType: "image/jpeg" });
  assert.deepEqual(getHeaderLogoFormat(webp), { extension: "webp", mimeType: "image/webp" });
  assert.equal(getHeaderLogoFormat(new TextEncoder().encode("<svg />")), null);
});
