import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "bun:test";
import { assertGeoGebraNonceSources } from "../scripts/lib/geogebra-nonce-contract.mjs";

const root = "vendor/geogebra/HTML5/5.0/web3d/";
const bootstrap = readFileSync(`${root}web3d.nocache.js`, "utf8");
const runtime = readFileSync(`${root}88D10604D04F201298F9DADF8F8ABD98.cache.js`, "utf8");

function scriptDocument(nonce: string | null) {
  const scripts: Array<Record<string, unknown>> = [];
  const document = {
    querySelector: () => nonce === null ? null : { nonce, getAttribute: () => nonce },
    getElementById: () => null,
    createElement: () => {
      const element: Record<string, unknown> = {};
      element.setAttribute = (name: string, value: string) => { element[name] = value; };
      return element;
    },
    head: { appendChild: (element: Record<string, unknown>) => { scripts.push(element); } },
    body: {
      appendChild: (element: Record<string, unknown>) => { scripts.push(element); },
      removeChild: () => undefined,
    },
  };
  return { document, scripts };
}

describe("vendored GeoGebra trusted script nonces", () => {
  test("packaging fails closed when a vendor update removes or duplicates a nonce patch", () => {
    expect(() => assertGeoGebraNonceSources(bootstrap, runtime)).not.toThrow();
    expect(() => assertGeoGebraNonceSources("unpatched", runtime)).toThrow("GWT fragment installer");
    expect(() => assertGeoGebraNonceSources(bootstrap, "unpatched")).toThrow("GeoGebra library installer");
    expect(() => assertGeoGebraNonceSources(bootstrap + bootstrap, runtime)).toThrow("GWT fragment installer");
    expect(() => assertGeoGebraNonceSources(bootstrap, runtime + runtime)).toThrow("GeoGebra library installer");
  });
  test("GWT deferred scripts inherit the parent page nonce in their iframe", () => {
    const parent = scriptDocument("parent-page-nonce");
    const iframe = scriptDocument(null);
    const start = bootstrap.indexOf("web3d.__installRunAsyncCode=function(a)");
    const end = bootstrap.indexOf(";function A()", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const context = { web3d: {} as { __installRunAsyncCode?: (code: string) => void }, u: () => iframe.document,
      n: { document: parent.document }, fb: "script", gb: "javascript" };
    runInNewContext(bootstrap.slice(start, end), context);
    context.web3d.__installRunAsyncCode?.("window.fragmentInstalled = true");
    expect(iframe.scripts).toHaveLength(1);
    expect(iframe.scripts[0]?.nonce).toBe("parent-page-nonce");
    expect(iframe.scripts[0]?.text).toBe("window.fragmentInstalled = true");
  });

  test("GeoGebra library scripts inherit the page nonce before insertion", () => {
    const page = scriptDocument("library-page-nonce");
    const copyNonce = runtime.split("\n").find((line) => line.startsWith("function vc(a,b)"));
    const injectLibrary = runtime.split("\n").find((line) => line.startsWith("var bMj=null,cMj;function gMj"));
    expect(copyNonce).toBeDefined();
    expect(injectLibrary).toBeDefined();
    const context = { sid: page.document, wid: () => undefined, tc: () => undefined,
      _9m: "script[nonce]", aan: "script", "Q$n": "library", gMj: undefined as undefined | ((library: unknown, wrapped: boolean) => void) };
    runInNewContext(`${copyNonce}\n${injectLibrary}`, context);
    context.gMj?.({ Fi: () => "trusted-library", Gi: () => "window.libraryInstalled = true" }, false);
    expect(page.scripts).toHaveLength(1);
    expect(page.scripts[0]?.nonce).toBe("library-page-nonce");
    expect(page.scripts[0]?.text).toBe("window.libraryInstalled = true");
  });
});
