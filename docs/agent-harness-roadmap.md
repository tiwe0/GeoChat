# GeoChat Agent Harness Refactor Roadmap

This roadmap turns the current single-call AI SDK integration into a desktop agent harness with explicit model policy, tool policy, run ledger, workflow enforcement, and repair loops.

## Current State

- `@geochat-ai/app` owns shared function call types and now owns the model capability registry.
- The Solid renderer owns the applet execution surface and UI progress rendering.
- The Bun backend owns the model call loop, run ledger, remote tool requests, local data/assets, and provider policy.
- GeoGebra tools execute in the renderer through durable remote tool requests; the renderer no longer directly calls the model for configured AI runs.

## Target Shape

The harness should have five explicit layers:

1. **Model policy**: provider/model capabilities, limits, default sampling policy, tool support, image support.
2. **Tool policy**: schema, side-effect level, timeout, rollback, display metadata, executor boundary.
3. **Run ledger**: durable run/step/tool records with model request metadata, tool inputs/outputs, canvas snapshots, errors, and usage.
4. **Workflow policy**: enforced geometry sequence, not just prompt guidance.
5. **Geometry semantics**: structured geometry plans, construction recipes, GeoGebra command compilation, and verification targets.

The renderer can remain the executor for GeoGebra applet operations, but it should not remain the only owner of agent policy.

## Step 0: Geometry Semantics Layer

Status: initial shared primitives and post-construction verification enrichment landed.

The harness now has a deterministic geometry layer in `@geochat-ai/app`:

- `geometry-ir.ts` defines typed objects, constraints, construction steps, verification targets, and plan validation.
- `construction-recipes.ts` provides first recipes for parabola vertex marking, function intersections, and ellipse-from-foci-and-point construction.
- `geogebra-compiler.ts` compiles accepted plans into `executeGeoGebraCommands` args instead of relying on raw model-written commands.
- `geometry-verifier.ts` checks object existence, type, and dependency evidence from canvas snapshots, marks relation checks as `unknown` when the canvas context lacks enough numeric metadata, and attaches the latest matching plan verification report to post-construction `getCanvasContext` tool results.
- `geometry-intent-parser.ts` conservatively extracts recipe inputs from the original Chinese problem text for high-frequency patterns such as `y = ...` expressions and coordinate pairs, while preserving explicit model-provided inputs as the source of truth.
- `createGeometryPlan` is now a backend-owned planning tool. It accepts a recipe id plus structured inputs or source problem text, returns the validated plan, compiler output, normalization diagnostics, and ready-to-submit `executeGeoGebraCommands` args without mutating the canvas.
- Runner continuation now blocks raw `executeGeoGebraCommands` when the original prompt matches a deterministic construction recipe and no successful `createGeometryPlan` exists yet. Non-recipe direct commands remain available as `raw_command_fallback` policy decisions, while repair-mode commands are excluded from fallback classification.

This is deliberately shared and pure so the backend runner can ask the model for a structured plan, validate it, compile it, execute the compiled commands through the existing remote bridge, and persist the verification report when the renderer submits the follow-up canvas read. The chat UI now renders both construction-plan cards and geometry-verification cards from durable tool results.

## Step 1: Model Registry

Status: implemented.

`packages/app/src/model-registry.ts` is the single source for provider and model capability data. The renderer configuration UI and backend runner both read from it.

Implemented hardening:

- Provider proxy host allowlists are derived from the provider registry.
- Known providers can now keep explicit custom model IDs instead of silently falling back to a default model. Model policy distinguishes native tool calling from assumed custom-model compatibility and unsupported models. Custom model policy is conservative: tool calling is attempted as compatibility behavior, image input is disabled, and the runner uses a smaller tool-step budget.
- Model capability test cases cover known and custom model gates so image/tool behavior cannot drift. Covered by `tests/agent-harness.test.ts`.

## Step 2: Tool Registry Control Plane

Status: implemented for AI SDK tool metadata, display metadata, timeout policy, rollback defaults, structured policy errors, and shared tool input schemas.

Move from parallel tool definitions to a single policy source.

Implemented changes:

