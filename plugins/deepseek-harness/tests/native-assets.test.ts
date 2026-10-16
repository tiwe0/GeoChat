import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readVerifiedAsset, resolveAssetRequest } from "../src/native-assets.ts";

const files = new Set(["deployggb.js", "HTML5/5.0/web3d/web3d.nocache.js"]);
test("static resources expose only packaged asset paths, not plugin APIs or host files", () => {
  assert.equal(resolveAssetRequest("/geochat-assets/deployggb.js", "GET", files).path, "deployggb.js");
  assert.equal(
    resolveAssetRequest("/geochat-assets/HTML5/5.0/web3d/web3d.nocache.js?cache=1", "HEAD", files).status,
    200
  );
  for (const url of [
    "/geochat-assets/../LICENSE",
    "/geochat-assets/%2e%2e/LICENSE",
    "/geochat-assets/%2fetc/passwd",
    "/geochat-assets/%5cetc",
    "/geochat-assets/%00",
    "/geochat-assets/%",
    "/geochat-assets/missing.js",
    "/else/deployggb.js"
  ]) {
    assert.notEqual(resolveAssetRequest(url, "GET", files).status, 200, url);
  }
  assert.equal(resolveAssetRequest("/geochat-assets/deployggb.js", "POST", files).status, 405);
});

test("static resources reject same-size corruption and return the verified bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "geochat-integrity-"));
  try {
    const path = join(directory, "runtime.js");
    const original = Buffer.from("const ok = true;");
    const expected = { size: original.length, sha256: createHash("sha256").update(original).digest("hex") };
    await writeFile(path, original);
    assert.deepEqual(await readVerifiedAsset(path, expected), original);
    await writeFile(path, Buffer.alloc(original.length, 32));
    await assert.rejects(readVerifiedAsset(path, expected), /integrity verification/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
