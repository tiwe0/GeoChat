# Desktop Architecture Refactor Plan

Status: complete for the desktop-only codebase.

Current progress:

- M1 HTTP foundation: complete. Response helpers, CORS/JSON/NDJSON primitives, and path helpers are no longer embedded in `backend/src/http.ts`.
- M2 backend context: complete. Repository/runtime/resource roots and route limits flow through `backend/src/http/context.ts`.
- M3 route groups: complete. Health/assets, conversations, messages, migration, problem bank, provider proxy, read-only agent-run observability, and agent-run write/orchestration routes have been split out of `backend/src/http.ts`.
- M4 runner services: complete. Failure-event persistence/backfill now live in `backend/src/services/agent-run-events.ts`, runner commit orchestration lives in `backend/src/services/agent-run-commits.ts`, runner start orchestration lives in `backend/src/services/agent-run-starts.ts`, remote tool claim/dead-letter handling lives in `backend/src/services/agent-run-remote-tools.ts`, remote tool result continuation lives in `backend/src/services/agent-run-continuations.ts`, manual tool/request write validation lives in `backend/src/services/agent-run-manual-writes.ts`, finish/compatibility ledger writes live in `backend/src/services/agent-run-lifecycle-writes.ts`, remote tool result submission lives in `backend/src/services/agent-run-remote-tool-results.ts`, runner snapshot assembly lives in `backend/src/services/agent-run-runner-snapshots.ts`, and persistence diagnostics live in `backend/src/services/agent-run-diagnostics.ts`.
- M5 renderer slices: complete. Desktop config normalization/storage/runtime state, reusable workbench controls, workbench shell view/dialog/intro state, conversation/message state, Workbench UI action callbacks, chat send workflow, local planner runner workflow, AI SDK backend runner workflow/recovery, MCP debug action executor, the settings dialog, sponsor/QR views, the floating chat/history/blackboard panel, the GeoGebra canvas stage, renderer API/data-access helpers, workbench message/attachment helpers, image attachment state, blackboard panel/resource state, conversation history state, MCP/debug polling state, tool-call/runner snapshot adapters, blackboard context prompt helpers, renderer runner bridge/cache/persistence helpers, LaTeX rendering components, the integrated app chrome, and problem-bank state/resource selection now live outside `src/renderer/src/WorkbenchApp.tsx`.

## Context

GeoChatDesktop is now a Tauri desktop product with a bundled Bun runtime sidecar, a backend JavaScript bundle, a Solid renderer bundle, and SQLite-local persistence. The desktop runtime is centered on local workbench behavior, local persistence, and the packaged app-bundle boundary.

The original architecture problem was not product scope. It was internal shape:

- `backend/src/http.ts` started as a large mixed router, service, validation, persistence, static-asset, migration, provider-proxy, and runner orchestration module.
- Route handlers could reach too many helpers directly, making boundary bugs hard to isolate.
- Shared HTTP concerns such as JSON responses, CORS, NDJSON streaming, path parsing, and scope handling needed to become explicit building blocks.
- The renderer started as a large desktop workbench surface and is being split by stable product panels and workflows rather than transient implementation details.

## Target Shape

Backend layers:

- `backend/src/http.ts`: thin entrypoint that applies CORS and dispatches to route groups.
- `backend/src/http/response.ts`: response helpers, CORS, JSON body parsing, and streaming primitives.
- `backend/src/http/context.ts`: one backend context containing repositories, runtime config, resource roots, and route limits.
- `backend/src/http/routes/*`: route groups for health/assets, conversations, migration, problem bank, agent runs, provider proxy.
- `backend/src/services/*`: stateful application services for runner orchestration, migration import/export, provider proxy, and problem-bank operations.
- `backend/src/db/*`: persistence only. Route modules should not import schema tables directly.

Renderer layers:

- `src/renderer/src/main.tsx`: desktop entrypoint only.
- `src/renderer/src/WorkbenchApp.tsx`: composition shell that wires state slices and product panels together.
- `src/renderer/src/ConfigDialog.tsx`: settings, model config, app-bundle update, and MCP preferences.
- `src/renderer/src/ProblemBankPage.tsx`: problem-bank browsing surface.
- `src/renderer/src/GeoGebraStage.tsx`: canvas/applet surface.
- `src/renderer/src/ChatPanel.tsx`, `src/renderer/src/workbench-*.ts`: chat, history, blackboard, runner, API, and problem-bank state slices.

Shared package layers:

- `packages/app/src/*`: pure policy, schemas, model registry, runner state transitions, GeoGebra style policy, and serializable contracts.
- Backend and renderer should consume shared contracts instead of duplicating policy checks.

## Milestones

### M1: HTTP Foundation

- Extract response helpers from `backend/src/http.ts`.
- Extract route path parsing helpers from `backend/src/http.ts`.
- Add focused tests for helper behavior where practical.
- Keep `handleRequest` behavior byte-compatible for existing tests.

Verification:

```sh
bun run typecheck
bun test tests/agent-harness.test.ts
```

### M2: Backend Context

- Move repository/runtime/resource-root initialization into `backend/src/http/context.ts`.
- Pass an explicit context to route dispatch and services.
- Preserve current singleton behavior for the local backend process.
- Keep tests able to use `GEOCHAT_DESKTOP_DB_PATH` before importing `backend/src/http`.

Verification:

```sh
bun run typecheck
bun test tests/agent-harness.test.ts
```

### M3: Route Groups

- Health and GeoGebra asset routes are split.
- Conversations, messages, and migration routes are split.
- Problem-bank routes are split.
- Provider proxy and agent-run observability/write routes are split.

Acceptance:

- `backend/src/http.ts` should mostly compose route groups and shared middleware.
- Route modules should depend on context/services, not raw Drizzle schema tables.
- Agent-run lifecycle tests remain green after each slice.

### M4: Runner Services

- Move runner start, continuation, terminal close, remote request claim/result, failure events, and policy-decision persistence into services.
- Keep pure transition logic in `@geochat-ai/app`.
- Keep persistence transactions in repositories.

Acceptance:

- The route layer validates HTTP shape and delegates orchestration.
- Runner services expose narrow methods that tests can call directly in future suites.

### M5: Renderer Slices

- Split `WorkbenchApp.tsx` by stable desktop panels and workflows.
- Keep the first screen as the actual desktop workbench.
- Preserve model-provider behavior and desktop key storage boundaries.

Acceptance:

- UI state remains local and explicit.
- No Web routing or public marketing shell reappears.

## Non-Goals

- Large visual redesign while backend boundaries are being repaired.
- New dependencies unless a specific architecture step cannot be done cleanly with existing tools.

## Completion Gate

The refactor is complete only when:

- The backend router is split into route groups and services with explicit context.
- `backend/src/http.ts` is no longer the owner of persistence, route parsing, response helpers, migration validation, provider proxy internals, and runner orchestration all at once.
- Tests prove desktop-only behavior, runner persistence, SQLite retry behavior, migration import/export, provider proxy policy, and 2D style policy still hold.
- `bun run typecheck`, `bun test tests/agent-harness.test.ts`, and `bun run tauri:prepare` pass.
