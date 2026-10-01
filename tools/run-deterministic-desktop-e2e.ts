import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { startDeterministicFakeProvider } from "./desktop-debug-e2e/fake-openai-provider";
import {
  assertRestoreEvidence,
  createTestProviderCleanupState,
  finalizeTestProviderProfile,
  redactDesktopE2eEvidenceText,
} from "./desktop-debug-e2e/evidence";

type ActionRecord = {
  id: string;
  status: "queued" | "claimed" | "succeeded" | "failed";
  result?: Record<string, unknown>;
  error?: string;
};

type ConversationRecord = {
  id: string;
  latest_run_id: string | null;
  latest_run_status: string | null;
  message_count: number;
};

type UiProbeSnapshot = {
  mode: "window" | "fusion";
  composer: null | { variant: string | null; text: string | null; focused: boolean; sendDisabled: boolean | null };
  messages: Array<{ role: string; text: string }>;
  liveRegions: Array<{ politeness: string | null; role: string | null; text: string }>;
  dialogs: Array<{ panel: string | null; ariaModal: string | null; ariaLabel: string | null; containsFocus: boolean }>;
  activeElement: Record<string, unknown> | null;
};

const timeoutMs = Number(process.env.GEOCHAT_DESKTOP_E2E_TIMEOUT_MS ?? "180000");
const evidencePath = resolve(process.env.GEOCHAT_DESKTOP_E2E_EVIDENCE ?? ".artifacts/desktop-debug-e2e.json");
const runtimeToken = `desktop-e2e-${crypto.randomUUID()}`;
const e2eNonce = crypto.randomUUID();
const userDataDir = mkdtempSync(resolve(tmpdir(), "geochat-desktop-e2e-"));
const backendPort = reserveLoopbackPort();
const mcpPort = reserveLoopbackPort();
const mcpEndpoint = `http://127.0.0.1:${mcpPort}/mcp`;
// GEOCHAT_DESKTOP_USER_DATA_DIR isolates the native app data and SQLite, but
// WKWebView localStorage is still keyed by the dev-server origin. Use the
// localhost alias so this deterministic run never inherits an operator's
// ordinary 127.0.0.1:1421 renderer storage (which may be at quota).
const isolatedDevUrl = "http://localhost:1421";
const fakeProvider = startDeterministicFakeProvider();
const deterministicPrompt = "Create the deterministic E2E point.";
let conversationId = "";
const processLogs: string[] = [];
let desktop: ChildProcess | null = null;
let nextRpcId = 1;
const testProviderCleanup = createTestProviderCleanupState();
let providerConfigurationAttempted = false;

