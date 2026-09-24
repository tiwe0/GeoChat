import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { ProblemSetSummary } from "@geochat-ai/app";
import {
  appendProblemPage,
  catalogToProblemSets,
  filterProblemSets,
  normalizeProblemMarkdown,
  shouldPredictivelyPrefetch,
} from "../src/renderer-react/src/components/ProblemBankSidecar";

const sets: ProblemSetSummary[] = [
  {
    id: "geometry",
    slug: "geometry-local",
    title: "几何构造精选",
    description: "本地几何题",
    kind: "curated",
    problemCount: 24,
    source: "local",
  },
  {
    id: "cloud-algebra",
    slug: "cloud-algebra",
    title: "Cloud Algebra",
    description: "Remote exercises",
    kind: "imported",
    problemCount: 120,
    source: "cloud",
  },
];

describe("problem-bank sidecar", () => {
  test("filters title, description, and slug without changing the original order", () => {
    expect(filterProblemSets(sets, "几何")).toEqual([sets[0]]);
    expect(filterProblemSets(sets, "REMOTE")).toEqual([sets[1]]);
    expect(filterProblemSets(sets, "cloud-algebra")).toEqual([sets[1]]);
    expect(filterProblemSets(sets, "   ")).toEqual(sets);
  });

  test("is wired as an animated, retractable companion card", () => {
    const panelSource = readFileSync(
      new URL("../src/renderer-react/src/components/AssistantPanel.tsx", import.meta.url),
      "utf8",
    );
    const sidecarSource = readFileSync(
      new URL("../src/renderer-react/src/components/ProblemBankSidecar.tsx", import.meta.url),
      "utf8",
    );
    expect(panelSource).toContain("<LibraryBooksOutlined");
    expect(panelSource).toContain('aria-expanded={problemBankOpen}');
    expect(sidecarSource).toContain('id="copilot-problem-bank-sidecar"');
    expect(panelSource).toContain("<AnimatePresence");
    expect(panelSource).toContain('height: "100%"');
    expect(panelSource).toContain("<ProblemBankSidecar onClose={closeProblemBank} />");
    expect(panelSource).toContain("onPointerDown={panelWindow.startDragging}");
    expect(panelSource).toContain("onPointerMove={movePanel}");
    expect(panelSource).toContain("problemBankRestorePositionRef.current = null;");
    expect(panelSource).toContain("resolvePanelWindowHost(panel)");
    expect(panelSource).not.toContain("const host = panel?.parentElement;");
    expect(sidecarSource).toContain("loadProblemBankPage");
    expect(sidecarSource).toContain("onScroll={handleBodyScroll}");
    expect(sidecarSource).toContain("syncProblemBankMetadata");
    expect(sidecarSource).toContain("<ProblemMarkdown>");
    expect(sidecarSource).toContain("plugins={STREAMDOWN_PLUGINS}");
    expect(sidecarSource).toContain("loadProblemDetail");
    expect(sidecarSource).toContain('loading="lazy"');
    expect(sidecarSource).toContain('className="problem-bank-detail-image-fallback"');
    expect(sidecarSource).toContain('select\n                variant="standard"');
    expect(sidecarSource).toContain("<ProblemDetailView");
    expect(sidecarSource).toContain('<AnimatePresence initial={false} mode="wait">');
    expect(sidecarSource).toContain("<ProblemIndexSkeleton />");
    expect(sidecarSource).toContain("<ProblemDetailSkeleton />");
    expect(sidecarSource).toContain("onPointerEnter={() => onPrefetchProblem(problem)}");
    expect(sidecarSource).toContain("pagePrefetches.current");
    expect(sidecarSource).toContain("detailPrefetches.current");
    expect(sidecarSource).not.toContain('t("problemBank.cloudLazyDescription")');
  });

  test("avoids predictive downloads on constrained or offline connections", () => {
    expect(shouldPredictivelyPrefetch(undefined, true)).toBe(true);
    expect(shouldPredictivelyPrefetch({ effectiveType: "4g" }, true)).toBe(true);
    expect(shouldPredictivelyPrefetch({ saveData: true }, true)).toBe(false);
    expect(shouldPredictivelyPrefetch({ effectiveType: "2g" }, true)).toBe(false);
    expect(shouldPredictivelyPrefetch({ effectiveType: "slow-2g" }, true)).toBe(false);
    expect(shouldPredictivelyPrefetch({ effectiveType: "4g" }, false)).toBe(false);
  });

  test("maps the lightweight cloud catalog without eagerly loading problem pages", () => {
    const mapped = catalogToProblemSets({
      releaseId: "r1",
      channel: "internal",
      cloudBaseUrl: "https://problem-bank.example.com",
      banks: [{
        bankId: "geometry",
        bankSlug: "geometry",
        title: "Geometry",
        description: null,
        kind: "dataset",
        problemCount: 400,
        datasetId: "example/geometry",
        reusePolicy: "allowed",
      }],
    });
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({
      id: "cloud:r1:geometry",
      source: "cloud",
      problemCount: 400,
      bankSlug: "geometry",
    });
  });

  test("appends waterfall pages while de-duplicating retried rows", () => {
    const existing = [{ id: "p1", promptPreview: "one" }];
    const next = appendProblemPage(existing, {
      releaseId: "r1",
      bankSlug: "geometry",
      cursor: "1",
      nextCursor: null,
      items: [
        { id: "p1", promptPreview: "duplicate" },
        { id: "p2", promptPreview: "two" },
      ],
    });
    expect(next.map((item) => item.id)).toEqual(["p1", "p2"]);
  });

  test("repairs common dataset math artifacts and preserves problem line breaks", () => {
    expect(normalizeProblemMarkdown(
      "2. $2 \\vec{a}+\\vec{b}=， 3,18 ＼mathrm{~, ~ 则 ~} \\vec{a}$\nA. $1$\nB. $2$",
    )).toBe(
      "2. $2 \\vec{a}+\\vec{b}=(3,18)\\text{，则 } \\vec{a}$  \nA. $1$  \nB. $2$",
    );
    expect(normalizeProblemMarkdown("\\textbf{Solution:} result\\\\\nnext"))
      .toBe("**Solution:** result  \nnext");
    expect(normalizeProblemMarkdown("$A=\\{x|| x \\mid \\leqslant 2\\}$"))
      .toBe("$A=\\{x \\mid |x| \\leqslant 2\\}$");
  });
});
