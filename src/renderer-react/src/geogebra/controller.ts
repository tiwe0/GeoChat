import type { GeoGebraApi } from "./ggbdeploy-wrapper";
import { canvasLabels, getAppletXml, readCanvasContext, tryReadCanvasContext, type CanvasContext } from "./canvas-context";
import { normalizeGeoGebraCommandSyntax, normalizeGeoGebraFreeParameterCommands } from "@geochat-ai/app/functioncalls";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import { evaluateCommand, type CommandResult } from "./command-executor";
import { GeoGebraAnimationRuntime, type AnimationScheduler, type GeoGebraAnimationEasing, type GeoGebraAnimationMode } from "./animation-runtime";
import {
  CanvasMutationStateUnknownError,
  CanvasTransactionCoordinator,
  type CanvasRecoveryState,
  type CanvasTransactionContext,
  type CanvasTransactionOptions,
} from "./canvas-transactions";

const logger = createStructuredLogger("geogebra.controller");

const COMMAND_DELAY_MS = 0;
const DOCUMENT_IO_TIMEOUT_MS = 15_000;

export class GeoGebraController {
  private api: GeoGebraApi | null = null;
  private appletEpoch = 0;
  private readonly animations: GeoGebraAnimationRuntime;
  private readonly transactions = new CanvasTransactionCoordinator({
    epoch: () => this.appletEpoch,
    capture: () => this.api ? getAppletXml(this.api) : undefined,
    restore: async (snapshot) => {
      if (!this.api || typeof this.api.setXML !== "function") return false;
      const raw = await Promise.resolve(this.call("setXML", snapshot));
      return raw !== false;
    },
  });

  constructor(
    animationScheduler?: AnimationScheduler,
    private readonly documentIoTimeoutMs = DOCUMENT_IO_TIMEOUT_MS,
  ) {
    this.animations = new GeoGebraAnimationRuntime((object, value) => this.call("setValue", object, value), animationScheduler);
  }

  setApi(api: GeoGebraApi | null) {
    if (api !== this.api) {
      this.animations.dispose();
      this.appletEpoch += 1;
      this.api = api;
      if (api) this.transactions.clearRecoveryForAppletReplacement();
      return;
    }
    this.api = api;
  }
  get ready() { return Boolean(this.api); }
  get canvasRecoveryState(): CanvasRecoveryState | null { return this.transactions.recoveryState; }

  subscribeCanvasRecovery(listener: () => void) {
    return this.transactions.subscribeRecovery(listener);
  }

  retryCanvasRecovery() {
    return this.transactions.retryRecovery();
  }

  runCanvasTransaction<T>(
    options: CanvasTransactionOptions,
    work: (execute: (toolName: string, args: unknown) => Promise<unknown>) => T | PromiseLike<T>,
  ) {
    return this.transactions.run(options, (transaction) => work(
      (toolName, args) => transaction.wait(() => this.executeToolWithinTransaction(toolName, args, transaction)),
    ));
  }

  setToolbarVisible(visible: boolean) {
    if (!this.api) throw new Error("GeoGebra 画板尚未加载完成。");
    if (typeof this.api.showToolBar !== "function") {
      throw new Error("当前 GeoGebra applet 不提供工具栏切换 API。");
    }
    const result = this.call("showToolBar", visible);
    if (result === false) throw new Error("GeoGebra 拒绝了工具栏切换。");
    this.refreshVisuals();
    return visible;
  }

  async executeTool(toolName: string, args: unknown) {
    if (isCanvasMutationTool(toolName)) {
      try {
        return await this.runCanvasTransaction({ label: `tool:${toolName}` }, async (execute) => {
          const result = await execute(toolName, args);
          if (mutationResultFailed(result)) throw new CanvasToolResultError(result);
          return result;
        });
      } catch (error) {
        if (error instanceof CanvasToolResultError) return error.result;
        throw error;
      }
    }
    return this.executeToolWithinTransaction(toolName, args);
  }

