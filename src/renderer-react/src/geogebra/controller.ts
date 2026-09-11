import type { GeoGebraApi } from "./ggbdeploy-wrapper";
import { canvasLabels, getAppletXml, readCanvasContext, tryReadCanvasContext, type CanvasContext } from "./canvas-context";
import { evaluateCommand, type CommandResult } from "./command-executor";

const COMMAND_DELAY_MS = 80;

export class GeoGebraController {
  private api: GeoGebraApi | null = null;

  setApi(api: GeoGebraApi | null) { this.api = api; }
  get ready() { return Boolean(this.api); }

  async executeTool(toolName: string, args: unknown) {
    const input = record(args);
    if (!this.api) throw new Error("GeoGebra 画板尚未加载完成。");
    switch (toolName) {
      case "executeGeoGebraCommands":
        return this.executeCommands(input);
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
      default: throw new Error(`GeoChatPro 不支持工具 ${toolName}。`);
    }
  }

  private async executeCommands(input: Record<string, unknown>) {
    const commands = requiredCommands(input.commands);
    const canvasBefore = tryReadCanvasContext(this.api!, false);
    const savedXml = getAppletXml(this.api!);
    let resetMeta: Record<string, unknown> | null = null;
    if (input.resetBefore === true) resetMeta = await this.resetConstruction(canvasBefore);

    let perspectiveResult: PerspectiveResult | null = null;
    if (typeof input.perspective === "string" && input.perspective.trim()) {
      perspectiveResult = await this.setPerspective(input.perspective.trim());
    }

    const results: CommandResult[] = [];
    for (let index = 0; index < commands.length; index += 1) {
      const result = await evaluateCommand(this.api!, commands[index]!);
      results.push(result);
      if (!result.success) break;
      if (index < commands.length - 1) await wait(COMMAND_DELAY_MS);
    }

    const failedIndex = results.findIndex((result) => !result.success);
    let restoredAfterError = false;
    if (failedIndex >= 0 && input.restoreOnError === true && savedXml && typeof this.api!.setXML === "function") {
      this.call("setXML", savedXml);
      restoredAfterError = true;
    }
    const canvasAfter = tryReadCanvasContext(this.api!, false);
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
        resetBefore: input.resetBefore === true,
        resetMeta,
        perspectiveResult,
      },
    };
  }

  private async resetCanvas(input: Record<string, unknown>) {
    const canvasBefore = tryReadCanvasContext(this.api!, false);
    const resetMeta = await this.resetConstruction(canvasBefore);
    let perspectiveResult: PerspectiveResult | null = null;
    if (typeof input.perspective === "string" && input.perspective.trim()) {
      perspectiveResult = await this.setPerspective(input.perspective.trim());
    }
    const canvasAfter = tryReadCanvasContext(this.api!, false);
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
    const labels = canvasBefore ? canvasLabels(canvasBefore) : [];
    let deleted = 0;
    let failed = 0;
    for (const label of [...labels].reverse()) {
      if (typeof this.api!.deleteObject !== "function") { failed += 1; continue; }
      try { this.call("deleteObject", label); deleted += 1; } catch { failed += 1; }
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
    const raw = await Promise.resolve(this.call("getPNGBase64", exportScale, transparent, dpi, false));
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
      return { ok: false, success: false, requestedMode: mode, mode, method: "setPerspective", error: error instanceof Error ? error.message : String(error) };
    }
  }

  private call(name: string, ...args: unknown[]) {
    const fn = this.api?.[name];
    if (typeof fn !== "function") throw new Error(`GeoGebra API ${name} 不可用。`);
    return Reflect.apply(fn, this.api, args);
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
function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
