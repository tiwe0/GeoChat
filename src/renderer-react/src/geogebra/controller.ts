import type { GeoGebraApi } from "./ggbdeploy-wrapper";
import { canvasLabels, getAppletXml, readCanvasContext, tryReadCanvasContext, type CanvasContext } from "./canvas-context";
import { normalizeGeoGebraCommandSyntax, normalizeGeoGebraFreeParameterCommands } from "@geochat-ai/app/functioncalls";
import { evaluateCommand, type CommandResult } from "./command-executor";
import { GeoGebraAnimationRuntime, type AnimationScheduler, type GeoGebraAnimationEasing, type GeoGebraAnimationMode } from "./animation-runtime";

const COMMAND_DELAY_MS = 0;

export class GeoGebraController {
  private api: GeoGebraApi | null = null;
  private readonly animations: GeoGebraAnimationRuntime;

  constructor(animationScheduler?: AnimationScheduler) {
    this.animations = new GeoGebraAnimationRuntime((object, value) => this.call("setValue", object, value), animationScheduler);
  }

  setApi(api: GeoGebraApi | null) {
    if (api !== this.api) this.animations.dispose();
    this.api = api;
  }
  get ready() { return Boolean(this.api); }

  setToolbarVisible(visible: boolean) {
    if (!this.api) throw new Error("GeoGebra 画板尚未加载完成。");
    if (visible && typeof this.api.showToolBar !== "function") {
      throw new Error("当前 GeoGebra applet 不提供工具栏切换 API。");
    }
    // This vendored GeoGebra build couples showToolBar(false) to its native
    // file menu and removes both. The shell owns the collapsed presentation:
    // when closing we hide only the construction modes with scoped CSS, so
    // Open/Save/Export remain available from GeoGebra's menu button.
    if (visible) {
      const result = this.call("showToolBar", true);
      if (result === false) throw new Error("GeoGebra 拒绝了工具栏切换。");
    }
    this.refreshVisuals();
    return visible;
  }

  async executeTool(toolName: string, args: unknown) {
    const input = record(args);
    if (!this.api) throw new Error("GeoGebra 画板尚未加载完成。");
    switch (toolName) {
      case "executeGeoGebraCommands":
        return this.executeCommands(input);
      case "configureGeoGebraAnimation":
        return this.configureAnimation(input);
      case "controlGeoGebraAnimation":
        return this.controlAnimation(input);
      case "inspectGeoGebraObjects":
        return this.inspectObjects(input);
      case "resetCanvas":
        return this.resetCanvas(input);
      case "getCanvasContext":
        return { ok: true, ...readCanvasContext(this.api, input.includeXml === true) };
      case "getPNGBase64":
        return this.getPngBase64(input);
      case "setPerspective":
        return this.setPerspective(requiredString(input.mode ?? input.perspective, "mode"));
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
        this.call("setValue", name, value);
        this.refreshVisuals();
        return { ok: true, name, value };
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

  /** Put a previously captured construction back. Returns false if the applet cannot. */
  restoreCanvasXml(xml: string) {
    if (!this.api || typeof this.api.setXML !== "function") return false;
    this.call("setXML", xml);
    return true;
  }

  private async executeCommands(input: Record<string, unknown>) {
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
    if (input.resetBefore === true) resetMeta = await this.resetConstruction(canvasBefore);
    if (input.normalizeFreeParameters === true) {
      // Replayed option commands redeclare names the construction already
      // holds; without this each replay collides with the objects it just
      // restored.
      commands = normalizeGeoGebraFreeParameterCommands(commands, {
        declaredNames: canvasBefore ? canvasLabels(canvasBefore) : [],
      });
    } else {
      // GeoGebra's runtime command syntax is the final execution boundary.
      // Normalize aliases, unsupported legacy spellings, and 0-255 RGB values
      // here so direct MCP calls, model tool calls, and macro output behave the
      // same way. In particular, SetColor expects channels in the 0-1 range;
      // passing the palette's 0-255 values directly turns every channel into 1
      // and silently renders the object white.
      commands = commands.flatMap(normalizeGeoGebraCommandSyntax);
    }

    let perspectiveResult: PerspectiveResult | null = null;
    if (typeof input.perspective === "string" && input.perspective.trim()) {
      perspectiveResult = await this.setPerspective(input.perspective.trim());
    }

    const results: CommandResult[] = [];
    for (let index = 0; index < commands.length; index += 1) {
      const result = await evaluateCommand(this.api!, commands[index]!);
      results.push(result);
      if (!result.success) break;
      if (COMMAND_DELAY_MS > 0 && index < commands.length - 1) await wait(COMMAND_DELAY_MS);
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

  private async resetCanvas(input: Record<string, unknown>) {
    const canvasBefore = tryReadCanvasContext(this.api!, false);
    const resetMeta = await this.resetConstruction(canvasBefore);
    let perspectiveResult: PerspectiveResult | null = null;
    if (typeof input.perspective === "string" && input.perspective.trim()) {
      perspectiveResult = await this.setPerspective(input.perspective.trim());
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

  private async resetConstruction(canvasBefore: CanvasContext | undefined) {
    this.animations.dispose();
    const labels = canvasBefore ? canvasLabels(canvasBefore) : [];
    let deleted = 0;
    let failed = 0;
    for (const label of [...labels].reverse()) {
      if (typeof this.api!.deleteObject !== "function") { failed += 1; continue; }
      try { this.call("deleteObject", label); deleted += 1; } catch (caughtError) { console.error("[ERROR] Caught exception at src/renderer-react/src/geogebra/controller.ts:170", caughtError); failed += 1; }
    }
    if (typeof this.api!.reset === "function") {
      this.call("reset");
      await wait(50);
      return { method: labels.length ? "delete-objects-reset" : "reset", deleted, failed };
    }
    if (labels.length && failed === 0) {
      await wait(50);
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

  private async setPerspective(mode: string): Promise<PerspectiveResult> {
    if (typeof this.api!.setPerspective !== "function") {
      return { ok: false, success: false, requestedMode: mode, mode, method: "setPerspective", error: "当前 GeoGebra applet 不提供视图切换 API。" };
    }
    try {
      const raw = await Promise.resolve(this.call("setPerspective", mode));
      if (raw === false) return { ok: false, success: false, requestedMode: mode, mode, method: "setPerspective", error: "GeoGebra 拒绝了视图切换。" };
      return { ok: true, success: true, requestedMode: mode, mode, method: "setPerspective" };
    } catch (error) {
      console.error("[ERROR] Caught exception at src/renderer-react/src/geogebra/controller.ts:213", error);
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
    catch (error) { console.error(`[ERROR] GeoGebra optional API ${name} failed`, error); return undefined; }
  }

  private refreshVisuals() {
    const refreshViews = this.api?.refreshViews;
    if (typeof refreshViews === "function") {
      try { refreshViews.call(this.api); } catch (caughtError) { console.error("[ERROR] Caught exception at src/renderer-react/src/geogebra/controller.ts:227", caughtError); /* rendering is best effort */ }
    }
    const recalculateEnvironments = this.api?.recalculateEnvironments;
    if (typeof recalculateEnvironments === "function") {
      try { recalculateEnvironments.call(this.api); } catch (caughtError) { console.error("[ERROR] Caught exception at src/renderer-react/src/geogebra/controller.ts:231", caughtError); /* optional API */ }
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
