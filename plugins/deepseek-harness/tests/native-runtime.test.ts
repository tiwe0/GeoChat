/// <reference lib="dom" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_STATUS_TOOL,
  createCanvasRuntime,
  type CanvasRuntime,
  type CanvasRuntimeController,
  type CanvasRuntimeDependencies,
  type CanvasRuntimeMount
} from "../client/canvas-runtime.ts";
import {
  CANVAS_FRAME_STYLE,
  canvasFrameSourceDocument,
  createCanvasFrameGeneration
} from "../client/isolated-canvas.tsx";
import { GeoChatProductIcon } from "../client/product-icon.tsx";

class FakeElement {
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  id = "";

  appendChild(child: FakeElement) {
    child.remove();
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  replaceChildren(...children: FakeElement[]) {
    for (const child of [...this.children]) child.remove();
    for (const child of children) this.appendChild(child);
  }

  remove() {
    const parent = this.parentElement;
    if (!parent) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
}

class FakeDocument {
  readonly body = new FakeElement();

  createElement() {
    return new FakeElement();
  }
}

class FakeController implements CanvasRuntimeController {
  ready = false;
  api: unknown;
  readonly calls: Array<{ name: string; args: unknown; readOnly?: boolean }> = [];

  setApi(api: unknown) {
    this.api = api;
    this.ready = api !== null;
  }

  runCanvasTransaction<T>(
    options: { readOnly?: boolean; shouldContinue?: () => boolean },
    work: (execute: (toolName: string, args: unknown) => Promise<unknown>) => T | PromiseLike<T>
  ): Promise<T> {
    if (options.shouldContinue?.() === false) return Promise.reject(new DOMException("cancelled", "AbortError"));
    return Promise.resolve(
      work(async (name, args) => {
        if (options.shouldContinue?.() === false) throw new DOMException("cancelled", "AbortError");
        this.calls.push({ name, args, readOnly: options.readOnly });
        await Promise.resolve();
        if (options.shouldContinue?.() === false) throw new DOMException("cancelled", "AbortError");
        return { ok: true, name };
      })
    );
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createFixture() {
  const document = new FakeDocument();
  const controller = new FakeController();
  const mounted = deferred<CanvasRuntimeMount>();
  let mountOptions: Parameters<NonNullable<CanvasRuntimeDependencies["mount"]>>[0] | undefined;
  const mount = (options: NonNullable<typeof mountOptions>) => {
    mountOptions = options;
    return mounted.promise;
  };
  const runtime = createCanvasRuntime(
    { assetBaseUrl: "https://assets.example.test/geogebra/" },
    {
      controller,
      document: document as unknown as Document,
      mount
    }
  );
  return { controller, document, mountOptions: () => mountOptions!, mounted, runtime };
}

test("native runtime mounts immediately in an offscreen parking host and becomes ready", async () => {
  const fixture = createFixture();

  assert.equal(fixture.mountOptions().assetBaseUrl, "https://assets.example.test/geogebra");
  assert.equal(fixture.runtime.stage.parentElement, fixture.runtime.parkingHost);
  assert.equal(fixture.runtime.parkingHost.style.pointerEvents, "none");
  assert.equal(fixture.runtime.stage.style.pointerEvents, "auto");
  assert.equal(CANVAS_FRAME_STYLE.pointerEvents, "auto");
  assert.equal(fixture.runtime.getSnapshot().phase, "loading");

  fixture.mountOptions().onReady({ getXML: () => "<xml />" });
  fixture.mounted.resolve({ applet: {}, dispose() {} });
  await fixture.runtime.ready;

  assert.equal(fixture.controller.ready, true);
  assert.deepEqual(fixture.runtime.getSnapshot(), { phase: "ready" });
});

test("attach reparents one stable stage and stale cleanup cannot detach a newer attachment", () => {
  const fixture = createFixture();
  const first = new FakeElement();
  const second = new FakeElement();

  const detachFirst = fixture.runtime.attach(first as unknown as HTMLElement);
  const detachSecond = fixture.runtime.attach(second as unknown as HTMLElement);
  detachFirst();
  assert.equal(fixture.runtime.stage.parentElement, second);

  detachSecond();
  assert.equal(fixture.runtime.stage.parentElement, fixture.runtime.parkingHost);

  const detachStrictReplay = fixture.runtime.attach(second as unknown as HTMLElement);
  assert.equal(fixture.runtime.stage.parentElement, second);
  detachStrictReplay();
  assert.equal(fixture.runtime.stage.parentElement, fixture.runtime.parkingHost);
});

test("run exposes status plus the exact canvas allowlist and validates arguments", async () => {
  const fixture = createFixture();
  fixture.mountOptions().onReady({});

  assert.deepEqual(await fixture.runtime.run(CANVAS_STATUS_TOOL, {}), {
    ok: true,
    phase: "ready",
    ready: true
  });
  await assert.rejects(() => fixture.runtime.run(CANVAS_STATUS_TOOL, { extra: true }), /Invalid GeoChat/);
  await assert.rejects(() => fixture.runtime.run("notARealTool", {}), /不支持工具/);
  await assert.rejects(() => fixture.runtime.run("getValue", {}), /Invalid GeoChat/);
  await assert.rejects(() => fixture.runtime.run("getValue", { name: "a", extra: true }), /Invalid GeoChat/);

  assert.deepEqual(await fixture.runtime.run("getValue", { name: "a" }), { ok: true, name: "getValue" });
  assert.deepEqual(await fixture.runtime.run("setValue", { name: "a", value: 2 }), { ok: true, name: "setValue" });
  await fixture.runtime.run("sceneReport", {});
  await fixture.runtime.run("captureFrames", { count: 2, intervalMs: 100 });
  await fixture.runtime.run("checkLayout", {});
  await fixture.runtime.run("setTextStyle", { objects: ["label"], fontSize: 12 });
  assert.deepEqual(fixture.controller.calls, [
    { name: "getValue", args: { name: "a" }, readOnly: true },
    { name: "setValue", args: { name: "a", value: 2 }, readOnly: false },
    { name: "sceneReport", args: {}, readOnly: true },
    { name: "captureFrames", args: { count: 2, intervalMs: 100 }, readOnly: true },
    { name: "checkLayout", args: {}, readOnly: false },
    { name: "setTextStyle", args: { objects: ["label"], fontSize: 12 }, readOnly: false }
  ]);
});

test("run delegates cancellation to the shared transaction boundary", async () => {
  const fixture = createFixture();
  fixture.mountOptions().onReady({});
  const abort = new AbortController();
  abort.abort();

  await assert.rejects(() => fixture.runtime.run("getCanvasContext", {}, abort.signal), { name: "AbortError" });
  assert.equal(fixture.controller.calls.length, 0);
});

test("dispose aborts mounting, removes hosts, and disposes a late mount result", async () => {
  const fixture = createFixture();
  let mountDisposed = 0;
  const signal = fixture.mountOptions().signal;

  fixture.runtime.dispose();
  assert.equal(signal?.aborted, true);
  assert.equal(fixture.runtime.stage.parentElement, null);
  assert.equal(fixture.runtime.parkingHost.parentElement, null);
  assert.deepEqual(fixture.runtime.getSnapshot(), { phase: "disposed" });

  fixture.mounted.resolve({ applet: {}, dispose: () => mountDisposed++ });
  await fixture.runtime.ready;
  assert.equal(mountDisposed, 1);
  assert.equal(fixture.controller.ready, false);
  await assert.rejects(() => fixture.runtime.run(CANVAS_STATUS_TOOL, {}), /已关闭/);
});

test("mount failures expose a terse safe error without destroying the reusable stage", async () => {
  const fixture = createFixture();
  fixture.mounted.reject(new Error("secret upstream location"));
  await fixture.runtime.ready;

  assert.deepEqual(fixture.runtime.getSnapshot(), {
    phase: "error",
    message: "GeoGebra 画布加载失败。"
  });
  assert.equal(fixture.runtime.stage.parentElement, fixture.runtime.parkingHost);
});

test("isolated frame document contains one canvas root and safely escaped same-origin runtime script", () => {
  const source = canvasFrameSourceDocument('/geochat-assets/runtime.js?x=1&name="canvas"');

  assert.match(source, /id="geochat-canvas-root"/);
  assert.match(source, /src="\/geochat-assets\/runtime\.js\?x=1&amp;name=&quot;canvas&quot;"/);
  assert.equal((source.match(/<script /g) ?? []).length, 1);
  assert.doesNotMatch(source, /postMessage|fetch\(/);
});

test("product icon uses the existing bundled GeoChat artwork and honors Harness icon sizing", () => {
  const icon = GeoChatProductIcon({ size: 24, className: "guide-icon" });

  assert.equal(icon.type, "img");
  assert.equal(icon.props.alt, "");
  assert.equal(icon.props["aria-hidden"], true);
  assert.equal(icon.props.className, "guide-icon");
  assert.equal(icon.props.width, 24);
  assert.equal(icon.props.height, 24);
  assert.match(icon.props.src, /^data:image\/png;base64,/);
  assert.equal(icon.props.draggable, false);
});

test("a second frame load replaces the runtime and ignores the previous generation", () => {
  const phases: string[] = [];
  const published: Array<CanvasRuntime | null> = [];
  const generation = createCanvasFrameGeneration({
    setPhase: (phase) => phases.push(phase),
    publish: (runtime) => published.push(runtime)
  });
  const first = createFrameRuntime("loading");
  const second = createFrameRuntime("loading");

  generation.replace(() => first.runtime);
  first.emit("ready");
  generation.replace(() => second.runtime);

  assert.equal(first.unsubscribeCount(), 1);
  assert.equal(first.disposeCount(), 1);
  assert.deepEqual(published, [first.runtime, null, second.runtime]);
  assert.equal(phases.at(-1), "loading");

  const phaseCount = phases.length;
  first.emit("error");
  assert.equal(phases.length, phaseCount);

  second.emit("ready");
  assert.equal(phases.at(-1), "ready");
  generation.dispose();
  assert.equal(second.unsubscribeCount(), 1);
  assert.equal(second.disposeCount(), 1);
  assert.deepEqual(published, [first.runtime, null, second.runtime, null]);
});

function createFrameRuntime(initialPhase: "loading" | "ready" | "error") {
  let phase = initialPhase;
  let listener: (() => void) | undefined;
  let unsubscribes = 0;
  let disposals = 0;
  const runtime = {
    getSnapshot: () => (phase === "error" ? { phase, message: "failed" } : { phase }),
    subscribe(next: () => void) {
      listener = next;
      return () => {
        unsubscribes += 1;
      };
    },
    dispose() {
      disposals += 1;
    }
  } as unknown as CanvasRuntime;

  return {
    runtime,
    emit(next: typeof phase) {
      phase = next;
      listener?.();
    },
    unsubscribeCount: () => unsubscribes,
    disposeCount: () => disposals
  };
}
