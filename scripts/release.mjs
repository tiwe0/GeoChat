#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const VERSION_FILES = [
  "package.json",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json"
];
const COMMIT_FILES = [...VERSION_FILES, "src-tauri/Cargo.lock", "website/src/site.ts"];

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const version = normalizeVersion(options.version);
if (!version) fail("Usage: bun run release -- --version X.Y.Z [options]");

const tag = `v${version}`;
const current = readVersions();
console.log(`Current versions: ${current.join(", ")}`);
console.log(`Target version:   ${version}`);

if (version === current[0]) {
  fail(`Target version ${version} is already current; choose a new release version.`);
}

if (options.push && !options.tag) {
  fail("--push requires --tag so a GitHub Release can be triggered explicitly.");
}

if (options.commit || options.tag || options.push) {
  assertVersionFilesUntouched();
}

if (options.tag || options.push) {
  assertReleaseWorktreeIsSafe();
  assertOnMaster();
  assertTagAvailable(tag);
}

if (options.dryRun) {
  console.log("Dry run: no files, commits, tags, or remotes will be changed.");
  if (!options.skipChecks) runChecks(true);
  if (options.commit) console.log(`Would commit: chore(release): ${tag}`);
  if (options.tag) console.log(`Would create annotated tag: ${tag}`);
  if (options.push) console.log(`Would push master and ${tag} to origin.`);
  process.exit(0);
}

writeVersionFiles(version);
run("node", ["website/scripts/sync-version.mjs"]);

if (!options.skipChecks) runChecks(false);

if (options.commit) {
  run("git", [
    "commit",
    "--only",
    ...COMMIT_FILES,
    "-m",
    `chore(release): ${tag}`
  ]);
}

if (options.tag) {
  assertReleaseWorktreeIsSafe();
  run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);
}

if (options.push) {
  const releaseSha = gitOutput(["rev-parse", "HEAD"]);
  run("git", ["push", "origin", "HEAD:master"]);
  run("git", ["push", "origin", tag]);
  console.log(`Release trigger pushed: ${tag}`);
  if (options.watch) watchAndVerifyRelease({ releaseSha, tag, version });
} else {
  console.log("Release files prepared locally. Use --commit --tag --push to trigger GitHub Actions.");
}

function parseArgs(argv) {
  const result = {
    commit: false,
    dryRun: false,
    help: false,
    push: false,
    skipChecks: false,
    tag: false,
    watch: true,
    version: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.version = argv[++index];
    } else if (arg === "--commit") {
      result.commit = true;
    } else if (arg === "--tag") {
      result.tag = true;
    } else if (arg === "--push") {
      result.push = true;
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--skip-checks") {
      result.skipChecks = true;
    } else if (arg === "--no-watch") {
      result.watch = false;
    } else {
      fail(`Unknown option: ${arg}. Use --help for usage.`);
    }
  }

  return result;
}

function normalizeVersion(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^v/, "");
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(normalized)
    ? normalized
    : null;
}

function readVersions() {
  const packageVersion = JSON.parse(readFile("package.json")).version;
  const cargoVersion = readFile("src-tauri/Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const lockVersion = readFile("src-tauri/Cargo.lock").match(
    /\[\[package\]\]\nname = "geochat-desktop-tauri"\nversion = "([^"]+)"/
  )?.[1];
  const tauriVersion = JSON.parse(readFile("src-tauri/tauri.conf.json")).version;

  if (!cargoVersion || !lockVersion || !packageVersion || !tauriVersion) {
    fail("Could not read all desktop version declarations.");
  }

  if (new Set([packageVersion, cargoVersion, lockVersion, tauriVersion]).size !== 1) {
    fail(`Desktop version files disagree: ${packageVersion}, ${cargoVersion}, ${lockVersion}, ${tauriVersion}.`);
  }

  return [packageVersion, cargoVersion, lockVersion, tauriVersion];
}

function writeVersionFiles(nextVersion) {
  const packagePath = resolve(ROOT, "package.json");
  const packageUpdated = replaceOnce(
    readFile("package.json"),
    /("version"\s*:\s*")([^"]+)(")/,
    `$1${nextVersion}$3`,
    "package.json"
  );
  writeFileSync(packagePath, packageUpdated, "utf8");

  const cargoPath = resolve(ROOT, "src-tauri/Cargo.toml");
  const cargoUpdated = replaceOnce(
    readFile("src-tauri/Cargo.toml"),
    /(^version\s*=\s*")([^"]+)(")/m,
    `$1${nextVersion}$3`,
    "src-tauri/Cargo.toml"
  );
  writeFileSync(cargoPath, cargoUpdated, "utf8");

  const lockPath = resolve(ROOT, "src-tauri/Cargo.lock");
  const lockUpdated = replaceOnce(
    readFile("src-tauri/Cargo.lock"),
    /(\[\[package\]\]\nname = "geochat-desktop-tauri"\nversion = ")([^"]+)(")/,
    `$1${nextVersion}$3`,
    "src-tauri/Cargo.lock"
  );
  writeFileSync(lockPath, lockUpdated, "utf8");

  const tauriPath = resolve(ROOT, "src-tauri/tauri.conf.json");
  const tauriUpdated = replaceOnce(
    readFile("src-tauri/tauri.conf.json"),
    /("version"\s*:\s*")([^"]+)(")/,
    `$1${nextVersion}$3`,
    "src-tauri/tauri.conf.json"
  );
  writeFileSync(tauriPath, tauriUpdated, "utf8");

  console.log(`Updated desktop version files to ${nextVersion}.`);
}

