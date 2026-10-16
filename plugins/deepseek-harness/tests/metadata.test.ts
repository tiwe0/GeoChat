import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8"));

test("uses a nested Biome configuration compatible with repository quality checks", async () => {
  const configuration = JSON.parse(await readFile(new URL("biome.json", packageRoot), "utf8"));
  assert.equal(configuration.root, false);
});

test("declares native Harness and npm discovery metadata without custom marketplace fields", () => {
  assert.equal(manifest.dsh.manifestVersion, 1);
  assert.equal(manifest.engines.dsh, "0.2.0-rc.2");
  assert.equal(manifest.author.name, "tiwe0");
  assert.equal(manifest.author.url, "https://github.com/tiwe0");
  assert.equal(manifest.repository.url, "git+https://github.com/tiwe0/GeoChat.git");
  assert.equal(manifest.repository.directory, "plugins/deepseek-harness");
  assert.equal(manifest.bugs.url, "https://github.com/tiwe0/GeoChat/issues");
  assert.ok(manifest.keywords.includes("dsh-plugin"));
  assert.ok(manifest.keywords.includes("geogebra"));
  assert.deepEqual(Object.keys(manifest.dsh).sort(), ["bundle", "client", "manifestVersion"]);
});

test("exports readable English and Chinese metadata and a packaged product icon", async () => {
  for (const locale of ["en", "zh"]) {
    const resource = import.meta.resolve(`dsh-geochat-plugin/locale/${locale}.json`);
    assert.equal(resource, new URL(`locale/${locale}.json`, packageRoot).href);
    const { meta } = JSON.parse(await readFile(fileURLToPath(resource), "utf8"));
    assert.match(meta.title, /GeoChat/);
    assert.ok(meta.description.trim().length > 30);
    if (locale === "en") assert.equal(meta.description, manifest.description);
  }
  assert.equal(manifest.icon, "dist/icon.png");
  const icon = new URL(manifest.icon, packageRoot);
  assert.ok((await stat(icon)).size <= 256 * 1024);
  const bytes = await readFile(icon);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(bytes, await readFile(new URL("../../src-tauri/icons/128x128.png", packageRoot)));
  assert.ok(manifest.files.includes("locale"));
});