async function main() {
  const startedAt = new Date().toISOString();
  let firstRun: Record<string, unknown> | null = null;
  let restart: Record<string, unknown> | null = null;
  let failure: unknown = null;
  try {
    desktop = startDesktop();
    await waitForMcp();
    await waitForDesktopReady(false);

    providerConfigurationAttempted = true;
    const configured = await queueAndWait("configure_deterministic_test_provider", {
      baseUrl: fakeProvider.baseUrl,
      model: fakeProvider.model,
      nonce: e2eNonce,
    });
    if (configured.result?.setupPending === true) {
      testProviderCleanup.markResult({
        attempted: true,
        completed: false,
        recoveryPending: true,
        operationId: configured.result.operationId ?? null,
        recoveryPath: userDataDir,
      });
      throw new Error("Provider configuration requires native credential journal recovery.");
    }
    const cleanupHandle = parseCleanupHandle(configured.result);
    testProviderCleanup.register(cleanupHandle);
    await waitForDesktopReady(true);
    await normalizeInitialUi();

    const prompt = deterministicPrompt;
    const filled = await probeUi("set_composer_text", { text: prompt });
    const filledSnapshot = uiSnapshotFromProbe(filled);
    if (filledSnapshot.composer?.text !== prompt || filledSnapshot.composer.focused !== true) {
      throw new Error(`The real composer textarea did not retain the entered prompt: ${JSON.stringify(filledSnapshot.composer)}`);
    }
    const submission = await probeUi("submit_composer");
    conversationId = await waitForUiConversationId();
    const terminal = await waitForConversationTerminal(conversationId);
    if (!fakeProvider.state.requests.some((request) => request.skillPolicyPresent)) {
      throw new Error("The provider did not receive the transient Agent Skill policy context.");
    }
    const submittedUi = await waitForUiSnapshot("submitted composer and rendered messages", (snapshot) => (
      snapshot.composer?.text === ""
      && snapshot.messages.some((message) => message.role === "user" && message.text === prompt)
      && snapshot.messages.some((message) => message.role === "assistant" && message.text.includes(fakeProvider.finalText))
    ));
    const canvas = await inspectPoint();
    const preservedDraft = "Draft preserved across window and Fusion modes.";
    await probeUi("set_composer_text", { text: preservedDraft });
    const windowUi = await waitForUiSnapshot("window draft", (snapshot) => snapshot.mode === "window" && snapshot.composer?.text === preservedDraft);
    const windowConversationId = probeConversationId(await probeUi("snapshot"));

    await probeUi("switch_mode", { target: "fusion" });
    const fusionUi = await waitForUiSnapshot("Fusion mode draft and live region", (snapshot) => (
      snapshot.mode === "fusion"
      && snapshot.composer?.variant === "fusion"
      && snapshot.composer.text === preservedDraft
      && snapshot.liveRegions.some((region) => region.politeness === "polite" && region.role === "status")
    ));
    const fusionConversationId = probeConversationId(await probeUi("snapshot"));
    if (fusionConversationId !== windowConversationId || fusionConversationId !== conversationId) {
      throw new Error(`Conversation identity changed while switching to Fusion: ${windowConversationId} -> ${fusionConversationId}`);
    }

    await probeUi("open_fusion_panel", { target: "transcript" });
    const transcriptUi = await waitForUiSnapshot("Fusion transcript dialog and messages", (snapshot) => (
      snapshot.dialogs.some((dialog) => dialog.panel === "transcript")
      && snapshot.messages.some((message) => message.role === "user" && message.text === prompt)
      && snapshot.messages.some((message) => message.role === "assistant" && message.text.includes(fakeProvider.finalText))
    ));
    await probeUi("open_fusion_panel", { target: "transcript" });
    await waitForUiSnapshot("closed Fusion transcript dialog", (snapshot) => snapshot.dialogs.every((dialog) => dialog.panel !== "transcript"));

    await probeUi("open_fusion_panel", { target: "settings" });
    const settingsUi = await waitForUiSnapshot("focused Fusion settings dialog", (snapshot) => (
      snapshot.dialogs.some((dialog) => dialog.panel === "settings" && dialog.ariaModal === "false" && dialog.containsFocus)
    ));
    const focusCycle = await probeUi("cycle_dialog_focus", { target: "settings" });
    const focusResult = probeResult(focusCycle) as { forwardWrapped?: boolean; backwardWrapped?: boolean; focusableCount?: number };
    if (focusResult.forwardWrapped !== true || focusResult.backwardWrapped !== true || (focusResult.focusableCount ?? 0) < 2) {
      throw new Error(`Fusion dialog focus did not explicitly loop at both boundaries: ${JSON.stringify(focusResult)}`);
    }
    await probeUi("open_fusion_panel", { target: "settings" });
    await waitForUiSnapshot("closed Fusion settings dialog", (snapshot) => snapshot.dialogs.every((dialog) => dialog.panel !== "settings"));

    await probeUi("switch_mode", { target: "window" });
    const returnedWindowUi = await waitForUiSnapshot("returned window state", (snapshot) => (
      snapshot.mode === "window"
      && snapshot.composer?.variant === "window"
      && snapshot.composer.text === preservedDraft
      && snapshot.messages.some((message) => message.role === "user" && message.text === prompt)
      && snapshot.messages.some((message) => message.role === "assistant" && message.text.includes(fakeProvider.finalText))
    ));
    const returnedConversationId = probeConversationId(await probeUi("snapshot"));
    if (returnedConversationId !== conversationId) {
      throw new Error(`Conversation identity changed after returning to window mode: ${returnedConversationId}`);
    }

    firstRun = {
      configured: sanitizeConfiguredAction(configured),
      submission,
      terminal,
      canvas,
      realUi: {
        filled: filledSnapshot,
        submitted: submittedUi,
        window: windowUi,
        fusion: fusionUi,
        transcript: transcriptUi,
        settings: settingsUi,
        focusCycle: focusResult,
        returnedWindow: returnedWindowUi,
        conversationIdPreserved: true,
        draftPreserved: true,
        reducedMotion: { verified: false, reason: "The deterministic runner does not control the host WebView prefers-reduced-motion media environment." },
      },
    };
    const conversation = await callTool<Record<string, unknown>>("get_conversation_debug_bundle", {
      conversationId,
      messageLimit: 50,
      includeFullContent: true,
    });
    assertConversationEvidence(terminal, conversation);
    firstRun = { ...firstRun, conversation };

    await stopDesktop(desktop);
    desktop = startDesktop();
    await waitForMcp();
    await waitForDesktopReady(true);

    const restored = await queueAndWait("restore_desktop_conversation", { conversationId });
    assertRestoreEvidence(restored.result, conversationId);
    const restoredUi = await waitForUiSnapshot("restored message DOM", (snapshot) => (
      snapshot.mode === "window"
      && snapshot.messages.some((message) => message.role === "user" && message.text === deterministicPrompt)
      && snapshot.messages.some((message) => message.role === "assistant" && message.text.includes(fakeProvider.finalText))
    ));
    const restoredCanvas = await inspectPoint();
    restart = { restored, ui: restoredUi, canvas: restoredCanvas };

    await cleanupTestProvider();

  } catch (error) {
    failure = error;
  } finally {
    if (testProviderCleanup.needsCleanup()) {
      await cleanupTestProvider().catch((error) => {
        testProviderCleanup.markResult({ attempted: true, completed: false, error: redactEvidence(error instanceof Error ? error.message : String(error)) });
      });
    }
    await stopDesktop(desktop);
    fakeProvider.stop();
    finalizeTestProviderProfile(userDataDir, providerConfigurationAttempted, testProviderCleanup);
  }
  const cleanup = testProviderCleanup.evidence();
  const ok = failure === null && cleanup.completed === true;
  const evidence = {
    ok,
    scope: "debug-only",
    packagedReleaseEvidence: false,
    startedAt,
    completedAt: new Date().toISOString(),
    conversationId,
    provider: { baseUrl: fakeProvider.baseUrl, model: fakeProvider.model, requests: fakeProvider.state.requests },
    cleanup,
    firstRun,
    restart,
    ...(failure ? { error: redactEvidence(failure instanceof Error ? failure.message : String(failure)), processLogs: processLogs.slice(-200).map(redactEvidence) } : {}),
  };
  writeEvidence(evidence);
  console.log(JSON.stringify(evidence, null, 2));
  if (failure) throw failure;
  if (!ok) throw new Error("Desktop E2E provider cleanup did not complete.");
}

