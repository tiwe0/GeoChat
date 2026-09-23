import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createTauriDesktopApi,
  TAURI_DESKTOP_COMMANDS,
  TAURI_DESKTOP_EVENTS
} from "../src/shared/desktop/tauri-bridge";

const expectedCommandByMethod = {
  getRuntimeInfo: "get_runtime_info",
  markRendererReady: "mark_renderer_ready",
  getMcpStatus: "get_mcp_status",
  setMcpEnabled: "set_mcp_enabled",
  getAccessState: "get_access_state",
  checkAccess: "check_access",
  getUpdateState: "get_update_state",
  checkForUpdates: "check_for_updates",
  checkAllUpdates: "check_all_updates",
  downloadUpdate: "download_update",
  setUpdatePreferences: "set_update_preferences",
  installUpdate: "install_update",
  getAppBundleUpdateState: "get_app_bundle_update_state",
  checkAppBundleUpdate: "check_app_bundle_update",
  installAppBundleUpdate: "install_app_bundle_update",
  rollbackAppBundleUpdate: "rollback_app_bundle_update",
  getImprovementPlanPreferences: "get_improvement_plan_preferences",
  setImprovementPlanPreferences: "set_improvement_plan_preferences",
  uploadImprovementPlanSamples: "upload_improvement_plan_samples",
  getLoggingPreferences: "get_logging_preferences",
  setLoggingPreferences: "set_logging_preferences",
  openLogDirectory: "open_log_directory",
  writeAppLog: "write_app_log",
  getProblemBankCacheState: "get_problem_bank_cache_state",
  getProblemBankCatalog: "get_problem_bank_catalog",
  checkProblemBankUpdate: "check_problem_bank_update",
  syncProblemBankMetadata: "sync_problem_bank_metadata",
  openProblemBankCacheDirectory: "open_problem_bank_cache_directory",
  clearProblemBankCache: "clear_problem_bank_cache",
  getProblemBankDownloadStates: "get_problem_bank_download_states",
  downloadProblemBank: "download_problem_bank",
  loadProblemBankPage: "load_problem_bank_page",
  loadProblemDetail: "load_problem_detail"
} as const;

