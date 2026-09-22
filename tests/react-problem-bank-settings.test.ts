import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  fetchProblemSets,
  parseProblemImportResponse,
  parseProblemSetList,
  reindexProblemBank,
} from "../src/renderer-react/src/features/desktop/settings/problemBankApi";

const set = {
  id: "set-all",
  slug: "all",
  title: "All problems",
  description: "Complete local bank",
  kind: "curated" as const,
  problemCount: 12,
};

describe("React problem-bank settings", () => {
  test("parses the typed problem-bank responses", () => {
    expect(parseProblemSetList({ sets: [set] })).toEqual({ sets: [set] });
    expect(parseProblemImportResponse({ imported: 12, sets: 1, skipped: false })).toEqual({
      imported: 12,
      sets: 1,
      skipped: false,
    });
    expect(() => parseProblemSetList({ sets: [{ ...set, problemCount: "12" }] })).toThrow();
  });

  test("loads local problem sets with desktop authentication", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const request = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Response.json({ sets: [set] });
    }) as typeof fetch;

    await expect(fetchProblemSets("http://127.0.0.1:17365", "secret", { request })).resolves.toEqual({ sets: [set] });
    expect(calls[0]?.url).toBe("http://127.0.0.1:17365/v1/problem-sets");
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(calls[0]?.init?.cache).toBe("no-store");
  });

  test("reindexes through the native backend route", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const request = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Response.json({ imported: 12, sets: 1, skipped: false });
    }) as typeof fetch;

    await expect(reindexProblemBank("http://127.0.0.1:17365", null, request)).resolves.toMatchObject({ imported: 12 });
    expect(calls[0]?.url).toBe("http://127.0.0.1:17365/v1/problem-bank/import");
    expect(calls[0]?.init?.method).toBe("POST");
  });

  test("wires the problem bank into the settings navigation", () => {
    const source = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/SettingsPanel.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('["model", "problemBank", "general", "about"]');
    expect(source).toContain("<ProblemBankSettings />");
  });
});