function parseCleanupHandle(result: Record<string, unknown> | undefined) {
  const cleanup = result?.cleanup as Record<string, unknown> | undefined;
  if (cleanup?.nonce !== e2eNonce || typeof cleanup.credentialRef !== "string" || typeof cleanup.restoreConfigJson !== "string") {
    throw new Error("Provider configuration did not return an exact cleanup handle.");
  }
  return { nonce: e2eNonce, credentialRef: cleanup.credentialRef, restoreConfigJson: cleanup.restoreConfigJson };
}

function sanitizeConfiguredAction(action: ActionRecord) {
  const result = action.result ?? {};
  const { cleanup: _cleanup, credentialRef: _credentialRef, ...safeResult } = result;
  return { ...action, result: { ...safeResult, cleanupRegistered: true } };
}

async function cleanupTestProvider() {
  const handle = testProviderCleanup.current();
  if (!handle) return;
  if (!desktop || desktop.exitCode !== null) {
    await stopDesktop(desktop);
    desktop = startDesktop();
    await waitForMcp();
    await waitForDesktopReady(true);
  }
  const cleared = await queueAndWait("clear_deterministic_test_provider", handle, 15_000);
  const result = cleared.result ?? {};
  if (result.configRestored !== true || result.credentialDeleted !== true) {
    throw new Error(`Provider cleanup evidence was incomplete: ${JSON.stringify(result)}`);
  }
  testProviderCleanup.markResult({ attempted: true, completed: true, configRestored: true, credentialDeleted: true });
}

