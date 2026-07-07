import type { GeoGebraLoadMessage } from "./geogebra-types";

let scriptLoadPromise: Promise<void> | undefined;

export function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

export async function waitForDocumentReady() {
  if (document.readyState !== "loading") {
    await nextAnimationFrame();
    return;
  }
  await new Promise<void>((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
  await nextAnimationFrame();
}

export async function waitForAppletHost(root: HTMLElement, expectedId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const attachedById = document.getElementById(expectedId) === root;
    const rect = root.getBoundingClientRect();
    if (root.isConnected && attachedById && rect.width > 0 && rect.height > 0) {
      await nextAnimationFrame();
      await nextAnimationFrame();
      return document.getElementById(expectedId) === root && root.isConnected;
    }
    await wait(50);
  }
  return false;
}

export function ensureGeoGebraBaseMeta(codebase: string) {
  const legacyMeta = document.querySelector('meta[name="web3d::baseUrl"]');
  legacyMeta?.parentElement?.removeChild(legacyMeta);
  const existingMeta = document.querySelector('meta[name="web3d::gwt:property"]');
  if (existingMeta) {
    existingMeta.setAttribute("content", `baseUrl=${codebase}`);
    return;
  }
  const meta = document.createElement("meta");
  meta.setAttribute("name", "web3d::gwt:property");
  meta.setAttribute("content", `baseUrl=${codebase}`);
  document.head.appendChild(meta);
}

export async function probeAsset(label: string, url: string): Promise<GeoGebraLoadMessage> {
  try {
    const response = await fetch(url, { method: "HEAD", mode: "no-cors", cache: "force-cache" });
    return {
      label,
      status: response.ok || response.type === "opaque" ? "ok" : "error",
      detail: response.type === "opaque" ? `reachable ${url}` : `${response.status} ${url}`
    };
  } catch (error) {
    return {
      label,
      status: "error",
      detail: `${error instanceof Error ? error.message : String(error)} ${url}`
    };
  }
}

export function resourceUrlFromTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return "";
  if (target instanceof HTMLScriptElement) return target.src;
  if (target instanceof HTMLLinkElement) return target.href;
  if (target instanceof HTMLImageElement) return target.src;
  return target.getAttribute("src") || target.getAttribute("href") || "";
}

export function isGeoGebraLoadResourceUrl(url: string, assetBase: string) {
  return Boolean(url && (url.startsWith(assetBase) || url.includes("/web3d/") || url.includes("/geogebra-assets")));
}

export function loadScript(scriptUrl: string) {
  if (window.GGBApplet) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      callback();
    };
    const timeoutId = window.setTimeout(() => {
      settle(() => reject(new Error(`Timed out loading ${scriptUrl}`)));
    }, 15_000);
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
    if (existingScript) {
      if (existingScript.dataset.geochatLoaded === "true") {
        settle(resolve);
        return;
      }
      existingScript.addEventListener("load", () => settle(resolve), { once: true });
      existingScript.addEventListener("error", () => settle(() => reject(new Error(`Failed to load ${scriptUrl}`))), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => {
      script.dataset.geochatLoaded = "true";
      settle(resolve);
    };
    script.onerror = () => settle(() => reject(new Error(`Failed to load ${scriptUrl}`)));
    document.head.appendChild(script);
  }).catch((error) => {
    scriptLoadPromise = undefined;
    throw error;
  });
  return scriptLoadPromise;
}

export function readElementSize(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width || element.clientWidth || window.innerWidth || 1280)),
    height: Math.max(1, Math.round(rect.height || element.clientHeight || window.innerHeight || 720))
  };
}

export function readAppletContainerSize(root: HTMLElement) {
  const stage = root.parentElement instanceof HTMLElement ? root.parentElement : root;
  return readElementSize(stage);
}