  private async executeToolWithinTransaction(toolName: string, args: unknown, transaction?: CanvasTransactionContext) {
    const input = record(args);
    if (!this.api) throw new Error("GeoGebra 画板尚未加载完成。");
    switch (toolName) {
      case "executeGeoGebraCommands":
        return this.executeCommands(input, transaction);
      case "configureGeoGebraAnimation":
        return this.configureAnimation(input);
      case "controlGeoGebraAnimation":
        return this.controlAnimation(input);
      case "inspectGeoGebraObjects":
        return this.inspectObjects(input);
      case "resetCanvas":
        return this.resetCanvas(input, transaction);
      case "getCanvasContext":
        return { ok: true, ...readCanvasContext(this.api, input.includeXml === true) };
      case "getPNGBase64":
        return this.getPngBase64(input);
      case "setPerspective":
        return this.setPerspective(requiredString(input.mode, "mode"), transaction);
      case "getValue": {
        const name = requiredString(input.name, "name");
        const value = Number(this.call("getValue", name));
        if (!Number.isFinite(value)) throw new Error(`GeoGebra 返回了非数字值：${name}。`);
        return { ok: true, name, value };
      }
      case "getValueString": {
        const name = requiredString(input.name, "name");
        return { ok: true, name, value: String(this.call("getValueString", name)) };
      }
      case "setValue": {
        const name = requiredString(input.name, "name");
        const value = requiredNumber(input.value, "value");
        this.animations.dispose();
        this.call("setValue", name, value);
        this.refreshVisuals();
        return { ok: true, name, value };
      }
      case "__restoreCanvasXml": {
        const xml = requiredString(input.xml, "xml");
        if (typeof this.api.setXML !== "function") throw new Error("当前 GeoGebra applet 不提供 XML 恢复 API。");
        this.animations.dispose();
        const raw = await waitForTransaction(transaction, () => Promise.resolve(this.call("setXML", xml)));
        return raw === false
          ? { ok: false, error: "GeoGebra rejected the XML snapshot." }
          : { ok: true };
      }
      case "exists": {
        const name = requiredString(input.name, "name");
        return { ok: true, name, exists: Boolean(this.call("exists", name)) };
      }
      case "getObjectType": {
        const name = requiredString(input.name, "name");
        return { ok: true, name, objectType: String(this.call("getObjectType", name)) };
      }
      default: throw new Error(`GeoChat 不支持工具 ${toolName}。`);
    }
  }

  /** The construction as GeoGebra currently holds it, for callers that need to restore it later. */
  getCanvasXml() {
    return this.api ? getAppletXml(this.api) : undefined;
  }

