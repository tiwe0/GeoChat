import { DEFAULT_GEOGEBRA_TOOLBAR_VISIBLE, type GeoGebraApi } from "./ggbdeploy-wrapper";
import { canvasLabels, getAppletXml, readCanvasContext, tryReadCanvasContext, type CanvasContext } from "./canvas-context";
import { normalizeGeoGebraCommandSyntax, normalizeGeoGebraFreeParameterCommands } from "@geochat-ai/app/functioncalls";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import { evaluateCommand, type CommandResult } from "./command-executor";
import { GeoGebraAnimationRuntime, type AnimationScheduler, type GeoGebraAnimationEasing, type GeoGebraAnimationMode } from "./animation-runtime";
import {
  UNAVAILABLE_GEOGEBRA_CONTROLS,
  type GeoGebraCanvasAction,
  type GeoGebraCanvasControls,
  type GeoGebraControlsSnapshot,
} from "./canvas-controls";
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
const DEFAULT_PIXELS_PER_UNIT = 50;

export class GeoGebraController {
  private api: GeoGebraApi | null = null;
  private appletEpoch = 0;
  private controlsSnapshot: GeoGebraControlsSnapshot = UNAVAILABLE_GEOGEBRA_CONTROLS;
  private readonly controlsListeners = new Set<() => void>();
  private clientListenerApi: GeoGebraApi | null = null;
  private clientListener: ((event: unknown) => void) | null = null;
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
    this.transactions.subscribeRecovery(() => this.refreshCanvasControls());
  }

  readonly canvasControls: GeoGebraCanvasControls = Object.freeze({
    getSnapshot: () => this.controlsSnapshot,
    subscribe: (listener: () => void) => {
      this.controlsListeners.add(listener);
      return () => this.controlsListeners.delete(listener);
    },
    setToolMode: (mode: number) => this.setCanvasToolMode(mode),
    performAction: (action: GeoGebraCanvasAction) => this.performCanvasAction(action),
  });

  setApi(api: GeoGebraApi | null) {
    if (api !== this.api) {
      this.detachCanvasControlsListener();
      this.animations.dispose();
      this.appletEpoch += 1;
      this.api = api;
      if (api) this.transactions.clearRecoveryForAppletReplacement();
      this.attachCanvasControlsListener(api);
      this.refreshCanvasControls();
      return;
    }
    this.api = api;
    this.refreshCanvasControls();
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

  private async setCanvasToolMode(mode: number) {
    if (!Number.isSafeInteger(mode) || mode < 0) {
      throw new Error("GeoGebra 工具模式必须是非负安全整数。");
    }
    this.assertCanvasControlsAvailable();
    if (!this.controlsSnapshot.supportsToolModes) {
      throw new Error("当前 GeoGebra applet 不提供工具模式切换 API。");
    }
    try {
      await this.transactions.run({ label: "controls:set-mode" }, async (transaction) => {
        const result = await transaction.wait(() => Promise.resolve(this.call("setMode", mode)));
        if (result === false) throw new Error("GeoGebra 拒绝了工具模式切换。");
      });
    } finally {
      this.refreshCanvasControls();
    }
  }

  private async performCanvasAction(action: GeoGebraCanvasAction) {
    this.assertCanvasControlsAvailable();
    if (!this.controlsSnapshot.supportedActions.includes(action)) {
      throw new Error(`当前 GeoGebra applet 不支持画布操作 ${action}。`);
    }
    try {
      await this.transactions.run({ label: `controls:${action}` }, async (transaction) => {
        switch (action) {
          case "undo":
          case "redo": {
            const result = await transaction.wait(() => Promise.resolve(this.call(action)));
            if (result === false) throw new Error(`GeoGebra 拒绝了${action === "undo" ? "撤销" : "重做"}操作。`);
            break;
          }
          case "toggleGrid": {
            const current = readGridVisible(this.api!);
            if (current === null) throw new Error("无法可靠读取 GeoGebra 网格状态。");
            const result = await transaction.wait(() => Promise.resolve(this.call("setGridVisible", 1, !current)));
            if (result === false) throw new Error("GeoGebra 拒绝了网格切换。");
            break;
          }
          case "toggleAxes": {
            const current = readAxesVisible(this.api!);
            if (current === null) throw new Error("无法可靠读取 GeoGebra 坐标轴状态。");
            const result = await transaction.wait(() => Promise.resolve(this.call("setAxesVisible", 1, !current, !current, false)));
            if (result === false) throw new Error("GeoGebra 拒绝了坐标轴切换。");
            break;
          }
          case "showAlgebra":
          case "show3D":
          case "showProperties":
          case "showGraphics": {
            const perspective = action === "showAlgebra"
              ? "+A"
              : action === "show3D"
                ? "+T"
                : action === "showProperties"
                  ? "+P"
                  : "G";
            const result = await this.setPerspective(perspective, transaction);
            if (!result.success) throw new Error(result.error ?? "GeoGebra 拒绝了视图切换。");
            break;
          }
        }
      });
    } finally {
      this.refreshCanvasControls();
    }
  }

  private assertCanvasControlsAvailable() {
    if (!this.api) throw new Error("GeoGebra 画板尚未加载完成。");
    if (this.transactions.recoveryState) throw new Error("GeoGebra 画板正在等待恢复，暂时不能执行操作。");
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
      } finally {
        this.refreshCanvasControls();
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
        if (raw === false) return { ok: false, error: "GeoGebra rejected the XML snapshot." };
        this.restoreShellChrome();
        this.refreshCanvasControls();
        return { ok: true };
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
    try {
      const result = await this.executeTool("__restoreCanvasXml", { xml });
      if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
        throw new Error("GeoGebra rejected the stored document snapshot.");
      }
    } finally {
      this.refreshCanvasControls();
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

  async restoreDocumentBase64(base64: string): Promise<void> {
    try {
      await this.transactions.run(
        {
          label: "document:restore",
          supersedeKey: "document:restore",
          captureSnapshot: () => this.captureDocumentBase64Raw(),
          restoreSnapshot: (snapshot) => this.applyDocumentBase64(snapshot),
        },
        async (transaction) => {
          this.animations.dispose();
          await transaction.wait(() => this.applyDocumentBase64(base64));
          this.restoreShellChrome();
        },
      );
    } finally {
      this.refreshCanvasControls();
    }
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
    // Check before clearing: a reset must not succeed with a distorted viewport.
    if (typeof this.api!.setCoordSystem !== "function") throw new Error("当前 GeoGebra applet 不支持恢复坐标比例。");
    this.readGraphicsView();
    const canvasBefore = tryReadCanvasContext(this.api!, false);
    const resetMeta = await waitForTransaction(transaction, () => this.resetConstruction(canvasBefore, transaction));
    let perspectiveResult: PerspectiveResult | null = null;
    if (typeof input.perspective === "string" && input.perspective.trim()) {
      const perspective = input.perspective.trim();
      perspectiveResult = await waitForTransaction(transaction, () => this.setPerspective(perspective, transaction));
    }
    await waitForTransaction(transaction, () => this.resetGraphicsView());
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

  private readGraphicsView() {
    const raw = this.call("getViewProperties", 1);
    const view = record(typeof raw === "string" ? JSON.parse(raw) : raw);
    if (typeof view.width !== "number" || !Number.isFinite(view.width) || view.width <= 0
      || typeof view.height !== "number" || !Number.isFinite(view.height) || view.height <= 0) {
      throw new Error("无法读取 GeoGebra 画板尺寸，不能恢复坐标比例。");
    }
    return { width: view.width, height: view.height, xMin: view.xMin, yMin: view.yMin, invXscale: view.invXscale, invYscale: view.invYscale };
  }

  private resetGraphicsView() {
    // Re-read after reset/perspective changes; the primary 2D view may have resized.
    const { width, height } = this.readGraphicsView();
    const halfX = width / (2 * DEFAULT_PIXELS_PER_UNIT);
    const halfY = height / (2 * DEFAULT_PIXELS_PER_UNIT);
    // Four arguments target the primary 2D view. A fifth would select the 3D overload.
    if (this.call("setCoordSystem", -halfX, halfX, -halfY, halfY) === false) {
      throw new Error("GeoGebra 拒绝了坐标比例重置。");
    }
    const actual = this.readGraphicsView();
    const expectedScale = 1 / DEFAULT_PIXELS_PER_UNIT;
    const matches = (value: unknown, expected: number) => typeof value === "number"
      && Number.isFinite(value) && Math.abs(value - expected) <= 1e-8 * Math.max(1, Math.abs(expected));
    if (!matches(actual.invXscale, expectedScale) || !matches(actual.invYscale, expectedScale)
      || !matches(actual.xMin, -actual.width * expectedScale / 2)
      || !matches(actual.yMin, -actual.height * expectedScale / 2)) {
      throw new Error("GeoGebra 未能恢复原点居中、1:1 的坐标比例。");
    }
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
      this.restoreShellChrome();
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
      this.restoreShellChrome();
      this.refreshCanvasControls();
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

  private restoreShellChrome() {
    if (typeof this.api?.showMenuBar === "function") {
      const menuResult = this.call("showMenuBar", false);
      if (menuResult === false) throw new Error("GeoGebra 拒绝隐藏原生菜单栏。");
    }
    if (typeof this.api?.showToolBar === "function") {
      const toolbarResult = this.call("showToolBar", DEFAULT_GEOGEBRA_TOOLBAR_VISIBLE);
      if (toolbarResult === false) throw new Error("GeoGebra 拒绝隐藏原生工具栏。");
    }
  }

  private attachCanvasControlsListener(api: GeoGebraApi | null) {
    if (!api || typeof api.registerClientListener !== "function" || typeof api.unregisterClientListener !== "function") return;
    const listener = (event: unknown) => {
      if (this.api !== api) return;
      if (!isCanvasControlsClientEvent(event)) return;
      this.refreshCanvasControls();
    };
    try {
      Reflect.apply(api.registerClientListener, api, [listener]);
      this.clientListenerApi = api;
      this.clientListener = listener;
    } catch (error) {
      logger.debug("controls_listener_registration_failed", "GEOGEBRA_CONTROLS_LISTENER_UNAVAILABLE", { error });
    }
  }

  private detachCanvasControlsListener() {
    const api = this.clientListenerApi;
    const listener = this.clientListener;
    this.clientListenerApi = null;
    this.clientListener = null;
    if (!api || !listener || typeof api.unregisterClientListener !== "function") return;
    try {
      Reflect.apply(api.unregisterClientListener, api, [listener]);
    } catch (error) {
      logger.debug("controls_listener_cleanup_failed", "GEOGEBRA_CONTROLS_LISTENER_CLEANUP_FAILED", { error });
    }
  }

  private refreshCanvasControls() {
    const next = buildCanvasControlsSnapshot(this.api, Boolean(this.transactions.recoveryState));
    if (sameControlsSnapshot(this.controlsSnapshot, next)) return;
    this.controlsSnapshot = next;
    for (const listener of this.controlsListeners) {
      try { listener(); }
      catch (error) { logger.warn("controls_subscriber_failed", "GEOGEBRA_CONTROLS_SUBSCRIBER_FAILED", { error }); }
    }
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

function buildCanvasControlsSnapshot(api: GeoGebraApi | null, blocked: boolean): GeoGebraControlsSnapshot {
  if (!api) return blocked ? { ...UNAVAILABLE_GEOGEBRA_CONTROLS, blocked: true } : UNAVAILABLE_GEOGEBRA_CONTROLS;
  const canTransact = typeof api.getXML === "function" && typeof api.setXML === "function";
  const supportsToolModes = canTransact && typeof api.getMode === "function" && typeof api.setMode === "function";
  const supportsGridToggle = canTransact && typeof api.setGridVisible === "function";
  const supportsAxesToggle = canTransact && typeof api.setAxesVisible === "function";
  // State reads may fall back to getXML. Do not touch the construction for
  // runtimes that cannot expose the corresponding interactive control anyway.
  const gridVisible = supportsGridToggle ? readGridVisible(api) : null;
  const axesVisible = supportsAxesToggle ? readAxesVisible(api) : null;
  const supportedActions: GeoGebraCanvasAction[] = [];
  if (canTransact && typeof api.undo === "function") supportedActions.push("undo");
  if (canTransact && typeof api.redo === "function") supportedActions.push("redo");
  if (supportsGridToggle && gridVisible !== null) supportedActions.push("toggleGrid");
  if (supportsAxesToggle && axesVisible !== null) supportedActions.push("toggleAxes");
  if (canTransact && typeof api.setPerspective === "function") {
    supportedActions.push("showAlgebra", "show3D", "showProperties", "showGraphics");
  }
  return {
    ready: true,
    blocked,
    mode: supportsToolModes ? readToolMode(api) : null,
    gridVisible,
    axesVisible,
    supportsToolModes,
    supportedActions: Object.freeze(supportedActions),
  };
}

function readToolMode(api: GeoGebraApi) {
  const value = safeApiCall(api, "getMode");
  const mode = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(mode) && mode >= 0 ? mode : null;
}

function readGridVisible(api: GeoGebraApi): boolean | null {
  const direct = safeApiCall(api, "getGridVisible", 1);
  if (typeof direct === "boolean") return direct;
  const options = readGraphicsOptions(api);
  if (typeof options?.grid === "boolean") return options.grid;
  return readEuclidianSetting(api, "grid");
}

function readAxesVisible(api: GeoGebraApi): boolean | null {
  const options = readGraphicsOptions(api);
  const axes = options?.axes;
  if (axes && typeof axes === "object" && !Array.isArray(axes)) {
    const values = axes as Record<string, unknown>;
    const x = readAxisVisible(values.x);
    const y = readAxisVisible(values.y);
    if (x !== null || y !== null) return x !== null && y !== null && x === y ? x : null;
  }
  return readEuclidianAxes(api);
}

function safeApiCall(api: GeoGebraApi, name: string, ...args: unknown[]) {
  const fn = api[name];
  if (typeof fn !== "function") return undefined;
  try { return Reflect.apply(fn, api, args); }
  catch { return undefined; }
}

function readGraphicsOptions(api: GeoGebraApi): Record<string, unknown> | null {
  const raw = safeApiCall(api, "getGraphicsOptions", 1);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function readAxisVisible(value: unknown): boolean | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const visible = (value as Record<string, unknown>).visible;
  return typeof visible === "boolean" ? visible : null;
}

function readEuclidianSetting(api: GeoGebraApi, setting: "grid"): boolean | null {
  const xml = safeApiCall(api, "getXML");
  if (typeof xml !== "string") return null;
  const view = /<euclidianView\b[\s\S]*?<\/euclidianView>/i.exec(xml)?.[0];
  const settings = view && /<evSettings\b[^>]*>/i.exec(view)?.[0];
  if (!settings) return null;
  const match = new RegExp(`\\b${setting}\\s*=\\s*["'](true|false)["']`, "i").exec(settings);
  return match ? match[1]?.toLowerCase() === "true" : null;
}

function readEuclidianAxes(api: GeoGebraApi): boolean | null {
  const xml = safeApiCall(api, "getXML");
  if (typeof xml !== "string") return null;
  const view = /<euclidianView\b[\s\S]*?<\/euclidianView>/i.exec(xml)?.[0];
  if (!view) return null;
  const readAxis = (id: 0 | 1) => {
    const tag = new RegExp(`<axis\\b(?=[^>]*\\bid\\s*=\\s*["']${id}["'])[^>]*>`, "i").exec(view)?.[0];
    const match = tag && /\bshow\s*=\s*["'](true|false)["']/i.exec(tag);
    return match ? match[1]?.toLowerCase() === "true" : null;
  };
  const x = readAxis(0);
  const y = readAxis(1);
  return x !== null && y !== null && x === y ? x : null;
}

function isCanvasControlsClientEvent(event: unknown) {
  const type = Array.isArray(event)
    ? event[0]
    : event && typeof event === "object"
      ? (event as { type?: unknown }).type
      : event;
  return type === "setMode" || type === "viewChanged" || type === "setCoordSystem" || type === "perspectiveChange";
}

function sameControlsSnapshot(left: GeoGebraControlsSnapshot, right: GeoGebraControlsSnapshot) {
  return left.ready === right.ready
    && left.blocked === right.blocked
    && left.mode === right.mode
    && left.gridVisible === right.gridVisible
    && left.axesVisible === right.axesVisible
    && left.supportsToolModes === right.supportsToolModes
    && left.supportedActions.length === right.supportedActions.length
    && left.supportedActions.every((action, index) => action === right.supportedActions[index]);
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