- Extend `FUNCTION_CALL_REGISTRY` with AI SDK input schema metadata or schema factory references. Covered by `packages/app/src/functioncall-schemas.ts`.
- Derive UI display metadata from the registry instead of keeping `TOOL_DISPLAY_INFO` separately.
- Enforce `timeoutMs`, `sideEffectLevel`, and `rollbackPolicy` inside `executeFunctionCall`.
- Split tool policy from tool implementation so front-end, backend, and future MCP executors share the same control plane.

Completion evidence:

- No duplicated tool metadata across shared package and renderer.
- Backend and renderer AI SDK tool titles/descriptions are derived from the shared registry.
- Tool execution wrapper applies timeout and classifies timeout as a structured tool error.
- Write tools have explicit rollback behavior in one place.
- Backend run and remote-tool endpoints reject known tool names with invalid args before accepting them into the harness ledger.

## Step 3: Run Ledger

Status: first implementation landed.

Introduce a durable execution record for every assistant run.

Minimum schema:

- `runId`, `conversationId`, `status`, `modelProvider`, `modelId`, `startedAt`, `completedAt`
- step records: `stepId`, `kind`, `status`, `input`, `output`, `error`, `startedAt`, `completedAt`
- tool records: `toolCallId`, `toolName`, `args`, `result`, `canvasBefore`, `canvasAfter`, `usage`

Storage can start in SQLite through the Bun backend. Renderer should stream tool progress to UI, but persistence should not depend on UI state.

Current implementation stores each run as a typed JSON payload in SQLite. The shared tool registry now also exposes the canonical tool-name list, model-planning tool list, backend-executable subset, renderer-executable subset, remote-bridge tool subset, and AI SDK tool descriptions. Backend AI SDK planning tools are derived from the planning list, backend executor dispatch is derived from the backend-executable subset, and renderer bridge dispatch is constrained to the renderer-executable subset. This keeps model capability, executor ownership, and transport boundary as separate control-plane decisions instead of overloading one tool list.

The local GeoGebra command reference used by `searchGeoGebraCommands` now lives in the shared app package instead of the renderer. The current renderer behavior still uses the same local reference, but the backend can reuse the same search implementation when `searchGeoGebraCommands` moves from the remote bridge into a backend executor.

The backend now has a conservative executor module for backend-owned tools, and runner continuation executes `searchGeoGebraCommands`, `showSolutionSteps`, `showTeachingHint`, and `showAnimationGuide` directly in the backend. When the model selects one of those tools, the backend writes the completed tool record into the run ledger, records the policy/model-step diagnostics, and immediately continues model orchestration until the model either finishes or selects a renderer-owned GeoGebra tool. Renderer-owned GeoGebra tools still stay on the remote bridge because they require live applet access. If the model keeps selecting backend-owned tools past the automatic backend execution limit, the backend fails the run and records a `backend_tool_auto_step_limit` policy decision against the blocked tool call. The chat UI merges returned ledger tool history after each backend runner response, so backend-created display cards can be replayed from durable run state without a renderer execution round-trip.

The manual `POST /v1/agent-runs/:runId/tool-requests` entrypoint and the compatibility `runner/start.firstTool` path now enforce the same remote-bridge subset and reject backend-owned tools before they can be queued for the renderer. This prevents old compatibility paths from bypassing executor ownership after the backend migration.

The remote-tool claim path also enforces the renderer bridge boundary for legacy pending requests already stored in SQLite. If an old backend-owned pending request is encountered during `GET /tool-requests/pending`, the backend marks it failed, writes a failed tool record, closes the run, and records the same dead-letter policy decision path used for exhausted remote-tool retries instead of handing it to the renderer.

The Bun backend now exposes event-style lifecycle endpoints:

- `POST /v1/agent-runs/start`
- `POST /v1/agent-runs/:runId/tools`
- `POST /v1/agent-runs/:runId/finish`

The legacy whole-record `POST /v1/agent-runs` remains as a compatibility path, but the renderer writes new runs through lifecycle events. The backend validates start/tool/finish payloads, rejects invalid terminal-state transitions, and refuses tool updates after a run has finished. Records include model identity, prompt metadata, tool order, tool args/results, canvas before/after snapshots for write operations, errors, duration, and token usage. The settings dialog exposes a read-only "运行记录" diagnostics tab for recent run inspection.

The renderer now talks to those endpoints through the shared `createAgentRunCoordinator` client instead of hand-rolled endpoint strings. Tool and finish writes are queued behind run start, so a tool event cannot race ahead of run creation. Local planner execution awaits backend tool acceptance before mutating the canvas, while configured AI execution runs through the backend paused runner and uses the renderer only as the GeoGebra tool executor.

