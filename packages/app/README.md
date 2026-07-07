# @geochat-ai/app

`@geochat-ai/app` is the shared contract and policy package used by the desktop
backend, Solid renderer, local tooling, and tests.

It is not a generic utilities bucket. New exports should be added only when a module is
intended to be shared across ownership boundaries.

## Export Classes

### Stable Contracts

These exports describe persisted data, public runtime contracts, or cross-process schemas.
They may be imported by backend, renderer, Tauri-facing code, workers, scripts, and tests.

- conversation and runtime types from `src/index.ts`
- `agent-run-ids`
- `agent-run-review`
- `agent-run-time`
- `attachments`
- `blackboard`
- `functioncalls`
- `functioncall-groups`
- `functioncall-schemas`
- `migration`
- `model-registry`
- `problem-bank`
- `remote-tool`
- `run-coordinator`
- `run-ledger`

Compatibility rule: changing a stable contract requires a migration or an explicit
backward-compatibility note in the relevant tests/docs.

Function-call ownership note: `functioncalls` remains the stable public facade.
The focused modules `functioncall-types`, `functioncall-registry`,
`functioncall-display`, `functioncall-executors`, and
`geogebra-command-normalization` are internal ownership boundaries unless they
are deliberately added to `src/index.ts` and classified here in the same commit.

Function-call schema ownership note: `functioncall-schemas` remains the stable
public schema facade. The grouped modules under `src/functioncall-schemas/`
are internal ownership boundaries for concrete schema definitions unless they
are deliberately added to `src/index.ts` and classified here in the same commit.

### Policy Modules

These exports encode product or orchestration policy shared by multiple callers. They are
allowed to change, but changes should be reviewed as behavior changes rather than helper
refactors.

- `agent-prompts`
- `agent-routing-text`
- `canvas-visual-guidance`
- `geogebra-command-usage`
- `geogebra-style-policy`
- `provider-proxy-policy`
- `workflow-policy`

Compatibility rule: policy changes need targeted harness or renderer tests that prove the
intended behavior.

### Implementation Helpers

These exports are shared implementation building blocks. They are exported today because
backend and renderer code both consume them, but they are not standalone public contracts.

- `advanced-drawing-tools`
- `construction-recipes`
- `geogebra-compiler`
- `geometry-intent-parser`
- `geometry-ir`
- `geometry-verifier`
- `runner`

Compatibility rule: prefer narrower imports and tests around behavior. Do not add new
callers casually; consider a dedicated stable contract first.

### Generated Or Bulky Data

These exports expose generated or vendor-derived reference data. Treat them as opaque
read-only data, not hand-edited source modules.

- `geogebra-command-reference`

Compatibility rule: regenerate or update through the owning data pipeline. Do not make
manual semantic edits directly in generated reference data.

## Adding Exports

Before adding a new export to `src/index.ts`:

1. Choose one export class above.
2. Add a short note here if the module creates a new boundary.
3. Add or update tests that prove the boundary remains stable.
4. Avoid exporting large generated data unless consumers need the shared package boundary.

## Verification

The minimum checks for shared package boundary changes are:

```bash
bun run typecheck
bun test tests/shared-package-export-policy.test.ts tests/functioncall-groups.test.ts tests/model-registry-schema.test.ts tests/agent-harness.test.ts tests/agent-harness-runner-policy.test.ts
```
