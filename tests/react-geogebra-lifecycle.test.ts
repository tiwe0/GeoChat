import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { GeoGebraController } from "../src/renderer-react/src/geogebra/controller";
import {
  mountGeoGebra,
  type GeoGebraApi,
} from "../src/renderer-react/src/geogebra/ggbdeploy-wrapper";

type AppletOnLoad = (api: GeoGebraApi) => void;

class FakeStyle {
  [property: string]: unknown;

  setProperty(property: string, value: string) {
    this[property] = value;
  }

  removeProperty(property: string) {
    delete this[property];
  }
}

class FakeClassList {
  private readonly values = new Set<string>();

  contains(value: string) {
    return this.values.has(value);
  }

  add(value: string) {
    this.values.add(value);
  }
}

class FakeElement {
  id = "";
  rel = "";
  href = "";
  name = "";
  content = "";
  async = false;
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  parentElement: FakeElement | null = null;
  readonly style = new FakeStyle();
  readonly classList = new FakeClassList();
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  clientWidth = 900;
  clientHeight = 620;
  replaceChildrenCount = 0;

  constructor(readonly tagName = "DIV") {}

  appendChild(child: FakeElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
    this.parentElement = null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getBoundingClientRect() {
    return { width: this.clientWidth, height: this.clientHeight };
  }

  querySelector<T>() {
    return null as T | null;
  }

  querySelectorAll<T>() {
    return [] as T[];
  }

  replaceChildren() {
    this.replaceChildrenCount += 1;
    this.children.length = 0;
  }
}

class FakeDocument {
  readonly head = new FakeElement("HEAD");

  getElementById(id: string) {
    return this.head.children.find((element) => element.id === id) ?? null;
  }

  createElement(tagName: string) {
    return new FakeElement(tagName.toUpperCase());
  }
}

class FakeApplet {
  readonly removeCalls: unknown[][] = [];
  readonly injectCalls: unknown[][] = [];
  readonly codebaseCalls: unknown[][] = [];
  readonly onLoad: AppletOnLoad;

  constructor(parameters: { appletOnLoad: AppletOnLoad }) {
    this.onLoad = parameters.appletOnLoad;
  }

  inject(...args: unknown[]) {
    this.injectCalls.push(args);
  }

  setHTML5Codebase(...args: unknown[]) {
    this.codebaseCalls.push(args);
  }

  removeExistingApplet(...args: unknown[]) {
    this.removeCalls.push(args);
  }
}

class FakeBrowserWindow {
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  readonly GGBApplet: typeof FakeAppletConstructor;

  constructor() {
    this.GGBApplet = FakeAppletConstructor;
  }

  requestAnimationFrame(_callback: FrameRequestCallback) {
    return 1;
  }

  cancelAnimationFrame(_handle: number) {}

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event) {
    for (const listener of this.listeners.get(event.type) ?? []) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
    return true;
  }
}

class FakeAppletConstructor {
  constructor(_version: number, parameters: { appletOnLoad: AppletOnLoad }) {
    const applet = new FakeApplet(parameters);
    applets.push(applet);
    return applet;
  }
}

const originalGlobals = {
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  MutationObserver: globalThis.MutationObserver,
  ResizeObserver: globalThis.ResizeObserver,
  sessionStorage: globalThis.sessionStorage,
  window: globalThis.window,
};

let document: FakeDocument;
let applets: FakeApplet[];
let browserWindow: FakeBrowserWindow;

function installBrowserHarness() {
  document = new FakeDocument();
  applets = [];
  browserWindow = new FakeBrowserWindow();

  Object.assign(globalThis, {
    document,
    HTMLElement: FakeElement,
    MutationObserver: undefined,
    ResizeObserver: undefined,
    sessionStorage: { removeItem: (_key: string) => undefined },
    window: browserWindow,
  });
}

function restoreBrowserHarness() {
  Object.assign(globalThis, originalGlobals);
}

async function finishAssetLoad<T>(mount: Promise<T>) {
  const stylesheet = document.head.children.find((element) => element.rel === "stylesheet");
  stylesheet?.onload?.();
  return mount;
}

function createHost() {
  const stage = new FakeElement();
  const host = new FakeElement();
  stage.appendChild(host);
  return host as unknown as HTMLElement;
}

