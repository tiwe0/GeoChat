import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import type { ImageAttachmentRef } from "@deepseek-ai/dsh-attachment";
import { LocalAttachmentStore } from "@deepseek-ai/dsh-attachment-local";
import { SkillRegistry } from "@deepseek-ai/dsh-skill";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { test } from "node:test";
import { registerCanvasTools } from "../src/index.ts";
import { CanvasOpener } from "../src/canvas-opener.ts";
import { NativeCanvasBroker, type NativeCanvasLease } from "../src/native-broker.ts";

const EXPECTED_TOOL_NAMES = [
  "geochat_sceneReport",
  "geochat_checkLayout",
  "geochat_captureFrames",
  "geochat_setTextStyle",
  "geochat_executeGeoGebraCommands",
  "geochat_configureGeoGebraAnimation",
  "geochat_controlGeoGebraAnimation",
  "geochat_inspectGeoGebraObjects",
  "geochat_resetCanvas",
  "geochat_getCanvasContext",
  "geochat_capture_canvas",
  "geochat_setPerspective",
  "geochat_getValue",
  "geochat_getValueString",
  "geochat_setValue",
  "geochat_exists",
  "geochat_getObjectType",
  "geochat_open_canvas",
  "geochat_status",
  "geochat_search_commands"
] as const;

test("real ToolRuntime opens only the calling session, rejects model-supplied session overrides", async () => {
  const { root, tools, cleanup } = await createHarnessServices();
  const canvas = new NativeCanvasBroker();
  const opener = new CanvasOpener(canvas);
  try {
    registerCanvasTools(root, canvas, false, undefined, opener);
    const ui = opener.register("session-open", "page-a");
    const controls = readyLease(opener.requests, ui.id);
    const running = execute(tools, "geochat_open_canvas", {}, "session-open");
    const command = (await controls.next()).value;
    assert.equal(command.toolName, "openCanvas");
    const applet = readyLease(canvas, "session-open");
    opener.registerCanvas("session-open", "page-a");
    controls.reply({ id: command.id, ok: true, result: { opened: true } });
    const result = await running;
    if (result.isError) assert.fail(result.error.message);
    assert.deepEqual(result.value, { opened: true, connected: true, ready: true, busy: false, queued: 0 });
    const override = await execute(tools, "geochat_open_canvas", { sessionId: "other" }, "session-open");
    assert.equal(override.isError, true);
    const other = await execute(tools, "geochat_open_canvas", {}, "other");
    assert.equal(other.isError, true);
    applet.closeSettled();
    ui.dispose();
  } finally {
    opener.dispose();
    canvas.dispose();
    await cleanup();
  }
});

async function createHarnessServices(normalizedImageMaxBytes?: number): Promise<{
  root: Context;
  tools: ToolRuntime;
  skills: SkillRegistry;
  cleanup: () => Promise<void>;
}> {
  const root = new Context();
  const dshHome = await mkdtemp(join(tmpdir(), "dsh-geochat-plugin-"));
  new LocalAttachmentStore(root, { dshHome, normalizedImageMaxBytes });
  new SystemPrompt(root, {});
  const tools = new ToolRuntime(root);
  const skills = new SkillRegistry(root);
  return {
    root,
    tools,
    skills,
    async cleanup() {
      await root.fiber.dispose();
      await rm(dshHome, { recursive: true, force: true });
    }
  };
}

test("registers the native tool and skill surface in real Harness registries", async () => {
  const { root, tools, skills, cleanup } = await createHarnessServices();
  const broker = new NativeCanvasBroker();
  try {
    registerCanvasTools(root, broker, true, new URL("../dist/skills/", import.meta.url));

    assert.deepEqual(
      tools.schemas().map((schema) => schema.name),
      EXPECTED_TOOL_NAMES
    );
    assert.equal(
      tools.schemas().some((schema) => schema.name === "geochat_getPNGBase64"),
      false
    );
    const capture = tools.schemas().find((schema) => schema.name === "geochat_capture_canvas");
    assert.ok(capture);
    assert.match(capture.description, /图片附件/);
    assert.match(capture.description, /样式调整/);
    assert.match(capture.description, /标签.*遮挡.*布局/);
    assert.match(capture.description, /不替代.*数值/);
    assert.match(capture.description, /未实际读取图片不能声称完成视觉验收/);
    const catalog = await skills.list();
    assert.equal(catalog.length, 56);
    assert.ok(catalog.some((skill) => skill.name === "geochat"));
    assert.equal(catalog.filter((skill) => skill.name.startsWith("geochat-")).length, 55);

    const nativeSkill = await skills.get("geochat-native-expression-modeling");
    assert.ok(nativeSkill);
    assert.match(nativeSkill.content, /原生表达式与条件建模/);
    assert.match(nativeSkill.content, /geochat_getCanvasContext/);
    const entrySkill = await skills.get("geochat");
    assert.ok(entrySkill);
    assert.match(entrySkill.content, /geochat_capture_canvas/);
    assert.match(entrySkill.content, /不能.*视觉验收/);
  } finally {
    broker.dispose();
    await cleanup();
  }
});