The backend now also has the first remote tool bridge needed by a backend-owned AI SDK runner:

- `POST /v1/agent-runs/:runId/tool-requests`
- `GET /v1/agent-runs/:runId/tool-requests/pending`
- `POST /v1/agent-runs/:runId/tool-requests/:toolCallId/result`

This lets a backend runner create a tool request, lets the renderer claim pending GeoGebra work, and persists the renderer's result back into the run ledger through the same workflow gate. Remote tool requests are now stored in SQLite as their own durable records, so a paused runner can recover pending requests after the backend restarts. SQLite enforces one remote request per `(run_id, tool_call_id)` through a named unique index, including upgraded legacy tables, so duplicate remote work cannot be introduced by restart or direct persistence drift.

The backend also exposes the first paused runner entrypoint:

- `POST /v1/agent-runs/runner/start`
- `GET /v1/agent-runs/:runId/runner`

`runner/start` creates the run and immediately pauses at the first remote tool request. The compatibility path still accepts a supplied `firstTool`, but any supplied `firstTool` must be a fully valid remote-tool request even when a valid transient model config is also present. The default backend-owned path now generates the initial `getCanvasContext` request deterministically instead of asking the model to return it through `toolChoice`. Start-time model mismatch, model preflight failure, remote-bridge boundary blocks, workflow blocks, and budget blocks all persist failed ledgers plus policy decisions so rejected starts remain inspectable after restart. A transient `model` config is still accepted at start for capability preflight, model identity matching, and image-support checks, but model network IO begins only after the renderer submits the first canvas context. After a remote tool result is submitted, the result endpoint can receive the same transient model config, rebuild AI SDK messages from the durable tool ledger, and either enqueue exactly one next model-selected tool request or finish the run with non-empty model text and coherent token usage. Tool ledger outputs are converted into safe JSON values before they are sent back to the model, so unusual diagnostic values such as `bigint`, `undefined`, functions, symbols, or circular references cannot crash history replay. The shared start and continuation decisions also reject malformed first/tool actions, blank finish text, and invalid usage totals before creating a remote request or successful terminal ledger, so future policy or test-only callers cannot bypass the same action contract that the backend model runner enforces. Model-selected tool calls are converted through the same shared remote-tool validator after tool-call id, name, and args checks, so the AI SDK boundary cannot emit a request shape that the renderer bridge would later reject. If the model returns multiple tool calls in one response, returns a blank tool-call id, reuses any tool-call id that already exists in the durable ledger, reuses an active remote request id for a different queued request, or returns neither a tool call nor displayable text, the backend treats that as a model protocol error instead of silently dropping later tool calls, creating untraceable remote requests, overwriting prior ledger evidence, mutating pending renderer work, or recording an empty successful answer. The backend gives model protocol errors one bounded repair attempt by appending a local protocol-correction message; if the repaired output still violates the single-action contract, the run fails through the structured model-error path. Renderer result submissions must also echo the original request arguments for the claimed tool call before the backend will complete the remote request. If the model preflight or continuation call fails, the backend closes the run as `failed`, stores a redacted bounded error message, and returns a structured `runner_model_error` instead of leaving a recoverable ledger stuck in `running`. Transient image attachments are passed through the backend runner for multimodal models on continuation calls, while the durable ledger stores only `attachmentCount`. The API key and image base64 are used for backend model calls but are not persisted into the run ledger. Split high-volume model-step payloads into queryable tables if run inspection becomes slow.

Runner start and continuation policy decisions are now represented as shared pure functions in `packages/app/src/runner.ts`, so workflow and budget outcomes can be tested without HTTP or SQLite. The Bun route layer remains responsible for model IO, date validation, response status codes, and transaction boundaries. Those decisions are also persisted in `agent_run_policy_decisions` and exposed on runner snapshots, so start enqueue, continuation enqueue, workflow blocks, budget exhaustion, finish, and model errors can be inspected after the run.