describe("GeoGebra mount lifecycle", () => {
  beforeAll(installBrowserHarness);
  beforeEach(() => {
    applets.length = 0;
  });
  afterAll(restoreBrowserHarness);

  test("rejects when an initial GeoGebra asset never finishes loading", async () => {
    const mount = mountGeoGebra({
      container: createHost(),
      backendBaseUrl: "http://127.0.0.1:8787",
      initializationTimeoutMs: 5,
      onReady: () => undefined,
    });

    await expect(mount).rejects.toThrow("样式表加载超时");
  });

  test("StrictMode effect replay aborts the first in-flight mount before it constructs an applet", async () => {
    const host = createHost();
    const firstAbort = new AbortController();
    const firstReady: GeoGebraApi[] = [];
    const secondReady: GeoGebraApi[] = [];

    const firstMount = mountGeoGebra({
      container: host,
      backendBaseUrl: "http://127.0.0.1:8787",
      signal: firstAbort.signal,
      onReady: (api) => firstReady.push(api),
    });
    firstAbort.abort();
    const secondMount = mountGeoGebra({
      container: host,
      backendBaseUrl: "http://127.0.0.1:8787",
      onReady: (api) => secondReady.push(api),
    });

    const firstResult = firstMount.catch((error: unknown) => error);
    const mounted = await finishAssetLoad(secondMount);
    const cancellation = await firstResult;

    expect(cancellation).toBeInstanceOf(Error);
    expect((cancellation as Error).name).toBe("AbortError");
    expect(applets).toHaveLength(1);
    expect(firstReady).toHaveLength(0);

    const api = { getXML: () => "second" };
    applets[0]!.onLoad(api);
    expect(secondReady).toEqual([api]);
    mounted.dispose();
  });

  test("a late dispose from an old effect cannot remove the applet mounted by the replacement effect", async () => {
    const host = createHost();
    const first = await finishAssetLoad(mountGeoGebra({
      container: host,
      backendBaseUrl: "http://127.0.0.1:8787",
      onReady: () => undefined,
    }));
    const second = await mountGeoGebra({
      container: host,
      backendBaseUrl: "http://127.0.0.1:8787",
      onReady: () => undefined,
    });

    first.dispose();

    expect(applets).toHaveLength(2);
    expect(applets[0]!.removeCalls).toHaveLength(0);
    expect((host as unknown as FakeElement).replaceChildrenCount).toBe(0);

    second.dispose();
    expect(applets[1]!.removeCalls).toHaveLength(1);
    expect((host as unknown as FakeElement).replaceChildrenCount).toBe(1);
  });

  test("a stale applet callback cannot revive or replace the current controller API", async () => {
    const host = createHost();
    const controller = new GeoGebraController();
    const firstAbort = new AbortController();
    const first = await finishAssetLoad(mountGeoGebra({
      container: host,
      backendBaseUrl: "http://127.0.0.1:8787",
      signal: firstAbort.signal,
      onReady: (api) => controller.setApi(api),
    }));
    firstAbort.abort();
    first.dispose();
    controller.setApi(null);

    const second = await mountGeoGebra({
      container: host,
      backendBaseUrl: "http://127.0.0.1:8787",
      onReady: (api) => controller.setApi(api),
    });
    const oldApi = { getXML: () => "old" };
    const currentApi = { getXML: () => "current" };

    applets[0]!.onLoad(oldApi);
    expect(controller.ready).toBe(false);
    applets[1]!.onLoad(currentApi);
    expect(controller.ready).toBe(true);
    expect(controller.getCanvasXml()).toBe("current");
    applets[0]!.onLoad(oldApi);
    expect(controller.getCanvasXml()).toBe("current");

    second.dispose();
  });

  test("reports a finite initialization timeout when the injected runtime never becomes ready", async () => {
    const errors: Error[] = [];
    const mounted = await finishAssetLoad(mountGeoGebra({
      container: createHost(),
      backendBaseUrl: "http://127.0.0.1:8787",
      initializationTimeoutMs: 5,
      onReady: () => undefined,
      onError: (error) => errors.push(error),
    }));

    await Bun.sleep(15);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("初始化超时");
    mounted.dispose();
  });

  test("ready, dispose, and abort each suppress a stale initialization timeout", async () => {
    const readyErrors: Error[] = [];
    const readyMount = await finishAssetLoad(mountGeoGebra({
      container: createHost(),
      backendBaseUrl: "http://127.0.0.1:8787",
      initializationTimeoutMs: 5,
      onReady: () => undefined,
      onError: (error) => readyErrors.push(error),
    }));
    applets.at(-1)!.onLoad({});

    const disposedErrors: Error[] = [];
    const disposedMount = await mountGeoGebra({
      container: createHost(),
      backendBaseUrl: "http://127.0.0.1:8787",
      initializationTimeoutMs: 5,
      onReady: () => undefined,
      onError: (error) => disposedErrors.push(error),
    });
    disposedMount.dispose();

    const abortController = new AbortController();
    const abortedErrors: Error[] = [];
    const abortedMount = await mountGeoGebra({
      container: createHost(),
      backendBaseUrl: "http://127.0.0.1:8787",
      initializationTimeoutMs: 5,
      signal: abortController.signal,
      onReady: () => undefined,
      onError: (error) => abortedErrors.push(error),
    });
    abortController.abort();

    await Bun.sleep(15);

    expect(readyErrors).toHaveLength(0);
    expect(disposedErrors).toHaveLength(0);
    expect(abortedErrors).toHaveLength(0);
    readyMount.dispose();
    abortedMount.dispose();
  });

  test("reports a deferred GeoGebra bootstrap error once and removes initialization listeners", async () => {
    const errors: Error[] = [];
    const mounted = await finishAssetLoad(mountGeoGebra({
      container: createHost(),
      backendBaseUrl: "http://127.0.0.1:8787",
      initializationTimeoutMs: 50,
      onReady: () => undefined,
      onError: (error) => errors.push(error),
    }));
    const event = Object.assign(new Event("error"), {
      error: new Error("web3d bootstrap failed"),
      filename: "app://localhost/vendor/geogebra/web3d.nocache.js",
      message: "web3d bootstrap failed",
    });

    browserWindow.dispatchEvent(event);
    browserWindow.dispatchEvent(event);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("web3d bootstrap failed");
    expect(browserWindow.listeners.get("error")?.size ?? 0).toBe(0);
    expect(browserWindow.listeners.get("unhandledrejection")?.size ?? 0).toBe(0);
    mounted.dispose();
  });
});
