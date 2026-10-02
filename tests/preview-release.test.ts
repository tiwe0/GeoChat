import { describe, expect, test } from "bun:test";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseGithub, parseMirror } from "../website/src/lib/release";

const root = join(import.meta.dir, "..");

describe("preview publication boundaries", () => {
  test("clean-runner resources precede Rust compilation and immutable tags can be rebuilt", () => {
    const workflow = Bun.YAML.parse(readFileSync(join(root, ".github/workflows/tauri-package.yml"), "utf8")) as {
      on: { workflow_dispatch: { inputs: { release_tag: unknown } } };
      jobs: Record<string, { steps: Array<{ name: string; run?: string; uses?: string; with?: { ref?: string; components?: string } }>; if?: string }>;
    };
    const verify = workflow.jobs.verify.steps;
    for (const name of ["verify", "package"]) {
      const rust = workflow.jobs[name].steps.find((step) => step.name === "Set up Rust");
      expect(rust?.uses).toBe("dtolnay/rust-toolchain@1.96.0");
      if (name === "verify") expect(rust?.with?.components).toBe("rustfmt, clippy");
    }
    const prepareIndex = verify.findIndex((step) => step.run === "bun run tauri:prepare");
    const clippyIndex = verify.findIndex((step) => step.run?.startsWith("cargo clippy"));
    expect(prepareIndex).toBeGreaterThanOrEqual(0);
    expect(clippyIndex).toBeGreaterThanOrEqual(0);
    expect(prepareIndex).toBeLessThan(clippyIndex);
    expect(workflow.on.workflow_dispatch.inputs.release_tag).toBeDefined();
    for (const name of ["verify", "package", "release", "mirror"]) {
      const checkout = workflow.jobs[name].steps.find((step) => step.uses === "actions/checkout@v5");
      expect(checkout?.with?.ref).toBe("${{ inputs.release_tag && format('refs/tags/{0}', inputs.release_tag) || github.ref }}");
    }
    expect(workflow.jobs.release.if).toContain("startsWith(inputs.release_tag, 'v')");
    expect(workflow.jobs.mirror.if).toContain("startsWith(inputs.release_tag, 'v')");
    expect(workflow.jobs.release.if).toContain("github.event_name == 'push'");
    expect(workflow.jobs.mirror.if).toContain("github.event_name == 'push'");
  });

  test("preview parsers accept the exact release and reject stale or stable payloads", () => {
    const mirror = {
      tag: "v0.7.0-preview", version: "0.7.0-preview", prerelease: true,
      assets: [{ name: "GeoChat.dmg", url: "https://example.test/GeoChat.dmg", size: 42 }]
    };
    expect(parseMirror(mirror)?.version).toBe("0.7.0-preview");
    expect(parseMirror({ ...mirror, tag: "v0.6.1" })).toBeNull();
    expect(parseMirror({ ...mirror, version: "0.7.0" })).toBeNull();
    const github = {
      tag_name: "v0.7.0-preview", prerelease: true, draft: false,
      assets: [{ name: "GeoChat.dmg", browser_download_url: "https://example.test/GeoChat.dmg", size: 42 }]
    };
    expect(parseGithub(github)?.version).toBe("0.7.0-preview");
    expect(parseGithub({ ...github, tag_name: "v0.6.1" })).toBeNull();
    expect(parseGithub({ ...github, prerelease: false })).toBeNull();
    expect(parseGithub({ ...github, draft: true })).toBeNull();
  });

  test("tag workflow marks prereleases and keeps preview manifests out of stable latest", () => {
    const workflow = readFileSync(join(root, ".github/workflows/tauri-package.yml"), "utf8");
    expect(workflow).toContain('release_flags=(--prerelease --latest=false)');
    expect(workflow).not.toContain('--latest=true');
    expect(workflow).toContain('"${release_flags[@]}"');
    expect(workflow).toContain("manifest=preview.json");
    expect(workflow).toContain("manifest=latest.json");
    expect(workflow).toContain('release-assets/$MANIFEST_NAME');
    expect(workflow).toContain('$BUCKET/$PREFIX/$MANIFEST_NAME');
  });

  test("website requests and caches the exact featured preview without stale-channel fallbacks", () => {
    const site = readFileSync(join(root, "website/src/site.ts"), "utf8");
    const feed = readFileSync(join(root, "website/src/lib/release.ts"), "utf8");
    const page = readFileSync(join(root, "website/src/pages/Download.tsx"), "utf8");
    expect(site).toContain('PREVIEW_RELEASE_TAG: string | null = "v0.7.0-preview"');
    expect(site).toContain('`tags/${PREVIEW_RELEASE_TAG}`');
    expect(site).toContain('PREVIEW_RELEASE_TAG ? "preview.json" : "latest.json"');
    expect(feed).toContain('`geochat:release:${PREVIEW_RELEASE_TAG ?? "stable"}`');
    expect(feed).toContain('body.tag !== PREVIEW_RELEASE_TAG');
    expect(feed).toContain('tag !== PREVIEW_RELEASE_TAG');
    expect(feed).toContain('`${DOWNLOADS_BASE}/${DOWNLOAD_MANIFEST}`');
    expect(page).toContain('t.download.preview');
    expect(page).toContain('href={FEATURED_RELEASE_URL}');
  });

  test("installer manifest preserves preview tag paths and integrity metadata", () => {
    const directory = mkdtempSync(join(tmpdir(), "geochat-preview-manifest-"));
    try {
      writeFileSync(join(directory, "GeoChat_0.7.0.dmg"), "fixture installer");
      const output = join(directory, "preview.json");
      const result = Bun.spawnSync(["node", join(root, "scripts/build-r2-download-manifest.mjs"),
        "--assets", directory, "--tag", "v0.7.0-preview", "--base", "https://example.test/geochat", "--out", output]);
      expect(result.exitCode).toBe(0);
      const manifest = JSON.parse(readFileSync(output, "utf8"));
      expect(manifest.tag).toBe("v0.7.0-preview");
      expect(manifest.version).toBe("0.7.0-preview");
      expect(manifest.prerelease).toBe(true);
      expect(manifest.assets[0].url).toBe("https://example.test/geochat/v0.7.0-preview/GeoChat_0.7.0.dmg");
      expect(manifest.assets[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