Runner continuation attempts are also persisted in `agent_run_model_steps` as lightweight model/strategy step metadata. A model step records provider/model identity, stage, source (`model` for real provider calls, `policy` for harness short-circuits such as repair-context requests), status, input tool count, transient attachment count, output type/tool summary, usage, duration, redacted error text, and bounded model protocol repair diagnostics. Model-step `details` are intentionally narrow: the shared validator currently accepts only positive `protocolRepairAttempts` paired with the same number of non-empty `protocolRepairErrors`, so execution policy, budget, and transport diagnostics stay in policy-decision records instead of turning model steps into arbitrary metadata bags. Policy-decision `details` are also structured by decision kind instead of accepting arbitrary objects: enqueue decisions carry validated remote-tool request details, budget decisions carry a non-negative budget snapshot, model mismatch decisions carry expected/received model pairs, backend auto-limit decisions carry numeric limit diagnostics, dead-letter decisions carry retry state, and boundary/workflow decisions carry only whitelisted request/conflict/run-status metadata. Backend auto-limit failures persist the failed ledger, the triggering continuation decision, and the auto-limit policy decision in one transaction, so crash recovery cannot observe a failed run without the corresponding limit evidence. Durable record identifiers such as run ids, conversation ids, policy decision ids, model-step ids, remote request run ids, and remote execution cache identifiers are validated as non-empty strings; durable numeric counters such as attachment counts, input tool counts, token usage, durations, output text lengths, remote retry attempts, and runner budget fields are validated as non-negative integers; when input, output, and total token counts are all present, total tokens must equal input plus output. Durable timestamps on ledgers, tool records, policy decisions, model steps, remote requests, leases, and remote execution cache entries must parse as valid date strings before shared snapshots are accepted. The SQLite write helpers run the same shared validators before persisting run ledgers, remote requests, policy decisions, and model steps, so invalid internal payloads fail at the storage boundary instead of being written and later hidden by snapshot filters. SQLite itself now also enforces a storage-level subset of those invariants through named `CHECK` constraints, including run/model-step running-vs-terminal completion timestamps, non-negative counters, remote request claim/lease/completion ordering, remote request lifecycle state, and policy decision `allowed` being a real boolean value; startup migration rebuilds older tables when those named constraints are missing and normalizes legacy column-level drift such as missing terminal completion timestamps, stale running completion timestamps, missing remote leases, negative counters, and non-boolean `allowed` values instead of making the desktop app fail to open on recoverable historical rows. The shared validators also enforce policy-decision semantics and lifecycle timing: `allowed` must match the decision kind, each decision kind must appear only in compatible orchestration stages, tool-scoped decisions must carry a complete tool call id/name pair while non-tool decisions must not carry one, and policy-decision details cannot carry unknown fields such as API keys, raw provider responses, or ad hoc debug blobs. Running ledgers/tools/model steps cannot carry completion timestamps or durations, terminal ledgers/tools/model steps must carry a completion timestamp, pending remote requests cannot carry claim/lease/completion timestamps, running remote requests must carry claim and lease timestamps, and terminal remote requests must carry a completion timestamp. Run, tool, and model-step completion timestamps cannot be earlier than their start timestamps, and stored durations must equal the timestamp delta when present. Success records cannot carry error text, running/failed/cancelled run and model-step records cannot carry usage, failed/cancelled model steps cannot carry a successful output summary, and active remote requests cannot carry result or error payloads. Finishing a run as succeeded clears accidental error text, while finishing a run as failed or cancelled clears any stale run-level usage so failure telemetry cannot masquerade as billable successful output. Successful model steps must also expose a coherent output summary: `tool` outputs require a tool call id and tool name without text length, while `finish` outputs require text length without tool ids. The model-step record intentionally does not persist API keys, raw image base64, full prompts, or full provider responses. Runner snapshots expose these records as `modelSteps`, reject child pending requests, policy decisions, or model steps whose run id does not match the primary run, reject any active remote request after the primary run is terminal, reject active remote requests whose tool-call id already exists in the run ledger, reject terminal remote requests inside `pendingToolRequests`, reject model steps whose provider/model identity differs from the run ledger, require child pending tool call ids, policy decision ids, and model-step ids to be unique inside the snapshot, require child records to stay sorted by their persisted event timestamps, and the settings diagnostics tab renders them next to the tool trace, which makes model orchestration auditable without bloating the primary run ledger.

The shared coordinator now exposes active runner snapshots for recent running ledgers. On renderer startup, the desktop client detects a waiting text-only backend runner, replays its ledger tool history into the chat UI, and resumes the pending GeoGebra remote tool request when the current model/API key match the original run. Multimodal runs are intentionally not auto-resumed after restart because image base64 is transient and not persisted.