function redactEvidence(value: string) {
  return redactDesktopE2eEvidenceText(value, [runtimeToken]);
}

function startDesktop() {
  const child = spawn("bun", ["run", "tauri:dev:mcp"], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      GEOCHAT_DESKTOP_USER_DATA_DIR: userDataDir,
      GEOCHAT_DESKTOP_BACKEND_PORT: String(backendPort),
      GEOCHAT_DESKTOP_MCP_PORT: String(mcpPort),
      GEOCHAT_DEV_URL: isolatedDevUrl,
      GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN: runtimeToken,
      GEOCHAT_DESKTOP_MCP_AUTH_TOKEN: runtimeToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => appendProcessLog("stdout", chunk));
  child.stderr?.on("data", (chunk) => appendProcessLog("stderr", chunk));
  return child;
}

function appendProcessLog(stream: string, chunk: Buffer) {
  for (const line of chunk.toString("utf8").split(/\r?\n/).filter(Boolean)) {
    processLogs.push(`[${stream}] ${line}`);
    if (processLogs.length > 500) processLogs.shift();
  }
}

async function stopDesktop(child: ChildProcess | null) {
  const processGroupId = child?.pid;
  if (!processGroupId || !processGroupAlive(processGroupId)) return;
  try { process.kill(-processGroupId, "SIGTERM"); } catch { /* group already exited */ }
  if (await waitForProcessGroupExit(processGroupId, 5_000)) return;
  try { process.kill(-processGroupId, "SIGKILL"); } catch { /* group already exited */ }
  if (!await waitForProcessGroupExit(processGroupId, 5_000)) {
    throw new Error(`Desktop process group ${processGroupId} did not exit after SIGKILL.`);
  }
}

function processGroupAlive(processGroupId: number) {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessGroupExit(processGroupId: number, limit: number) {
  const started = Date.now();
  while (Date.now() - started < limit) {
    if (!processGroupAlive(processGroupId)) return true;
    await sleep(100);
  }
  return !processGroupAlive(processGroupId);
}

async function waitForMcp() {
  await waitUntil(async () => {
    const response = await fetch(`http://127.0.0.1:${mcpPort}/health`, {
      headers: { authorization: `Bearer ${runtimeToken}` },
    }).catch(() => null);
    return response?.ok === true;
  }, "desktop MCP health");
}

async function waitForDesktopReady(requireCredential: boolean) {
  let latestResult: Record<string, unknown> | null = null;
  let latestError: string | null = null;
  try {
    return await waitUntil(async () => {
      const action = await queueAndWait("get_desktop_ui_status", {}, 15_000).catch((error) => {
        latestError = error instanceof Error ? error.message : String(error);
        return null;
      });
    const result = action?.result;
    if (!result) return false;
    latestResult = result;
    const model = result.model as { hasCredential?: boolean } | undefined;
    const geogebra = result.geogebra as { ready?: boolean } | undefined;
    return geogebra?.ready === true
      && result.running === false
      && (!requireCredential || model?.hasCredential === true)
      ? result
      : false;
    }, "desktop renderer readiness");
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} Latest status=${JSON.stringify(latestResult)} latestError=${latestError ?? "none"}`);
  }
}

async function queueAndWait(name: string, args: Record<string, unknown>, actionTimeoutMs = timeoutMs) {
  const queued = await callTool<{ action: ActionRecord }>(name, args);
  if (!queued.action?.id) throw new Error(`${name} did not return a queued action.`);
  return waitUntil(async () => {
    const listed = await callTool<{ actions: ActionRecord[] }>("list_desktop_debug_actions", { limit: 100 });
    const action = listed.actions.find((candidate) => candidate.id === queued.action.id);
    if (action?.status === "failed") throw new Error(action.error ?? `${name} failed.`);
    return action?.status === "succeeded" ? action : false;
  }, `${name} action`, actionTimeoutMs);
}

async function probeUi(
  operation: "snapshot" | "set_composer_text" | "submit_composer" | "switch_mode" | "open_fusion_panel" | "close_fusion_panel" | "cycle_dialog_focus",
  args: { text?: string; target?: "window" | "fusion" | "history" | "settings" | "transcript" } = {},
) {
  return queueAndWait("probe_desktop_real_ui", { nonce: e2eNonce, operation, ...args }, 30_000);
}

function probeResult(action: ActionRecord) {
  const result = action.result?.result;
  if (!result || typeof result !== "object") {
    throw new Error(`Real UI probe returned no result: ${JSON.stringify(action.result)}`);
  }
  return result as Record<string, unknown>;
}

function probeConversationId(action: ActionRecord) {
  const value = action.result?.conversationId;
  if (typeof value !== "string") throw new Error(`Real UI probe returned no conversation identity: ${JSON.stringify(action.result)}`);
  return value;
}

function uiSnapshotFromProbe(action: ActionRecord) {
  const result = probeResult(action);
  const snapshot = action.result?.operation === "snapshot" ? result : result.snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error(`Real UI probe returned no snapshot: ${JSON.stringify(action.result)}`);
  }
  return snapshot as UiProbeSnapshot;
}

async function waitForUiSnapshot(label: string, predicate: (snapshot: UiProbeSnapshot) => boolean) {
  let latest: UiProbeSnapshot | null = null;
  try {
    return await waitUntil(async () => {
      const action = await probeUi("snapshot");
      const snapshot = uiSnapshotFromProbe(action);
      latest = snapshot;
      return predicate(snapshot) ? snapshot : false;
    }, `real WebView UI state: ${label}`, 45_000);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} Latest snapshot=${JSON.stringify(latest)}`);
  }
}