function replaceOnce(source, pattern, replacement, file) {
  if (!source.match(pattern)) fail(`Could not find a version declaration in ${file}.`);
  return source.replace(pattern, replacement);
}

function assertVersionFilesUntouched() {
  const result = spawnSync("git", ["diff", "--quiet", "HEAD", "--", ...COMMIT_FILES], {
    cwd: ROOT,
    stdio: "ignore"
  });
  if (result.status !== 0) {
    fail("One or more release version files already have local changes. Commit or revert them first.");
  }
}

function assertReleaseWorktreeIsSafe() {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (result.status !== 0) fail(result.stderr || "Could not inspect Git status.");
  if (result.stdout.trim()) {
    fail("--tag/--push requires a clean worktree. Commit unrelated changes before tagging.");
  }
}

function assertOnMaster() {
  const branch = gitOutput(["branch", "--show-current"]);
  if (branch !== "master") fail(`Release tags must be created from master (currently on ${branch || "detached HEAD"}).`);
}

function assertTagAvailable(tagName) {
  const local = spawnSync("git", ["rev-parse", "--verify", `refs/tags/${tagName}`], {
    cwd: ROOT,
    stdio: "ignore"
  });
  if (local.status === 0) fail(`Tag ${tagName} already exists locally.`);

  const remote = spawnSync("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tagName}`], {
    cwd: ROOT,
    stdio: "ignore"
  });
  if (remote.status === 0) fail(`Tag ${tagName} already exists on origin.`);
  if (remote.status !== 2) fail(`Could not verify whether ${tagName} exists on origin.`);
}

function runChecks(dryRun) {
  const commands = [
    ["bun", ["run", "typecheck"]],
    ["bun", ["run", "tauri:prepare"]],
    ["bun", ["run", "tauri:check"]],
    ["bun", ["test", "tests"]]
  ];

  if (dryRun) {
    for (const [command, commandArgs] of commands) console.log(`Would run: ${command} ${commandArgs.join(" ")}`);
    return;
  }

  for (const [command, commandArgs] of commands) run(command, commandArgs);
}