Remote tool requests now carry a short lease with `claimedBy`, `leaseExpiresAt`, and `attemptCount`. The renderer claims a pending request before executing it, caches the completed local tool result under a stable request fingerprint before submitting it, submits results with the same claim owner, and the backend rejects unclaimed, expired, or mismatched-owner result submissions. A claim attempt is a strict state transition: non-expired running requests and terminal requests are returned unchanged, so another renderer cannot silently refresh or steal an active lease. Claim and result persistence use compare-and-set updates against the previously observed request state, so a stale result returning after model continuation cannot overwrite a reclaimed lease or write stale tool evidence into the run ledger. Pending requests cannot be claimed after the parent run is terminal; the pending endpoint returns `run_closed` and runner snapshots suppress stale active requests for closed runs. Any terminal ledger commit now cancels still-pending or running remote-tool requests in the same SQLite transaction as the terminal run write, whether the close came from manual `/finish`, compatibility ledger sync, model failure, workflow failure, budget exhaustion, remote request dead-letter, or backend auto-step failure, so recovery diagnostics do not retain hidden active work after a run is closed. Invalid claim/dead-letter/cancellation timestamps, lease durations, and retry limits are normalized in the shared remote-tool helpers before lease or terminal state is written; malformed persisted running leases are treated as expired so recovery can reclaim or dead-letter them instead of leaving them stuck. Remote request claim timestamps cannot precede `requestedAt`, lease expiration cannot precede claim time, and completion cannot precede either request or claim time. Terminal remote requests may omit claim data, but cannot keep `claimedBy` or `leaseExpiresAt` without a valid `claimedAt`. Completing a remote request is also a strict shared transition: only a running request whose tool call id, tool name, and args match the submitted ledger tool can become terminal. If the renderer crashes after executing a tool but before the backend accepts the result, the next matching claim can reuse the cached result instead of repeating the GeoGebra side effect; cache reuse requires the cache key, fingerprint, request identity, cached request args, and cached ledger tool args all to match. Terminal remote-tool requests return an idempotent snapshot instead of re-running the model continuation. Expired remote tool requests now have a shared max-attempt limit; once the limit is reached, the backend marks the request as failed, records a failed tool step, closes the run as failed, and persists a `tool_request_dead_letter` policy decision so the harness has an inspectable stuck-run exit.

Runner snapshots now expose backend-owned budget state: `maxToolSteps`, completed ledger tools, active remote tool requests, remaining tool requests, and exhaustion status. The backend checks this budget before accepting a manual remote-tool request and before persisting the next model-selected tool request. Shared snapshot validation also re-derives status, phase, model policy, and budget from the durable run plus active remote-tool requests, so stale or hand-assembled snapshots cannot claim a waiting runner, a different phase, or a different budget than the harness would compute. When a model asks for another tool after the budget is exhausted, the backend closes the runner instead of letting the renderer infer or extend the loop.

Runner snapshots also expose a sanitized model-policy snapshot for the recorded provider/model pair. The snapshot includes known/custom model classification, image support, tool-calling mode, default temperature, and tool-step budget, but never includes API keys or custom base URLs. The settings diagnostics page renders these constraints beside each run so model behavior can be explained without reverse-engineering the registry.

Model identity mismatches are now recorded as first-class policy decisions instead of disappearing as transient HTTP errors. A runner-start mismatch persists a failed ledger with a `model_mismatch` decision, while a continuation mismatch preserves the active pending tool request for retry with the correct model and appends an inspectable `model_mismatch` decision to the runner snapshot.

Compatibility event endpoints now also write policy decisions when they reject a request. Manual `/tools` workflow violations use the `ledger_tool_event` stage, manual `/tool-requests` workflow violations and budget exhaustion use the `remote_tool_request` stage, and the SQLite startup migration upgrades older policy-decision tables so those new stages can be stored without losing existing decisions.

Remote-bridge executor boundary violations are also represented as policy decisions. If a backend-owned tool is supplied as `runner/start.firstTool`, the backend persists a failed run with `tool_boundary_blocked`; if a backend-owned tool is submitted through the manual remote-tool endpoint, the run remains recoverable while the rejected request is recorded under the `remote_tool_request` stage.

