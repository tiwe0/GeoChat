import type { Context } from "@deepseek-ai/cordis";
import type { ImageAttachmentRef } from "@deepseek-ai/dsh-attachment";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type {} from "@deepseek-ai/dsh-skill";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import Schema from "@deepseek-ai/schemastery";
import { loadBundledSkills } from "./assets.js";
import { CANVAS_TOOLS } from "./canvas-tools.js";
import { CanvasOpener } from "./canvas-opener.js";
import { searchCanvasCommands, validateCanvasCommands } from "./commands.js";
import { registerCanvasAssets } from "./native-assets.js";
import { NativeCanvasBroker } from "./native-broker.js";
import { registerNativeCanvasRemote } from "./native-remote.js";
import { validateInput, type InputSchema } from "./validation.js";

export const name = "geochat";
export const inject = ["tools", "skills", "attachments", "typert", "webServer"];
export interface Config {
  timeoutMs: number;
  skills: boolean;
}
export const Config: Schema<Config> = Schema.object({
  timeoutMs: Schema.number().min(100).max(120000).default(30000),
  skills: Schema.boolean().default(true)
});

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid GeoChat native canvas response object.");
  return value as Record<string, unknown>;
}

function renderResult(
  _args: unknown,
  value: Parameters<ToolDefinition["output"]["render"]>[1]
): ReturnType<ToolDefinition["output"]["render"]> {
  const envelope = record(value);
  const result = envelope.result && typeof envelope.result === "object" ? record(envelope.result) : undefined;
  if (Array.isArray(result?.frames)) {
    return [
      { type: "text", text: JSON.stringify({ sampling: result.sampling, limitations: result.limitations }) },
      ...result.frames.flatMap((value): ReturnType<ToolDefinition["output"]["render"]> => {
        const frame = record(value);
        return [
          {
            type: "text",
            text: JSON.stringify({ index: frame.index, elapsedMs: frame.elapsedMs, mediaType: frame.mediaType })
          },
          { type: "image", attachment: frame.attachment as unknown as ImageAttachmentRef }
        ];
      })
    ];
  }
  if (result?.attachment) {
    return [
      { type: "text", text: JSON.stringify({ mediaType: result.mediaType }) },
      { type: "image", attachment: result.attachment as unknown as ImageAttachmentRef }
    ];
  }
  return [{ type: "text", text: JSON.stringify(value) }];
}

async function projectImage(ctx: Context, value: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const result = record(value);
  if (Array.isArray(result.frames)) {
    if (result.frames.length < 2 || result.frames.length > 8) throw new Error("Invalid frame count.");
    let total = 0;
    for (const value of result.frames) {
      const frame = record(value);
      validatePng(frame);
      total += (frame.base64 as string).length;
      if (
        !Number.isSafeInteger(frame.index) ||
        typeof frame.elapsedMs !== "number" ||
        !Number.isFinite(frame.elapsedMs) ||
        frame.elapsedMs < 0
      ) {
        throw new Error("Invalid frame metadata.");
      }
    }
    if (total > 12 * 1024 * 1024) throw new Error("Captured frames exceed the aggregate size limit.");
    const frames = [];
    for (const value of result.frames) {
      const frame = record(value);
      const projected = record((await projectImage(ctx, frame, signal)).result);
      frames.push({ ...projected, index: frame.index, elapsedMs: frame.elapsedMs });
    }
    return { result: { ok: true, frames, sampling: result.sampling, limitations: result.limitations } };
  }
  if (result.mediaType !== "image/png") return { result };
  validatePng(result);
  const base64 = result.base64 as string;
  signal?.throwIfAborted();
  const attachment = await ctx.attachments.saveImage({
    data: Buffer.from(base64, "base64"),
    mediaType: "image/png",
    name: "geochat-canvas.png"
  });
  signal?.throwIfAborted();
  // Never send raw base64 as text or retain it in canonical history.
  return { result: { ok: true, mediaType: attachment.mediaType, attachment } };
}

function validatePng(result: Record<string, unknown>): void {
  const base64 = result.base64;
  if (
    result.mediaType !== "image/png" ||
    typeof base64 !== "string" ||
    !base64.length ||
    base64.length > 12 * 1024 * 1024 ||
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  ) {
    throw new Error("Invalid or oversized GeoChat PNG data.");
  }
}

function sessionId(exec: ToolRunContext): string {
  if (!exec.agent?.id) throw new Error("GeoChat native canvas tools require an active Harness session.");
  return String(exec.agent.id);
}

function define(
  name: string,
  description: string,
  parameters: InputSchema,
  execute: (args: Record<string, unknown>, exec: ToolRunContext) => Promise<unknown>
): ToolDefinition {
  return {
    name,
    description,
    parameters,
    output: { schema: {}, render: renderResult },
    async execute(args, exec) {
      validateInput(args, parameters);
      return execute(record(args), exec);
    }
  };
}