function run(command, commandArgs) {
  console.log(`\n$ ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function watchAndVerifyRelease({ releaseSha, tag, version }) {
  ensureGh();
  const repo = githubRepoSlug(gitOutput(["config", "--get", "remote.origin.url"]));
  console.log("\nWatching GitHub Actions for the release pipeline...");

  const packageRun = waitForRun("tauri-package.yml", releaseSha, repo, 120);
  if (!packageRun) fail(`Could not find the tauri-package run for ${releaseSha}.`);
  watchRun(packageRun, repo);
  verifyGithubRelease(tag, repo);
  verifyR2Manifest(tag, version);

  const websiteRun = waitForRun("website.yml", releaseSha, repo, 90);
  if (!websiteRun) fail(`Could not find the website workflow run for ${releaseSha}.`);
  watchRun(websiteRun, repo);
  console.log("Cloudflare Pages deployment completed via website.yml.");
  verifyWebsite(version);
}

function ensureGh() {
  const result = spawnSync("gh", ["auth", "status"], { cwd: ROOT, stdio: "ignore" });
  if (result.status !== 0) fail("--push requires an authenticated GitHub CLI (`gh auth login`).");
}

function githubRepoSlug(remoteUrl) {
  const match = remoteUrl.trim().match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (!match) fail(`Origin is not a GitHub repository: ${remoteUrl}`);
  return match[1];
}

function waitForRun(workflow, headSha, repo, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const output = capture("gh", [
      "run",
      "list",
      "--repo",
      repo,
      "--workflow",
      workflow,
      "--limit",
      "20",
      "--json",
      "databaseId,headSha"
    ], { allowFailure: true });
    if (output) {
      try {
        const runs = JSON.parse(output);
        const match = runs.find((run) => run.headSha === headSha);
        if (match?.databaseId) return String(match.databaseId);
      } catch {
        // The Actions API can briefly return an incomplete response just after a push.
      }
    }
    sleep(5);
  }
  return null;
}

function watchRun(runId, repo) {
  run("gh", ["run", "watch", runId, "--repo", repo, "--exit-status"]);
}

function verifyGithubRelease(tag, repo) {
  const output = capture("gh", [
    "release",
    "view",
    tag,
    "--repo",
    repo,
    "--json",
    "isDraft,assets,url"
  ]);
  const release = JSON.parse(output);
  if (release.isDraft) fail(`GitHub Release ${tag} is still a draft.`);
  const names = (release.assets ?? []).map((asset) => asset.name ?? "");
  const installers = names.filter((name) => /\.(dmg|exe|msi)$/i.test(name));
  if (installers.length === 0) fail(`GitHub Release ${tag} has no installer assets.`);
  console.log(`GitHub Release ready: ${release.url} (${installers.length} installer assets)`);
}

function verifyR2Manifest(tag, version) {
  const base = process.env.GEOCHAT_DOWNLOADS_BASE_URL ?? process.env.DOWNLOADS_BASE_URL ?? process.env.VITE_DOWNLOADS_BASE;
  if (!base) {
    console.log("Notice: R2 manifest verification skipped; set GEOCHAT_DOWNLOADS_BASE_URL to verify it after Actions.");
    return;
  }

  const url = `${trimTrailingSlash(base)}/latest.json`;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const payload = tryFetchJson(url);
    if (payload?.version === version && payload?.tag === tag) {
      const installers = Array.isArray(payload.assets)
        ? payload.assets.filter((asset) => /\.(dmg|exe|msi)$/i.test(asset?.name ?? ""))
        : [];
      if (installers.length > 0) {
        console.log(`R2 manifest ready: ${tag} (${installers.length} installer assets)`);
        return;
      }
    }
    console.log("Waiting for R2 latest.json to propagate...");
    sleep(10);
  }
  fail(`R2 latest.json is not synchronized with ${tag}: ${url}`);
}

function verifyWebsite(version) {
  const siteUrl = process.env.GEOCHAT_SITE_URL ?? process.env.SITE_URL;
  if (!siteUrl) {
    console.log("Notice: website verification skipped; set GEOCHAT_SITE_URL to verify the published download page.");
    return;
  }

  const base = trimTrailingSlash(siteUrl);
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const home = tryFetchText(`${base}/`);
    const download = tryFetchText(`${base}/download`);
    if (
      home?.includes("/download") &&
      download &&
      (download.includes(version) || deployedScriptsIncludeVersion(`${base}/download`, download, version))
    ) {
      console.log(`Website download link synchronized: ${base}/download (${version})`);
      return;
    }
    console.log("Waiting for the website deployment to propagate...");
    sleep(10);
  }
  fail(`Published website does not yet expose version ${version}.`);
}

function deployedScriptsIncludeVersion(pageUrl, html, version) {
  const scriptSources = Array.from(
    html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
    (match) => match[1]
  );
  return scriptSources.some((source) => {
    const scriptUrl = new URL(source, pageUrl).toString();
    return tryFetchText(scriptUrl)?.includes(version);
  });
}

function tryFetchJson(url) {
  const output = tryFetchText(url);
  if (!output) return null;
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function tryFetchText(url) {
  const output = capture("curl", ["-fsSL", "--retry", "3", "--connect-timeout", "5", "--max-time", "30", url], {
    allowFailure: true
  });
  return output;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function sleep(seconds) {
  spawnSync(process.execPath, ["-e", `setTimeout(() => {}, ${seconds * 1000})`], {
    cwd: ROOT,
    stdio: "ignore"
  });
}

function capture(command, commandArgs, { allowFailure = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    if (allowFailure) return "";
    fail(result.stderr?.trim() || `${command} ${commandArgs.join(" ")} failed.`);
  }
  return result.stdout.trim();
}

function gitOutput(commandArgs) {
  const result = spawnSync("git", commandArgs, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) fail(result.stderr || `git ${commandArgs.join(" ")} failed.`);
  return result.stdout.trim();
}

function readFile(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage: bun run release -- --version X.Y.Z [options]

Prepare and optionally publish a desktop release.

Options:
  --version, -v X.Y.Z  Target semantic version (leading v is accepted)
  --commit             Create chore(release): vX.Y.Z using only version files
  --tag                Create annotated tag vX.Y.Z from a clean master worktree
  --push               Push master and the tag (requires --tag)
  --no-watch            Do not wait for Actions or verify release outputs after pushing
  --dry-run            Show actions without changing files, Git, or remotes
  --skip-checks        Skip oss/typecheck/tauri-check/test validation
  --help, -h           Show this help

Examples:
  bun run release -- --version 0.4.1
  bun run release -- --version 0.4.1 --commit --tag
  bun run release -- --version 0.4.1 --commit --tag --push`);
}
