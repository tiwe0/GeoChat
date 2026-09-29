import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

type TauriConfig = {
  app: {
    security: {
      csp: string | null;
    };
  };
};

function loadCsp(path: string) {
  const config = JSON.parse(readFileSync(path, "utf8")) as TauriConfig;
  expect(config.app.security.csp).not.toBeNull();
  return config.app.security.csp as string;
}

function parseCsp(policy: string) {
  return new Map(policy
    .split(";")
    .map((directive) => directive.trim())
    .filter(Boolean)
    .map((directive) => {
      const [name, ...sources] = directive.split(/\s+/);
      return [name, sources] as const;
    }));
}

function networkSources(directives: Map<string, string[]>) {
  return [...new Set([...directives.values()]
    .flat()
    .filter((source) => /^(?:https?|wss?):\/\//.test(source)))]
    .sort();
}

describe("Tauri content security policy", () => {
  test("production permits only packaged content and the loopback runtime", () => {
    const policy = loadCsp("src-tauri/tauri.conf.json");
    const directives = parseCsp(policy);

    expect(directives.get("default-src")).toEqual(["'self'", "geochat-bundle:"]);
    expect(directives.get("connect-src")).toEqual([
      "'self'",
      "ipc:",
      "http://ipc.localhost",
      "http://127.0.0.1:*",
    ]);
    expect(directives.get("script-src")).toEqual([
      "'self'",
      "geochat-bundle:",
      "'unsafe-eval'",
      "'wasm-unsafe-eval'",
    ]);
    expect(directives.get("style-src")).toContain("'unsafe-inline'");
    expect(directives.get("img-src")).toEqual([
      "'self'",
      "geochat-bundle:",
      "https://assets.chat-with-geogebra.com",
      "data:",
      "blob:",
    ]);
    expect(directives.get("font-src")).toContain("data:");
    expect(directives.get("worker-src")).toContain("blob:");
    expect(directives.get("style-src")).not.toContain("http://127.0.0.1:*");
    expect(directives.get("font-src")).not.toContain("http://127.0.0.1:*");
    expect(directives.get("worker-src")).not.toContain("http://127.0.0.1:*");
    expect(directives.get("child-src")).not.toContain("http://127.0.0.1:*");
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'self'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);

    expect(networkSources(directives)).toEqual([
      "http://127.0.0.1:*",
      "http://ipc.localhost",
      "https://assets.chat-with-geogebra.com",
    ]);
    expect(policy).not.toContain("ws:");
  });

  test("development adds only the local Vite HMR transport", () => {
    const production = loadCsp("src-tauri/tauri.conf.json");
    const development = loadCsp("src-tauri/tauri.dev.conf.json");
    const directives = parseCsp(development);

    expect(development).not.toBe(production);
    expect(directives.get("connect-src")).toEqual([
      "'self'",
      "ipc:",
      "http://ipc.localhost",
      "http://127.0.0.1:*",
      "ws://127.0.0.1:1421",
    ]);
    expect(networkSources(directives)).toEqual([
      "http://127.0.0.1:*",
      "http://ipc.localhost",
      "https://assets.chat-with-geogebra.com",
      "ws://127.0.0.1:1421",
    ]);
  });
});