describe("Tauri desktop bridge contract", () => {
  test("groups command names by capability without changing public API keys", () => {
    expect(TAURI_DESKTOP_COMMANDS).toEqual({
      runtime: {
        getRuntimeInfo: "get_runtime_info",
        markRendererReady: "mark_renderer_ready"
      },
      mcp: {
        getMcpStatus: "get_mcp_status",
        setMcpEnabled: "set_mcp_enabled"
      },
      access: {
        getAccessState: "get_access_state",
        checkAccess: "check_access"
      },
      shellUpdate: {
        getUpdateState: "get_update_state",
        checkForUpdates: "check_for_updates",
        checkAllUpdates: "check_all_updates",
        downloadUpdate: "download_update",
        setUpdatePreferences: "set_update_preferences",
        installUpdate: "install_update"
      },
      appBundleUpdate: {
        getAppBundleUpdateState: "get_app_bundle_update_state",
        checkAppBundleUpdate: "check_app_bundle_update",
        installAppBundleUpdate: "install_app_bundle_update",
        rollbackAppBundleUpdate: "rollback_app_bundle_update"
      },
      improvement: {
        getImprovementPlanPreferences: "get_improvement_plan_preferences",
        setImprovementPlanPreferences: "set_improvement_plan_preferences",
        uploadImprovementPlanSamples: "upload_improvement_plan_samples"
      },
      logging: {
        getLoggingPreferences: "get_logging_preferences",
        setLoggingPreferences: "set_logging_preferences",
        openLogDirectory: "open_log_directory",
        writeAppLog: "write_app_log"
      },
      problemBank: {
        getProblemBankCacheState: "get_problem_bank_cache_state",
        getProblemBankCatalog: "get_problem_bank_catalog",
        checkProblemBankUpdate: "check_problem_bank_update",
        syncProblemBankMetadata: "sync_problem_bank_metadata",
        openProblemBankCacheDirectory: "open_problem_bank_cache_directory",
        clearProblemBankCache: "clear_problem_bank_cache",
        getProblemBankDownloadStates: "get_problem_bank_download_states",
        downloadProblemBank: "download_problem_bank",
        loadProblemBankPage: "load_problem_bank_page",
        loadProblemDetail: "load_problem_detail"
      }
    });

    const api = createTauriDesktopApi(async () => undefined, fakeListen());
    expect(Object.keys(api).sort()).toEqual([
      ...Object.keys(expectedCommandByMethod),
      "onAppBundleUpdateState",
      "onProblemBankCacheState",
      "onProblemBankDownloadState",
      "onUpdateState"
    ].sort());
  });

  test("maps each TypeScript bridge method to the intended Tauri command", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const api = createTauriDesktopApi(async (command, args) => {
      calls.push({ command, args });
      return undefined;
    }, fakeListen());

    await api.getRuntimeInfo();
    await api.markRendererReady();
    await api.getMcpStatus();
    await api.setMcpEnabled(true);
    await api.getAccessState();
    await api.checkAccess();
    await api.getUpdateState();
    await api.checkForUpdates();
    await api.checkAllUpdates();
    await api.downloadUpdate();
    await api.setUpdatePreferences({ autoCheck: false });
    await api.installUpdate();
    await api.getAppBundleUpdateState();
    await api.checkAppBundleUpdate();
    await api.installAppBundleUpdate();
    await api.rollbackAppBundleUpdate();
    await api.getImprovementPlanPreferences();
    await api.setImprovementPlanPreferences({ enabled: false });
    await api.uploadImprovementPlanSamples([{ ok: true }]);
    await api.getLoggingPreferences();
    await api.setLoggingPreferences({ enabled: true, level: "debug" });
    await api.openLogDirectory();
    await api.writeAppLog("warn", "Renderer warning");
    await api.getProblemBankCacheState();
    await api.getProblemBankCatalog();
    await api.checkProblemBankUpdate();
    await api.syncProblemBankMetadata();
    await api.openProblemBankCacheDirectory();
    await api.clearProblemBankCache();
    await api.getProblemBankDownloadStates();
    await api.downloadProblemBank("gaokao");
    await api.loadProblemBankPage("gaokao", "2");
    await api.loadProblemDetail("gaokao", "problem-1");

    expect(calls.map((call) => call.command)).toEqual(Object.values(expectedCommandByMethod));
    expect(calls.find((call) => call.command === "set_mcp_enabled")?.args).toEqual({ enabled: true });
    expect(calls.find((call) => call.command === "set_update_preferences")?.args).toEqual({
      preferences: { autoCheck: false }
    });
    expect(calls.find((call) => call.command === "upload_improvement_plan_samples")?.args).toEqual({
      samples: [{ ok: true }]
    });
    expect(calls.find((call) => call.command === "set_logging_preferences")?.args).toEqual({
      preferences: { enabled: true, level: "debug" }
    });
    expect(calls.find((call) => call.command === "write_app_log")?.args).toEqual({
      level: "warn",
      message: "Renderer warning"
    });
    expect(calls.find((call) => call.command === "download_problem_bank")?.args).toEqual({
      bankSlug: "gaokao"
    });
    expect(calls.find((call) => call.command === "load_problem_bank_page")?.args).toEqual({
      bankSlug: "gaokao",
      cursor: "2"
    });
    expect(calls.find((call) => call.command === "load_problem_detail")?.args).toEqual({
      bankSlug: "gaokao",
      problemId: "problem-1"
    });
  });

  test("maps update listeners to stable Tauri event names", async () => {
    const events: string[] = [];
    const api = createTauriDesktopApi(async () => undefined, fakeListen(events));

    const disposeUpdate = api.onUpdateState(() => undefined);
    const disposeAppBundle = api.onAppBundleUpdateState(() => undefined);
    const disposeProblemBank = api.onProblemBankCacheState(() => undefined);
    const disposeProblemBankDownload = api.onProblemBankDownloadState(() => undefined);
    await Promise.resolve();

    expect(events).toEqual([
      TAURI_DESKTOP_EVENTS.shellUpdateState,
      TAURI_DESKTOP_EVENTS.appBundleUpdateState,
      TAURI_DESKTOP_EVENTS.problemBankCacheState,
      TAURI_DESKTOP_EVENTS.problemBankDownloadState
    ]);

    disposeUpdate();
    disposeAppBundle();
    disposeProblemBank();
    disposeProblemBankDownload();
  });

  test("Tauri command names remain backed by Rust command functions", () => {
    const rustSources = readRustSources("src-tauri/src");
    for (const command of Object.values(expectedCommandByMethod)) {
      expect(rustSources).toContain(`fn ${command}`);
    }
  });
});

function readRustSources(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return readRustSources(path);
      if (entry.isFile() && entry.name.endsWith(".rs")) return readFileSync(path, "utf8");
      return [];
    })
    .join("\n");
}

function fakeListen(events: string[] = []) {
  return (async (event: string) => {
    events.push(event);
    return () => undefined;
  }) as never;
}