async function waitForUiConversationId() {
  return waitUntil(async () => {
    const action = await probeUi("snapshot");
    const value = action.result?.conversationId;
    return typeof value === "string" && value.length > 0 ? value : false;
  }, "real UI conversation identity", 30_000);
}

async function normalizeInitialUi() {
  let snapshot = uiSnapshotFromProbe(await probeUi("snapshot"));
  for (let attempt = 0; attempt < 3 && snapshot.dialogs.length > 0; attempt += 1) {
    const panel = snapshot.dialogs[0]?.panel;
    if (snapshot.mode === "fusion" && (panel === "history" || panel === "settings" || panel === "transcript")) {
      await probeUi("open_fusion_panel", { target: panel });
    } else {
      await probeUi("close_fusion_panel");
    }
    snapshot = await waitForUiSnapshot("initial dialogs closed", (candidate) => candidate.dialogs.length === 0);
  }
  if (snapshot.dialogs.length > 0) {
    throw new Error(`The isolated WebView retained an active dialog: ${JSON.stringify(snapshot.dialogs)}`);
  }
  if (snapshot.mode === "fusion") {
    await probeUi("switch_mode", { target: "window" });
    snapshot = await waitForUiSnapshot("initial window mode", (candidate) => candidate.mode === "window");
  }
  if (snapshot.composer?.variant !== "window") {
    throw new Error(`The real window composer was not available after UI normalization: ${JSON.stringify(snapshot.composer)}`);
  }
}

async function waitForConversationTerminal(id: string) {
  return waitUntil(async () => {
    const recent = await callTool<{ conversations: ConversationRecord[] }>("list_recent_conversations", { limit: 100 });
    const conversation = recent.conversations.find((candidate) => candidate.id === id);
    if (!conversation?.latest_run_status || conversation.latest_run_status === "running") return false;
    if (conversation.latest_run_status !== "succeeded") {
      throw new Error(`Conversation run ended with ${conversation.latest_run_status}.`);
    }
    return conversation;
  }, "agent run terminal state");
}