test("the real ToolRuntime executes offline command search as canonical JSON", async () => {
  const { root, tools, cleanup } = await createHarnessServices();
  const broker = new NativeCanvasBroker();
  try {
    registerCanvasTools(root, broker, false);
    const result = await tools.execute({
      callId: "search-1" as never,
      name: "geochat_search_commands",
      arguments: { query: "圆", topN: 2 },
      signal: new AbortController().signal
    });
    if (result.isError) assert.fail(result.error.message);
    assert.equal(result.isError, false);
    const value = result.value as { results?: Array<{ command?: string }> };
    assert.ok(Array.isArray(value.results));
    assert.ok(value.results.length > 0 && value.results.length <= 2);
    assert.ok(value.results.every((entry) => typeof entry.command === "string"));
    assert.equal(result.content[0]?.type, "text");
  } finally {
    broker.dispose();
    await cleanup();
  }
});

test("every public tool declares its result, usage and limits, with described parameters", async () => {
  const { root, tools, cleanup } = await createHarnessServices();
  const broker = new NativeCanvasBroker();
  try {
    registerCanvasTools(root, broker, false);
    const registered = new Set(tools.schemas().map((schema) => schema.name));
    for (const schema of tools.schemas()) {
      assert.match(schema.description, /返回：.+使用：.+边界：/s, schema.name);
      const parameters = schema.parameters as { properties?: Record<string, { description?: string }> };
      for (const [name, property] of Object.entries(parameters.properties ?? {})) {
        assert.ok(property.description?.trim(), `${schema.name}.${name} needs usage guidance`);
      }
      const guidance = [
        schema.description,
        ...Object.values(parameters.properties ?? {}).map((p) => p.description)
      ].join("\n");
      for (const reference of guidance.match(/\bgeochat_[A-Za-z0-9_]+\b/g) ?? []) {
        assert.ok(registered.has(reference), `${schema.name} references unavailable tool ${reference}`);
      }
    }
    assert.match(tools.get("geochat_setValue")!.description, /停止.*动画/);
    assert.match(tools.get("geochat_getValueString")!.description, /不是图片/);
    assert.match(tools.get("geochat_executeGeoGebraCommands")!.description, /1.*failedCommandIndex/);
    assert.match(tools.get("geochat_status")!.description, /不.*打开/);
    const capture = tools.get("geochat_capture_canvas")!;
    assert.match(capture.description, /图片内容块/);
    const properties = capture.parameters.properties as Record<string, { description: string }>;
    assert.match(properties.exportScale!.description, /默认 1.*0\.25.*不能.*最终/);
    assert.match(properties.transparent!.description, /默认 true/);
    assert.match(properties.dpi!.description, /省略.*Applet/);
  } finally {
    broker.dispose();
    await cleanup();
  }
});

for (const normalizedImageMaxBytes of [undefined, 80]) {
  test(`PNG export preserves attachment metadata and rendering after ${normalizedImageMaxBytes ? "WebP normalization" : "PNG storage"}`, async () => {
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==";
    const { root, tools, cleanup } = await createHarnessServices(normalizedImageMaxBytes);
    const broker = new NativeCanvasBroker();
    const lease = readyLease(broker, "session-png");
    try {
      registerCanvasTools(root, broker, false);
      const execution = execute(tools, "geochat_capture_canvas", {}, "session-png");
      const command = (await lease.next()).value;
      assert.equal(command.toolName, "getPNGBase64");
      lease.reply({ id: command.id, ok: true, result: { ok: true, mediaType: "image/png", base64: pngBase64 } });
      const result = await execution;
      if (result.isError) assert.fail(result.error.message);
      const canonical = result.value as {
        result?: { attachment?: ImageAttachmentRef; base64?: string; mediaType?: string };
      };
      const expectedMediaType = normalizedImageMaxBytes ? "image/webp" : "image/png";
      assert.equal(canonical.result?.mediaType, expectedMediaType);
      assert.ok(canonical.result?.attachment);
      assert.equal(canonical.result?.base64, undefined);
      assert.doesNotMatch(JSON.stringify(canonical), new RegExp(pngBase64));
      assert.ok(result.content.some((block) => block.type === "image"));
      const stored = await root.attachments.readImage(canonical.result.attachment);
      assert.equal(stored.ref.mediaType, expectedMediaType);
      assert.ok(stored.data.byteLength > 0);
    } finally {
      broker.dispose();
      await cleanup();
    }
  });
}

test("tool argument validation rejects unknown, missing, non-finite and unsupported mode values", async () => {
  const { root, tools, cleanup } = await createHarnessServices();
  const broker = new NativeCanvasBroker();
  try {
    registerCanvasTools(root, broker, false);

    const cases: Array<[string, Record<string, unknown>]> = [
      ["geochat_resetCanvas", { surprise: true }],
      ["geochat_setValue", { name: "a" }],
      ["geochat_setValue", { name: "a", value: Number.NaN }],
      [
        "geochat_configureGeoGebraAnimation",
        {
          object: "t",
          from: 0,
          to: 1,
          mode: "forever"
        }
      ]
    ];
    for (const [name, arguments_] of cases) {
      const definition = tools.get(name);
      assert.ok(definition, name);
      await assert.rejects(
        definition.execute(arguments_, { signal: new AbortController().signal } as never),
        /Invalid GeoChat arguments/
      );
    }
  } finally {
    broker.dispose();
    await cleanup();
  }
});