The renderer now has a single ledger-to-chat reconstruction path for runner snapshots. It rebuilds user/assistant messages, tool traces, display cards, usage, failed-run text, and finished-run text from the durable run ledger and policy decisions, then reuses that path when resuming a waiting backend runner after restart.

Completion evidence:

- A failed run can be inspected after app restart.
- A successful run shows complete tool order and usage.
- UI message state can be rebuilt from ledger data.

## Step 4: Workflow Policy

Status: implemented for model-driven tool calls, backend ledger writes, and visible runner phases.

Replace prompt-only sequencing with a state machine.

Baseline geometry workflow:

1. Read canvas context.
2. Plan/search commands when needed.
3. Execute commands.
4. Verify via canvas context and optional PNG.
5. Produce explanation/cards.

The system prompt should describe the policy, but the harness should enforce it.

Current enforcement uses an explicit phase-to-tool state machine. The first accepted tool must be `getCanvasContext`; after `executeGeoGebraCommands` succeeds, the runner must verify with `getCanvasContext` or `getPNGBase64` before it can continue construction or generate explanation cards. `setPerspective` is treated as a view adjustment, so it can run before construction without forcing a verification step. The backend also replays prior ledger tools before accepting `/v1/agent-runs/:runId/tools` events, so illegal renderer-side event sequences are rejected with `workflow_blocked` instead of being persisted. Runner snapshots now expose a structured `phase` (`needs_canvas_read`, `planning`, `writing`, `verifying`, `repairing`, `explaining`, `done`) derived from pending remote-tool requests plus durable ledger history, and the settings diagnostics tab displays the same phase labels for run inspection. Local planner execution remains deterministic, but its tool events still have to satisfy the backend ledger workflow gate.

Completion evidence:

- The model cannot directly execute write tools before the initial canvas read unless the policy explicitly allows it.
- Missing verification is classified as an incomplete run.
- The UI can distinguish planning, writing, verifying, repairing, and explaining states.

## Step 5: Repair Loop

Status: backend runner implementation landed for model-driven GeoGebra command failures.

GeoGebra command failures should trigger bounded repair before final failure.

Required behavior:

- Capture failed command, error text, previous successful commands, and current canvas context.
- Ask the model for a corrected command set with a strict retry budget.
- Stop after the retry budget and surface a structured failure card.

Completion evidence:

- A syntactically invalid GeoGebra command can be corrected in a follow-up tool step.
- Repeated failure stops cleanly with a user-readable explanation and ledger evidence.

Current implementation detects unresolved failed `executeGeoGebraCommands` calls in the durable run ledger. The backend runner first forces a `getCanvasContext` remote tool request to capture the post-failure canvas state, then switches to `GEOCHAT_REPAIR_SYSTEM_PROMPT` with failed commands, error text, previous successful commands, current canvas context, and recent tool trace. The repair segment has a one-attempt budget; if the repair command also fails, the backend creates a structured `showSolutionSteps` failure card and then finishes the run. If a later execute succeeds, the run ledger treats the older command failure as resolved while preserving it in the tool trace.

## Step 6: Provider Proxy Policy

Status: first implementation landed.

Tighten `/v1/provider-fetch` from a general proxy into a model-provider channel.

Required behavior:

- Validate target host against provider policy.
- Strip or normalize sensitive headers.
- Enforce request/response size limits.
- Store structured provider errors without leaking full secrets.

Completion evidence:

- Unknown outbound hosts are rejected.
- Oversized bodies are rejected.
- Provider failure responses are preserved enough for debugging.

Current implementation derives allowed provider hosts from the shared model registry, parses and rejects invalid or non-HTTP provider URLs as structured request errors, passes provider context from the renderer, allows a configured custom base URL host explicitly, limits outbound methods to the provider API shapes used by model clients (`GET` and `POST`), rejects malformed base64 request bodies and request bodies on `GET` before contacting upstream, validates outbound header names and string values before constructing `Headers`, strips browser-only, hop-by-hop, proxy, and forwarded request headers while preserving provider authorization headers, strips sensitive provider response headers such as cookies and transport-length metadata, enforces request/response body limits, and converts upstream network/timeout failures into structured `provider_fetch_failed` responses with sanitized error text.
The pure URL/host/method/body-encoding/body/header-shape/header-sanitization policy is covered by `tests/agent-harness.test.ts`.