async function inspectPoint() {
  const exists = await queueAndWait("exists", { name: "A" });
  const type = await queueAndWait("getObjectType", { name: "A" });
  const value = await queueAndWait("getValueString", { name: "A" });
  if (exists.result?.result !== true && exists.result?.exists !== true) {
    throw new Error(`GeoGebra point A was not found: ${JSON.stringify(exists.result)}`);
  }
  const objectType = type.result?.objectType;
  if (objectType !== "point") throw new Error(`GeoGebra object A was not a point: ${JSON.stringify(type.result)}`);
  const valueString = value.result?.value;
  const coordinates = typeof valueString === "string"
    ? valueString.match(/^\s*(?:A\s*=\s*)?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/)
    : null;
  if (!coordinates || Number(coordinates[1]) !== 1 || Number(coordinates[2]) !== 2) {
    throw new Error(`GeoGebra point A did not retain exact coordinates (1,2): ${JSON.stringify(value.result)}`);
  }
  return { exists: exists.result, type: type.result, value: value.result, coordinates: [1, 2] };
}

function assertConversationEvidence(terminal: ConversationRecord, bundle: Record<string, unknown>) {
  if (terminal.message_count < 2) throw new Error("Backend conversation did not persist both sides of the exchange.");
  const messages = Array.isArray(bundle.messages) ? bundle.messages : [];
  if (messages.length < 2) throw new Error("Conversation debug bundle did not include persisted messages.");
  if (!JSON.stringify(messages).includes(fakeProvider.finalText)) {
    throw new Error("Persisted conversation did not include the deterministic final response.");
  }
  const user = messages.find((message) => message && typeof message === "object" && (message as { role?: unknown }).role === "user") as {
    content?: unknown;
    payload?: { parts?: unknown };
  } | undefined;
  const expectedParts = [{ type: "text", text: deterministicPrompt }];
  if (user?.content !== deterministicPrompt || !isDeepEqualJson(user.payload?.parts, expectedParts)) {
    throw new Error(`Persisted user message was not the exact submitted transcript: ${JSON.stringify(user)}`);
  }
  const runs = Array.isArray(bundle.runs) ? bundle.runs : [];
  const persistedRun = runs.find((run) => run && typeof run === "object") as {
    payload?: { prompt?: unknown };
  } | undefined;
  if (persistedRun?.payload?.prompt !== deterministicPrompt) {
    throw new Error(`Persisted run prompt was not the exact submitted transcript: ${JSON.stringify(persistedRun)}`);
  }
  const blackboard = Array.isArray(bundle.blackboard) ? bundle.blackboard : [];
  const originalProblem = blackboard.find((entry) => (
    entry && typeof entry === "object" && (entry as { key?: unknown }).key === "original_problem"
  )) as { value?: unknown } | undefined;
  const currentGoal = blackboard.find((entry) => (
    entry && typeof entry === "object" && (entry as { key?: unknown }).key === "current_goal"
  )) as { value?: unknown } | undefined;
  if (originalProblem?.value !== deterministicPrompt || currentGoal?.value !== `完成当前用户请求：${deterministicPrompt}`) {
    throw new Error(`Persisted blackboard leaked transient provider context: ${JSON.stringify({ originalProblem, currentGoal })}`);
  }
}

function isDeepEqualJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(mcpEndpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${runtimeToken}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextRpcId++,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const payload = await response.json() as {
    result?: { structuredContent?: T; content?: Array<{ type: string; text: string }>; isError?: boolean };
    error?: unknown;
  };
  if (!response.ok || payload.error || payload.result?.isError) {
    throw new Error(`MCP ${name} failed: ${JSON.stringify(payload.error ?? payload.result)}`);
  }
  if (payload.result?.structuredContent) return payload.result.structuredContent;
  const text = payload.result?.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error(`MCP ${name} returned no structured content.`);
  return JSON.parse(text) as T;
}

async function waitUntil<T>(probe: () => Promise<T | false>, label: string, limit = timeoutMs): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < limit) {
    const result = await probe().catch((error) => {
      if (error instanceof Error && /failed|ended|incomplete|did not match/.test(error.message)) throw error;
      return false as const;
    });
    if (result !== false) return result;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label} after ${limit}ms.`);
}

function reserveLoopbackPort() {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = server.port;
  server.stop(true);
  return port;
}

function writeEvidence(evidence: unknown) {
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

if (import.meta.main) await main();