test("frame export returns multiple native images without raw base64 in canonical history", async () => {
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==";
  const { root, tools, cleanup } = await createHarnessServices();
  const broker = new NativeCanvasBroker();
  const lease = readyLease(broker, "frames");
  try {
    registerCanvasTools(root, broker, false);
    const running = execute(tools, "geochat_captureFrames", { count: 2, intervalMs: 100 }, "frames");
    const command = (await lease.next()).value;
    assert.equal(command.toolName, "captureFrames");
    lease.reply({
      id: command.id,
      ok: true,
      result: {
        ok: true,
        frames: [0, 1].map((index) => ({ index, elapsedMs: index * 120, mediaType: "image/png", base64: png })),
        sampling: { count: 2, requestedIntervalMs: 100 },
        limitations: "finite samples"
      }
    });
    const result = await running;
    if (result.isError) assert.fail(result.error.message);
    assert.equal(result.content.filter((item) => item.type === "image").length, 2);
    assert.doesNotMatch(JSON.stringify(result.value), new RegExp(png));
    assert.match(JSON.stringify(result.value), /elapsedMs/);
    assert.match(JSON.stringify(result.value), /attachment/);
  } finally {
    broker.dispose();
    await cleanup();
  }
});

test("native execution rejects script calls before connecting and search hides script-risk commands", async () => {
  const { root, tools, cleanup } = await createHarnessServices();
  const broker = new NativeCanvasBroker();
  try {
    registerCanvasTools(root, broker, false);
    const definition = tools.get("geochat_executeGeoGebraCommands");
    assert.ok(definition);
    await assert.rejects(
      definition.execute({ commands: ['Text("safe", (0,0))', "If(true, 运行更新脚本 [ A ], 0)"] }, {
        signal: new AbortController().signal
      } as never),
      /rejects commands tagged risk:script-execution/
    );
    const result = await tools.execute({
      callId: "safe-search-1" as never,
      name: "geochat_search_commands",
      arguments: { query: "Execute", topN: 12 },
      signal: new AbortController().signal
    });
    if (result.isError) assert.fail(result.error.message);
    const value = result.value as { results: Array<{ tags: string[] }> };
    assert.ok(value.results.every((entry) => !entry.tags.includes("risk:script-execution")));
  } finally {
    broker.dispose();
    await cleanup();
  }
});

test("routes native canvas calls by the executing Harness session and requires an agent", async () => {
  const { root, tools, cleanup } = await createHarnessServices();
  const broker = new NativeCanvasBroker();
  const first = readyLease(broker, "session-a");
  const second = readyLease(broker, "session-b");
  try {
    registerCanvasTools(root, broker, false);
    const firstExecution = execute(tools, "geochat_exists", { name: "A" }, "session-a");
    const secondExecution = execute(tools, "geochat_exists", { name: "B" }, "session-b");
    const firstCommand = await first.next();
    const secondCommand = await second.next();
    assert.equal(firstCommand.done, false);
    assert.equal(secondCommand.done, false);
    assert.deepEqual(firstCommand.value.type === "execute" ? firstCommand.value.args : undefined, { name: "A" });
    assert.deepEqual(secondCommand.value.type === "execute" ? secondCommand.value.args : undefined, { name: "B" });
    if (firstCommand.value.type === "execute")
      first.reply({ id: firstCommand.value.id, ok: true, result: { ok: true, exists: true } });
    if (secondCommand.value.type === "execute")
      second.reply({ id: secondCommand.value.id, ok: true, result: { ok: true, exists: false } });
    assert.equal((await firstExecution).isError, false);
    assert.equal((await secondExecution).isError, false);

    const missingAgent = await tools.execute({
      callId: "missing-agent" as never,
      name: "geochat_exists",
      arguments: { name: "A" },
      signal: new AbortController().signal
    });
    assert.equal(missingAgent.isError, true);
    if (!missingAgent.isError) assert.fail("missing agent unexpectedly succeeded");
    assert.match(missingAgent.error.message, /active Harness session/i);
  } finally {
    broker.dispose();
    await cleanup();
  }
});

function readyLease(broker: NativeCanvasBroker, sessionId: string): NativeCanvasLease {
  const lease = broker.attach(sessionId);
  lease.setReady();
  return lease;
}

async function replyNext(lease: NativeCanvasLease, result: unknown): Promise<void> {
  const next = await lease.next();
  assert.equal(next.done, false);
  assert.equal(next.value.type, "execute");
  if (next.value.type === "execute") assert.equal(lease.reply({ id: next.value.id, ok: true, result }), true);
}

function execute(tools: ToolRuntime, name: string, arguments_: Record<string, unknown>, sessionId: string) {
  return tools.execute({
    callId: `${name}-${sessionId}` as never,
    name,
    arguments: arguments_,
    agent: { id: sessionId } as never,
    signal: new AbortController().signal
  });
}