export function registerCanvasTools(
  ctx: Context,
  broker: NativeCanvasBroker,
  includeSkills: boolean,
  skillsDirectory?: string | URL,
  opener: CanvasOpener = new CanvasOpener(broker)
): void {
  ctx.effect(() => () => opener.dispose());
  const skills = includeSkills ? loadBundledSkills({ skillsDirectory }) : [];
  for (const tool of CANVAS_TOOLS) {
    ctx.tools.register(
      define(
        "publicName" in tool ? tool.publicName : `geochat_${tool.name}`,
        tool.description,
        {
          type: "object",
          additionalProperties: false,
          required: tool.required,
          properties: tool.properties
        },
        async (args, exec) => {
          if (tool.name === "executeGeoGebraCommands") validateCanvasCommands(args.commands as string[]);
          const value = await broker.run(sessionId(exec), tool.name, args, exec.signal);
          return projectImage(ctx, value, exec.signal);
        }
      )
    );
  }
  ctx.tools.register(
    define(
      "geochat_open_canvas",
      "返回：opened=true 及 connected、ready、busy、queued 状态，成功返回前已等待当前会话 Applet 就绪。使用：作图或读取画布前，主动展开并选中当前 Harness 会话右侧 GeoChat 画布；无参数，重复调用保留已有构造。边界：不创建数学对象、不清空画布、不切换其他会话，也不返回截图；没有连接中的当前会话界面、存在多窗口歧义或加载超时时报错。画布只在页面内存中保留，不保证关闭或刷新后恢复。",
      { type: "object", additionalProperties: false, properties: {} },
      async (_args, exec) => opener.open(sessionId(exec), exec.signal)
    )
  );
  ctx.tools.register(
    define(
      "geochat_status",
      "返回：当前会话画布的 connected、ready、busy 和 queued 状态快照。使用：诊断是否连接、就绪或正在处理请求；未连接时先调用 geochat_open_canvas。边界：只读状态，不主动打开或修复连接；ready 不证明任何构造或视觉效果正确，也不表示动画持续播放，需用 geochat_inspectGeoGebraObjects/geochat_getValue 和 geochat_capture_canvas 分别验证。",
      {
        type: "object",
        additionalProperties: false,
        properties: {}
      },
      async (_args, exec) => broker.status(sessionId(exec))
    )
  );
  ctx.tools.register(
    define(
      "geochat_search_commands",
      "返回：内置命令目录的匹配条目，含命令名、语法和示例等参考信息，可能为空。使用：不确定 GeoGebra 命令或本地化语法时，在执行前搜索；不依赖画布就绪。边界：只查离线参考，不执行命令、不搜索当前画布，也不保证示例在当前对象上成立；过滤目录中脚本执行风险条目，不提供 JavaScript。执行后仍需 geochat_inspectGeoGebraObjects 和 geochat_capture_canvas 验证。",
      {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: {
            type: "string",
            minLength: 1,
            maxLength: 300,
            description: "命令名称或构造关键词，例如 Circle、圆、Sequence；不是要立即执行的脚本。"
          },
          topN: {
            type: "integer",
            minimum: 1,
            maximum: 12,
            description: "默认最多 8 条结果；可设 1–12，匹配少或过滤脚本风险后实际结果可能更少。"
          }
        }
      },
      async (args) => ({
        results: searchCanvasCommands(args.query as string, args.topN as number | undefined)
      })
    )
  );
  for (const skill of skills) ctx.skills.register(skill);
  ctx.skills.register({
    name: "geochat",
    source: "bundled",
    provider: "geochat",
    description: "使用 Harness 页面内的 GeoGebra 画布进行数学作图、条件表达式、Sequence、动画和构造验证。",
    content: [
      "你控制的是当前 Harness 会话浏览器页面内由插件原生创建的 GeoGebra 画布；不连接独立 GeoChat 桌面进程，也不通过 HTTP/MCP 执行工具。",
      "作图前先调用 geochat_open_canvas 主动展开并选中当前会话画布，成功意味着 Applet 已就绪；再 geochat_getCanvasContext，保留已有对象，先搜索语法，再作图并 inspect 验证。重复打开不清空画布；如果当前会话未显示或同时显示于多个窗口，先让用户在一个窗口中打开当前会话，不要自动切换其他会话。",
      "完成构造或批量样式调整后，调用 geochat_capture_canvas 获取可直接查看的原生图片附件，检查颜色对比、标签重叠、遮挡、网格和布局；无需手动解码或将图片当文本读取，也不要未经尝试就声称无法截图。若当前模型无法读取图片附件，应明确说明实际限制，不能声称完成视觉验收。截图不替代 inspect/getValue 的定义、坐标、数值验证，也不证明动画连续性。",
      "样式读回、视口和插件动画状态优先用 geochat_sceneReport；文字字号用 geochat_setTextStyle（仅已有 text）。文字框冲突用 geochat_checkLayout，它以临时探针测 text/列表文字并清理，未覆盖的普通对象标签和 3D 不能当作通过。动画用 geochat_captureFrames 获取多帧原生图片附件，有限帧仍不证明全程无闪烁。",
      "画布调用通过 Harness 原生双向 Remote 流按当前会话路由，并在该会话内严格串行。",
      "resetCanvas 和 resetBefore 会清空画布，仅用户明确要求时才使用。不提供 JavaScript/XML 注入接口，拒绝命令目录中标记 risk:script-execution 的调用。已有对象更新仍可能触发其原有脚本，本插件不是沙箱。",
      "动画及 continuous 表达式只在当前页面存活期间运行；关闭或刷新页面会销毁当前内存画布，不做持久化。",
      "工具取消或超时发生在命令派发之后时，结果状态未知。先重新连接并检查画布，不要自动重试写操作。",
      "教学解释直接在 Harness 回复。内部高级 recipe、任务状态、记忆、技能加载和诊断接口不属于画布工具。"
    ].join("\n")
  });
}

export function apply(ctx: Context, config: Config): void {
  const broker = new NativeCanvasBroker({ timeoutMs: config.timeoutMs });
  const opener = new CanvasOpener(broker, config.timeoutMs);
  ctx.effect(() => () => broker.dispose());
  registerCanvasAssets(ctx);
  registerNativeCanvasRemote(ctx, broker, opener);
  registerCanvasTools(ctx, broker, config.skills, undefined, opener);
}
