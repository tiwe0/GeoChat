import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createTauriDesktopApi,
  TAURI_DESKTOP_COMMANDS,
  TAURI_DESKTOP_EVENTS
} from "../src/shared/desktop/tauri-bridge";

const expectedCommandByMethod = {
  saveProviderCredential: "save_provider_credential",
  deleteProviderCredential: "delete_provider_credential",
  listProviderCredentialMetadata: "list_provider_credential_metadata",
  getRendererStorage: "get_renderer_storage",
  setRendererStorage: "set_renderer_storage",
  removeRendererStorage: "remove_renderer_storage",
  getRuntimeInfo: "get_runtime_info",
  markRendererReady: "mark_renderer_ready",
  getGraphicsPreferences: "get_graphics_preferences",
  setGraphicsPreferences: "set_graphics_preferences",
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
      credentials: {
        saveProviderCredential: "save_provider_credential",
        deleteProviderCredential: "delete_provider_credential",
        listProviderCredentialMetadata: "list_provider_credential_metadata",
      },
      runtime: {
        getRuntimeInfo: "get_runtime_info",
        markRendererReady: "mark_renderer_ready"
      },
      rendererStorage: {
        getRendererStorage: "get_renderer_storage",
        setRendererStorage: "set_renderer_storage",
        removeRendererStorage: "remove_renderer_storage"
      },
      graphics: {
        getGraphicsPreferences: "get_graphics_preferences",
        setGraphicsPreferences: "set_graphics_preferences"
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
      "getProviderCredentialStatus",
      "onBackendRuntimeState",
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
      if (command === "list_provider_credential_metadata") return [] as never;
      return (command === "get_runtime_info" ? {
        platform: "darwin",
        appVersion: "0.6.1",
        backendBaseUrl: "http://127.0.0.1:17365",
        backendAuth: { status: "authorized", token: "test-token" }
      } : undefined) as never;
    }, fakeListen());

    await api.saveProviderCredential({
      provider: "deepseek",
      protocol: "openai-compatible",
      baseUrl: "https://api.deepseek.com",
      secret: "test-secret"
    });
    await api.deleteProviderCredential("old-ref");
    await api.getProviderCredentialStatus("status-ref");
    await api.listProviderCredentialMetadata(["listed-ref"]);
    await api.getRendererStorage(["theme", "zoom"]);
    await api.setRendererStorage({ theme: "dark", zoom: 1.25 });
    await api.removeRendererStorage(["zoom"]);
    await api.getRuntimeInfo();
    await api.markRendererReady();
    await api.getGraphicsPreferences();
    await api.setGraphicsPreferences({ hardwareAcceleration: false });
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

    expect(calls.map((call) => call.command)).toEqual([
      "save_provider_credential",
      "delete_provider_credential",
      "list_provider_credential_metadata",
      "list_provider_credential_metadata",
      ...Object.values(expectedCommandByMethod).slice(3)
    ]);
    expect(calls.find((call) => call.command === "save_provider_credential")?.args).toEqual({
      request: {
        provider: "deepseek",
        protocol: "openai-compatible",
        baseUrl: "https://api.deepseek.com",
        secret: "test-secret"
      }
    });
    expect(calls.find((call) => call.command === "delete_provider_credential")?.args).toEqual({
      credentialRef: "old-ref"
    });
    expect(calls.filter((call) => call.command === "list_provider_credential_metadata").map((call) => call.args)).toEqual([
      { request: { credentialRefs: ["status-ref"] } },
      { request: { credentialRefs: ["listed-ref"] } }
    ]);
    expect(calls.find((call) => call.command === "set_renderer_storage")?.args).toEqual({
      values: { theme: "dark", zoom: 1.25 }
    });
    expect(calls.find((call) => call.command === "get_renderer_storage")?.args).toEqual({
      keys: ["theme", "zoom"]
    });
    expect(calls.find((call) => call.command === "remove_renderer_storage")?.args).toEqual({
      keys: ["zoom"]
    });
    expect(calls.find((call) => call.command === "set_mcp_enabled")?.args).toEqual({ enabled: true });
    expect(calls.find((call) => call.command === "set_graphics_preferences")?.args).toEqual({
      preferences: { hardwareAcceleration: false }
    });
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

  test("decodes authorized and unauthorized runtime authentication states", async () => {
    const authorized = createTauriDesktopApi(async () => ({
      platform: "darwin",
      appVersion: "0.6.1",
      backendBaseUrl: "http://127.0.0.1:17365",
      backendAuth: { status: "authorized", token: "test-token" }
    }) as never, fakeListen());
    await expect(authorized.getRuntimeInfo()).resolves.toMatchObject({
      backendAuth: { status: "authorized", token: "test-token" }
    });

    const unauthorized = createTauriDesktopApi(async () => ({
      platform: "darwin",
      appVersion: "0.6.1",
      backendBaseUrl: "http://127.0.0.1:17365",
      backendAuth: { status: "unauthorized" }
    }) as never, fakeListen());
    await expect(unauthorized.getRuntimeInfo()).resolves.toMatchObject({
      backendAuth: { status: "unauthorized" }
    });

    const invalid = createTauriDesktopApi(async () => ({
      platform: "darwin",
      appVersion: "0.6.1",
      backendBaseUrl: "http://127.0.0.1:17365"
    }) as never, fakeListen());
    await expect(invalid.getRuntimeInfo()).rejects.toThrow();
  });

  test("exposes metadata-only credential status without a secret read method", async () => {
    const api = createTauriDesktopApi(async (command) => command === "list_provider_credential_metadata"
      ? [{
          credentialRef: "configured-ref",
          provider: "deepseek",
          protocol: "openai-compatible",
          canonicalBaseUrl: "https://api.deepseek.com"
        }]
      : undefined as never, fakeListen());

    await expect(api.getProviderCredentialStatus("configured-ref")).resolves.toMatchObject({
      credentialRef: "configured-ref",
      configured: true,
      metadata: { credentialRef: "configured-ref" }
    });
    expect(Object.keys(api)).not.toContain("resolveProviderCredential");
    expect(Object.keys(api)).not.toContain("readProviderCredential");
    expect(Object.keys(api)).not.toContain("getProviderCredentialSecret");
  });

  test("maps update listeners to stable Tauri event names", async () => {
    const events: string[] = [];
    const api = createTauriDesktopApi(async () => undefined, fakeListen(events));

    const disposeBackend = await api.onBackendRuntimeState(() => undefined);
    const disposeUpdate = api.onUpdateState(() => undefined);
    const disposeAppBundle = api.onAppBundleUpdateState(() => undefined);
    const disposeProblemBank = api.onProblemBankCacheState(() => undefined);
    const disposeProblemBankDownload = api.onProblemBankDownloadState(() => undefined);
    await Promise.resolve();

    expect(events).toEqual([
      TAURI_DESKTOP_EVENTS.backendRuntimeState,
      TAURI_DESKTOP_EVENTS.shellUpdateState,
      TAURI_DESKTOP_EVENTS.appBundleUpdateState,
      TAURI_DESKTOP_EVENTS.problemBankCacheState,
      TAURI_DESKTOP_EVENTS.problemBankDownloadState
    ]);

    disposeBackend();
    disposeUpdate();
    disposeAppBundle();
    disposeProblemBank();
    disposeProblemBankDownload();
  });

  test("validates backend runtime event payloads before exposing them", async () => {
    let listener: ((event: { payload: unknown }) => void) | undefined;
    const api = createTauriDesktopApi(
      async () => undefined,
      (async (_event: string, callback: (event: { payload: unknown }) => void) => {
        listener = callback;
        return () => undefined;
      }) as never,
    );
    const observed: unknown[] = [];
    await api.onBackendRuntimeState((state) => observed.push(state));

    listener?.({
      payload: {
        mode: "external",
        state: "unreachable",
        baseUrl: "http://127.0.0.1:17365",
        error: "health check failed",
      },
    });
    expect(observed).toEqual([{
      mode: "external",
      state: "unreachable",
      baseUrl: "http://127.0.0.1:17365",
      error: "health check failed",
    }]);
    expect(() => listener?.({ payload: { mode: "external", state: "unknown" } })).toThrow();
  });

  test("Tauri command names remain backed by Rust command functions", () => {
    const rustSources = readRustSources("src-tauri/src");
    for (const command of Object.values(expectedCommandByMethod)) {
      expect(rustSources).toContain(`fn ${command}`);
    }
  });

  test("grants every registered application command through the Tauri ACL", () => {
    const mainSource = readFileSync("src-tauri/src/main.rs", "utf8");
    const buildSource = readFileSync("src-tauri/build.rs", "utf8");
    const permissionSource = readFileSync("src-tauri/permissions/desktop-app.toml", "utf8");
    const defaultCapability = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8")) as {
      permissions: string[];
    };
    const devCapability = JSON.parse(readFileSync("src-tauri/capabilities/dev-server.json", "utf8")) as {
      permissions: string[];
    };

    const registeredCommands = extractRustIdentifiers(
      mainSource.match(/generate_handler!\[([\s\S]*?)\]/)?.[1] ?? ""
    );
    const manifestedCommands = extractQuotedValues(
      buildSource.match(/const APP_COMMANDS:.*?=\s*&\[([\s\S]*?)\];/)?.[1] ?? ""
    );
    const allowedPermissions = extractQuotedValues(
      permissionSource.match(/permissions\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? ""
    );

    expect(manifestedCommands.sort()).toEqual(registeredCommands.sort());
    expect(allowedPermissions.sort()).toEqual(
      registeredCommands.map((command) => `allow-${command.replaceAll("_", "-")}`).sort()
    );
    expect(defaultCapability.permissions).toContain("desktop-app");
    expect(devCapability.permissions).toContain("desktop-app");
  });
});

function extractRustIdentifiers(source: string): string[] {
  return source
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[a-z][a-z0-9_]*$/.test(value));
}

function extractQuotedValues(source: string): string[] {
  return Array.from(source.matchAll(/"([a-z0-9_-]+)"/g), (match) => match[1]);
}

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
