import { describe, expect, test } from "bun:test";
import { createHttpHarness } from "./agent-harness-http-utils";

const jsonHeaders = { "content-type": "application/json" };

function validRunPayload(overrides: Record<string, unknown> = {}) {
  return {
    suiteId: "geochat-core",
    suiteVersion: "0.5.7",
    suiteHash: "sha256:suite-fixture",
    configHash: "sha256:config-fixture",
    totalCases: 2,
    config: {
      modelProvider: "openai",
      modelId: "gpt-5.5",
      reasoningEnabled: false
    },
    ...overrides
  };
}

describe("benchmark backend", () => {
  test("persists a run, case results, metrics, and evidence without storing credentials", async () => {
    const { request } = await createHttpHarness();

    const rejected = await request("/v1/benchmark-runs", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(validRunPayload({
        config: { modelProvider: "openai", modelId: "gpt-5.5", apiKey: "must-not-persist" }
      }))
    });
    expect(rejected).toMatchObject({
      status: 400,
      json: { error: "credential_not_allowed" }
    });

    const created = await request("/v1/benchmark-runs", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(validRunPayload())
    });
    expect(created.status).toBe(201);
    expect(created.json.run).toMatchObject({
      suiteId: "geochat-core",
      suiteVersion: "0.5.7",
      suiteHash: "sha256:suite-fixture",
      configHash: "sha256:config-fixture",
      status: "running",
      totalCases: 2,
      completedCases: 0,
      passedCases: 0,
      failedCases: 0,
      completedAt: null
    });
    expect(JSON.stringify(created.json)).not.toContain("must-not-persist");
    const runId = created.json.run.id as string;

    const firstResult = await request(`/v1/benchmark-runs/${encodeURIComponent(runId)}/results`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        caseId: "circle-basic",
        status: "passed",
        score: 1,
        metrics: { latencyMs: 1250, toolCalls: 3 },
        evidenceRefs: [{ type: "agent_run", uri: "agent-run://fixture-1" }]
      })
    });
    expect(firstResult.status).toBe(200);
    expect(firstResult.json.run).toMatchObject({ completedCases: 1, passedCases: 1, failedCases: 0 });
    expect(firstResult.json.result).toMatchObject({ caseId: "circle-basic", status: "passed", score: 1 });

    const failedResult = await request(`/v1/benchmark-runs/${encodeURIComponent(runId)}/results`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        caseId: "triangle-failure",
        status: "failed",
        score: 0,
        metrics: { latencyMs: 800 },
        evidenceRefs: [{ type: "debug_bundle", uri: "file://artifacts/triangle-failure.json" }],
        error: "Expected construction was not found."
      })
    });
    expect(failedResult.status).toBe(200);
    expect(failedResult.json.run).toMatchObject({ completedCases: 2, passedCases: 1, failedCases: 1 });

    const completed = await request(`/v1/benchmark-runs/${encodeURIComponent(runId)}/complete`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        metrics: { passRate: 0.5, durationMs: 3200 },
        evidenceRefs: [{ type: "report", uri: "file://artifacts/report.json" }]
      })
    });
    expect(completed.status).toBe(200);
    expect(completed.json.run).toMatchObject({
      status: "completed",
      metrics: { passRate: 0.5, durationMs: 3200 }
    });
    expect(completed.json.run.completedAt).toBeString();

    const detail = await request(`/v1/benchmark-runs/${encodeURIComponent(runId)}`);
    expect(detail.status).toBe(200);
    expect(detail.json.run.status).toBe("completed");
    expect(detail.json.results).toHaveLength(2);
    expect(detail.json.results.map((item: { caseId: string }) => item.caseId).sort()).toEqual([
      "circle-basic",
      "triangle-failure"
    ]);

    const list = await request("/v1/benchmark-runs?limit=10");
    expect(list.status).toBe(200);
    expect(list.json.runs).toContainEqual(expect.objectContaining({ id: runId, status: "completed" }));

    const lateResult = await request(`/v1/benchmark-runs/${encodeURIComponent(runId)}/results`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ caseId: "late", status: "passed", score: 1 })
    });
    expect(lateResult).toMatchObject({ status: 409, json: { error: "invalid_state" } });
  });

  test("supports cancelled, failed, and interrupted terminal states", async () => {
    const { request } = await createHttpHarness();

    for (const transition of ["cancel", "fail", "interrupt"] as const) {
      const created = await request("/v1/benchmark-runs", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(validRunPayload({ suiteId: `suite-${transition}` }))
      });
      const runId = created.json.run.id as string;
      const transitioned = await request(`/v1/benchmark-runs/${encodeURIComponent(runId)}/${transition}`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          error: transition === "cancel" ? undefined : `${transition} fixture`,
          evidenceRefs: [{ type: "log", uri: `file://artifacts/${transition}.log` }]
        })
      });
      expect(transitioned.status).toBe(200);
      expect(transitioned.json.run.status).toBe(
        transition === "cancel" ? "cancelled" : transition === "fail" ? "failed" : "interrupted"
      );
      expect(transitioned.json.run.completedAt).toBeString();
    }
  });

  test("reconciles runs left running by a previous backend process as interrupted", async () => {
    const databasePath = `/tmp/geochat-benchmark-reconcile-${crypto.randomUUID()}.sqlite`;
    const first = await createHttpHarness({ databasePath });
    const created = await first.request("/v1/benchmark-runs", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(validRunPayload())
    });
    const runId = created.json.run.id as string;

    const restarted = await createHttpHarness({ databasePath });
    const detail = await restarted.request(`/v1/benchmark-runs/${encodeURIComponent(runId)}`);
    expect(detail.status).toBe(200);
    expect(detail.json.run).toMatchObject({
      id: runId,
      status: "interrupted",
      error: "Backend restarted before benchmark completion."
    });
    expect(detail.json.run.completedAt).toBeString();
  });

  test("validates run and result payloads and returns not-found consistently", async () => {
    const { request } = await createHttpHarness();
    const invalid = await request("/v1/benchmark-runs", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ suiteId: "missing-fields" })
    });
    expect(invalid).toMatchObject({ status: 400, json: { error: "invalid_request" } });

    const missing = await request("/v1/benchmark-runs/not-real");
    expect(missing).toMatchObject({ status: 404, json: { error: "not_found" } });
  });
});
