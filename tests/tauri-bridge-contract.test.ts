import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createTauriDesktopApi,
  TAURI_DESKTOP_COMMANDS,
  TAURI_DESKTOP_EVENTS
} from "../src/renderer/src/tauri-bridge";

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
  uploadImprovementPlanSamples: "upload_improvement_plan_samples"
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
      }
    });

    const api = createTauriDesktopApi(async () => undefined, fakeListen());
    expect(Object.keys(api).sort()).toEqual([
      ...Object.keys(expectedCommandByMethod),
      "onAppBundleUpdateState",
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

    expect(calls.map((call) => call.command)).toEqual(Object.values(expectedCommandByMethod));
    expect(calls.find((call) => call.command === "set_mcp_enabled")?.args).toEqual({ enabled: true });
    expect(calls.find((call) => call.command === "set_update_preferences")?.args).toEqual({
      preferences: { autoCheck: false }
    });
    expect(calls.find((call) => call.command === "upload_improvement_plan_samples")?.args).toEqual({
      samples: [{ ok: true }]
    });
  });

  test("maps update listeners to stable Tauri event names", async () => {
    const events: string[] = [];
    const api = createTauriDesktopApi(async () => undefined, fakeListen(events));

    const disposeUpdate = api.onUpdateState(() => undefined);
    const disposeAppBundle = api.onAppBundleUpdateState(() => undefined);
    await Promise.resolve();

    expect(events).toEqual([
      TAURI_DESKTOP_EVENTS.shellUpdateState,
      TAURI_DESKTOP_EVENTS.appBundleUpdateState
    ]);

    disposeUpdate();
    disposeAppBundle();
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