  async restoreCanvasXml(xml: string) {
    const result = await this.executeTool("__restoreCanvasXml", { xml });
    if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
      throw new Error("GeoGebra rejected the stored document snapshot.");
    }
  }

  captureDocumentBase64(): Promise<string> {
    return this.transactions.run(
      { label: "document:capture", readOnly: true },
      (transaction) => transaction.wait(() => this.captureDocumentBase64Raw()),
    );
  }

  private captureDocumentBase64Raw(): Promise<string> {
    if (!this.api || typeof this.api.getBase64 !== "function") {
      throw new Error("当前 GeoGebra applet 不提供完整文档导出 API。");
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(() => reject(new Error("GeoGebra document export timed out."))), this.documentIoTimeoutMs);
      const finish = (complete: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        complete();
      };
      try {
        const returned = this.call("getBase64", (base64: unknown) => {
          if (typeof base64 !== "string" || !base64) {
            finish(() => reject(new Error("GeoGebra 返回了空文档。")));
            return;
          }
          finish(() => resolve(base64));
        });
        if (typeof returned === "string" && returned) finish(() => resolve(returned));
      } catch (error) {
        finish(() => reject(error));
      }
    });
  }

  restoreDocumentBase64(base64: string): Promise<void> {
    return this.transactions.run(
      {
        label: "document:restore",
        supersedeKey: "document:restore",
        captureSnapshot: () => this.captureDocumentBase64Raw(),
        restoreSnapshot: (snapshot) => this.applyDocumentBase64(snapshot),
      },
      async (transaction) => {
        this.animations.dispose();
        await transaction.wait(() => this.applyDocumentBase64(base64));
      },
    );
  }

  private applyDocumentBase64(base64: string): Promise<void> {
    if (!this.api || typeof this.api.setBase64 !== "function") {
      throw new Error("当前 GeoGebra applet 不提供完整文档恢复 API。");
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let underlyingSettled = false;
      const timer = setTimeout(() => finish(() => reject(new CanvasMutationStateUnknownError(
        "GeoGebra document restore timed out while the applet may still be loading it.",
        () => underlyingSettled,
      ))), this.documentIoTimeoutMs);
      const finish = (complete: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        complete();
      };
      try {
        const returned = this.call("setBase64", base64, () => {
          underlyingSettled = true;
          finish(resolve);
        });
        if (returned === false) {
          underlyingSettled = true;
          finish(() => reject(new Error("GeoGebra rejected the stored document file.")));
        }
      } catch (error) {
        underlyingSettled = true;
        finish(() => reject(error));
      }
    });
  }

  private async executeCommands(input: Record<string, unknown>, transaction?: CanvasTransactionContext) {
    // Command batches and business-animation frames must never write the same
    // construction concurrently. A command transaction takes ownership of the
    // canvas and stops controller-owned timelines before its first mutation.
    this.animations.dispose();
    let commands = requiredCommands(input.commands);
    // Rewind to a known construction before running anything. The choice
    // preview uses this to replay one option from the same starting point
    // every time, instead of stacking each option on the last one's leftovers.
    if (typeof input.restoreBeforeXml === "string" && input.restoreBeforeXml && typeof this.api!.setXML === "function") {
      this.call("setXML", input.restoreBeforeXml);
    }
    const canvasBefore = tryReadCanvasContext(this.api!, false);
    const savedXml = getAppletXml(this.api!);
    let resetMeta: Record<string, unknown> | null = null;
    if (input.resetBefore === true) {
      resetMeta = await waitForTransaction(transaction, () => this.resetConstruction(canvasBefore, transaction));
    }
    if (input.normalizeFreeParameters === true) {
      // Replayed option commands redeclare names the construction already
      // holds; without this each replay collides with the objects it just
      // restored.
      commands = normalizeGeoGebraFreeParameterCommands(commands, {
        declaredNames: canvasBefore ? canvasLabels(canvasBefore) : [],
      });
    } else {
      // GeoGebra's runtime command syntax is the final execution boundary.
      // Normalize supported localized commands, syntax variants, and 0-255 RGB
      // values here so direct MCP calls, model tool calls, and macro output behave the
      // same way. In particular, SetColor expects channels in the 0-1 range;
      // passing the palette's 0-255 values directly turns every channel into 1
      // and silently renders the object white.
      commands = commands.flatMap(normalizeGeoGebraCommandSyntax);
    }

    let perspectiveResult: PerspectiveResult | null = null;
    if (typeof input.perspective === "string" && input.perspective.trim()) {
      const perspective = input.perspective.trim();
      perspectiveResult = await waitForTransaction(transaction, () => this.setPerspective(perspective, transaction));
    }

    const results: CommandResult[] = [];
    for (let index = 0; index < commands.length; index += 1) {
      const result = await waitForTransaction(transaction, () => evaluateCommand(this.api!, commands[index]!));
      results.push(result);
      if (!result.success) break;
      if (COMMAND_DELAY_MS > 0 && index < commands.length - 1) {
        await waitForTransaction(transaction, () => wait(COMMAND_DELAY_MS));
      }
    }

    const failedIndex = results.findIndex((result) => !result.success);
    let restoredAfterError = false;
    if (failedIndex >= 0 && input.restoreOnError === true && savedXml && typeof this.api!.setXML === "function") {
      this.call("setXML", savedXml);
      restoredAfterError = true;
    }
    const canvasAfter = tryReadCanvasContext(this.api!, false);
    this.refreshVisuals();
    const error = perspectiveResult && !perspectiveResult.success
      ? perspectiveResult.error ?? "GeoGebra 视图切换失败。"
      : failedIndex >= 0 ? results[failedIndex]?.error ?? "GeoGebra 命令执行失败。" : null;
    return {
      ok: !error,
      results,
      canvasBefore,
      canvasAfter,
      canvasContext: canvasAfter,
      failedCommandIndex: failedIndex >= 0 ? failedIndex + 1 : null,
      failedCommand: failedIndex >= 0 ? results[failedIndex]?.command ?? null : null,
      lastCompletedCommand: [...results].reverse().find((result) => result.success)?.command ?? null,
      error,
      clientMeta: {
        source: "geogebra-applet",
        commandDelayMs: commands.length > 1 ? COMMAND_DELAY_MS : 0,
        restoreOnError: input.restoreOnError === true,
        restoredAfterError,
        restoredBefore: typeof input.restoreBeforeXml === "string" && Boolean(input.restoreBeforeXml),
        normalizeFreeParameters: input.normalizeFreeParameters === true,
        resetBefore: input.resetBefore === true,
        resetMeta,
        perspectiveResult,
      },
    };
  }

  private configureAnimation(input: Record<string, unknown>) {
    const object = requiredString(input.object, "object");
    if (!Boolean(this.call("exists", object))) throw new Error(`GeoGebra 对象 ${object} 不存在。`);
    const objectType = String(this.call("getObjectType", object));
    if (!new Set(["numeric", "angle"]).has(objectType.toLowerCase())) {
      throw new Error(`对象 ${object} 的类型为 ${objectType}，业务动画目前仅支持数值和角度对象。`);
    }
    // A parameter may already be running under GeoGebra's native animation
    // loop (for example after StartAnimation). Stop that public API loop before
    // the business timeline starts writing the same value, otherwise the two
    // schedulers race and the visible motion becomes jerky.
    if (typeof this.api?.setAnimating === "function") this.call("setAnimating", object, false);
    const snapshot = this.animations.configure({
      object,
      from: requiredNumber(input.from, "from"),
      to: requiredNumber(input.to, "to"),
      durationMs: boundedNumber(input.durationMs ?? undefined, 20_000, 2_000, 120_000),
      mode: animationMode(input.mode),
      easing: animationEasing(input.easing)
    }, input.autoplay !== false);
    return { ok: true, animation: snapshot, clientMeta: { source: "geogebra-applet-setValue", xmlUsed: false } };
  }

  private controlAnimation(input: Record<string, unknown>) {
    const action = animationAction(input.action);
    const objects = requiredStringArray(input.objects, "objects", 16);
    const animations = this.animations.control(action, objects);
    return { ok: true, action, animations, clientMeta: { source: "geogebra-applet-setValue", xmlUsed: false } };
  }

  private inspectObjects(input: Record<string, unknown>) {
    const objects = requiredStringArray(input.objects, "objects", 20).map((name) => {
      const exists = Boolean(this.call("exists", name));
      if (!exists) return { name, exists };
      return compactRecord({
        name,
        exists,
        defined: this.optionalCall("isDefined", name),
        objectType: this.optionalCall("getObjectType", name),
        value: finiteNumber(this.optionalCall("getValue", name)),
        valueString: this.optionalCall("getValueString", name),
        commandString: this.optionalCall("getCommandString", name),
        x: finiteNumber(this.optionalCall("getXcoord", name)),
        y: finiteNumber(this.optionalCall("getYcoord", name)),
        z: finiteNumber(this.optionalCall("getZcoord", name)),
        visible: this.optionalCall("getVisible", name),
        animating: this.optionalCall("isAnimating", name),
        businessAnimation: this.animations.snapshot(name)
      });
    });
    return { ok: true, objects, clientMeta: { source: "geogebra-applet", xmlUsed: false } };
  }

  private async resetCanvas(input: Record<string, unknown>, transaction?: CanvasTransactionContext) {
    const canvasBefore = tryReadCanvasContext(this.api!, false);
    const resetMeta = await waitForTransaction(transaction, () => this.resetConstruction(canvasBefore, transaction));
    let perspectiveResult: PerspectiveResult | null = null;
    if (typeof input.perspective === "string" && input.perspective.trim()) {
      const perspective = input.perspective.trim();
      perspectiveResult = await waitForTransaction(transaction, () => this.setPerspective(perspective, transaction));
    }
    const canvasAfter = tryReadCanvasContext(this.api!, false);
    this.refreshVisuals();
    const error = perspectiveResult && !perspectiveResult.success
      ? perspectiveResult.error ?? "GeoGebra 视图切换失败。"
      : null;
    return {
      ok: !error,
      reset: !error,
      method: resetMeta.method,
      deleted: resetMeta.deleted,
      failed: resetMeta.failed,
      canvasBefore,
      canvasAfter,
      canvasContext: canvasAfter,
      clientMeta: { source: "geogebra-applet", resetMeta, perspectiveResult },
      error,
    };
  }

  private async resetConstruction(canvasBefore: CanvasContext | undefined, transaction?: CanvasTransactionContext) {
    this.animations.dispose();
    const labels = canvasBefore ? canvasLabels(canvasBefore) : [];
    let deleted = 0;
    let failed = 0;
    for (const label of [...labels].reverse()) {
      if (typeof this.api!.deleteObject !== "function") { failed += 1; continue; }
      try { this.call("deleteObject", label); deleted += 1; } catch (caughtError) { logger.warn("object_delete_failed", "GEOGEBRA_OBJECT_DELETE_FAILED", { error: caughtError, objectLabel: label }); failed += 1; }
    }
    if (typeof this.api!.reset === "function") {
      this.call("reset");
      await waitForTransaction(transaction, () => wait(50));
      return { method: labels.length ? "delete-objects-reset" : "reset", deleted, failed };
    }
    if (labels.length && failed === 0) {
      await waitForTransaction(transaction, () => wait(50));
      return { method: "delete-objects", deleted, failed };
    }
    throw new Error("当前 GeoGebra applet 不支持安全重置画布。");
  }

  private async getPngBase64(input: Record<string, unknown>) {
    if (typeof this.api!.getPNGBase64 !== "function") throw new Error("当前 GeoGebra 资源不提供 getPNGBase64。");
    const exportScale = boundedNumber(input.exportScale, 1, 0.25, 4);
    const transparent = typeof input.transparent === "boolean" ? input.transparent : true;
    const dpi = input.dpi === undefined ? undefined : boundedNumber(input.dpi, 96, 1, 600);
    // The public GeoGebra Apps API accepts exactly three arguments. Passing a
    // fourth flag happens to work in some builds, but crashes the bundled
    // HTML5 applet's Java bridge with an internal index error.
    const raw = await Promise.resolve(this.call("getPNGBase64", exportScale, transparent, dpi));
    const value = String(raw ?? "");
    const base64 = value.includes(",") ? value.split(",").pop() ?? "" : value;
    if (!base64) throw new Error("GeoGebra 返回了空 PNG。");
    return {
      ok: true,
      base64,
      mediaType: "image/png" as const,
      exportScale,
      transparent,
      ...(dpi === undefined ? {} : { dpi }),
      byteEstimate: Math.floor((base64.length * 3) / 4),
      clientMeta: { source: "geogebra-applet", ready: true },
    };
  }

  private async setPerspective(mode: string, transaction?: CanvasTransactionContext): Promise<PerspectiveResult> {
    if (typeof this.api!.setPerspective !== "function") {
      return { ok: false, success: false, requestedMode: mode, mode, method: "setPerspective", error: "当前 GeoGebra applet 不提供视图切换 API。" };
    }
    try {
      const raw = await waitForTransaction(transaction, () => Promise.resolve(this.call("setPerspective", mode)));
      if (raw === false) return { ok: false, success: false, requestedMode: mode, mode, method: "setPerspective", error: "GeoGebra 拒绝了视图切换。" };
      return { ok: true, success: true, requestedMode: mode, mode, method: "setPerspective" };
    } catch (error) {
      logger.warn("perspective_change_failed", "GEOGEBRA_PERSPECTIVE_CHANGE_FAILED", { error, perspective: mode });
      return { ok: false, success: false, requestedMode: mode, mode, method: "setPerspective", error: error instanceof Error ? error.message : String(error) };
    }
  }

  private call(name: string, ...args: unknown[]) {
    const fn = this.api?.[name];
    if (typeof fn !== "function") throw new Error(`GeoGebra API ${name} 不可用。`);
    return Reflect.apply(fn, this.api, args);
  }

  private optionalCall(name: string, ...args: unknown[]) {
    const fn = this.api?.[name];
    if (typeof fn !== "function") return undefined;
    try { return Reflect.apply(fn, this.api, args); }
    catch (error) { logger.debug("optional_api_failed", "GEOGEBRA_OPTIONAL_API_FAILED", { error, api: name }); return undefined; }
  }

  private refreshVisuals() {
    const refreshViews = this.api?.refreshViews;
    if (typeof refreshViews === "function") {
      try { refreshViews.call(this.api); } catch (caughtError) { logger.debug("refresh_views_failed", "GEOGEBRA_REFRESH_FAILED", { error: caughtError }); /* rendering is best effort */ }
    }
    const recalculateEnvironments = this.api?.recalculateEnvironments;
    if (typeof recalculateEnvironments === "function") {
      try { recalculateEnvironments.call(this.api); } catch (caughtError) { logger.debug("recalculate_environments_failed", "GEOGEBRA_RECALCULATE_FAILED", { error: caughtError }); /* optional API */ }
    }
  }
}

type PerspectiveResult = { ok: boolean; success: boolean; requestedMode: string; mode: string; method: string; error?: string };

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function requiredCommands(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new Error("commands 必须包含 1 到 100 条命令。");
  return value.map((item, index) => requiredString(item, `commands[${index}]`));
}
function requiredString(value: unknown, field: string) { if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 必须是非空字符串。`); return value.trim(); }
function requiredNumber(value: unknown, field: string) { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} 必须是有限数字。`); return value; }
function boundedNumber(value: unknown, fallback: number, min: number, max: number) { const number = value === undefined ? fallback : requiredNumber(value, "number"); return Math.min(max, Math.max(min, number)); }
function requiredStringArray(value: unknown, field: string, max: number) {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) throw new Error(`${field} 必须包含 1 到 ${max} 个对象名。`);
  return [...new Set(value.map((item, index) => requiredString(item, `${field}[${index}]`)))];
}
function animationMode(value: unknown): GeoGebraAnimationMode {
  return value === "loop" || value === "ping_pong" || value === "continuous" ? value : "once";
}
function animationEasing(value: unknown): GeoGebraAnimationEasing { return value === "ease_in_out" ? value : "linear"; }
function animationAction(value: unknown) {
  if (value === "play" || value === "pause" || value === "stop" || value === "reset") return value;
  throw new Error("action 必须是 play、pause、stop 或 reset。");
}
function finiteNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : undefined; }
function compactRecord(value: Record<string, unknown>) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)); }
function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const CANVAS_MUTATION_TOOLS = new Set([
  "executeGeoGebraCommands",
  "configureGeoGebraAnimation",
  "controlGeoGebraAnimation",
  "resetCanvas",
  "setPerspective",
  "setValue",
  "__restoreCanvasXml",
]);

function isCanvasMutationTool(toolName: string) {
  return CANVAS_MUTATION_TOOLS.has(toolName);
}

function mutationResultFailed(value: unknown) {
  const payload = record(value);
  return payload.ok === false || payload.success === false;
}

class CanvasToolResultError extends Error {
  constructor(readonly result: unknown) {
    super("Canvas mutation returned a failed result.");
    this.name = "CanvasToolResultError";
  }
}

function waitForTransaction<T>(transaction: CanvasTransactionContext | undefined, operation: () => T | PromiseLike<T>) {
  return transaction ? transaction.wait(operation) : Promise.resolve(operation());
}
