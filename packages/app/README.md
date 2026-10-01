# @geochat-ai/app

`@geochat-ai/app` owns cross-process contracts and policies shared by the desktop backend,
React renderer, local tooling, and tests. It is not a generic utilities bucket.

## Export Classes

### Stable Contracts

New production imports should use a domain subpath:

- `contracts` — chat, attachment, and cross-boundary runtime contracts.
- `agent-run` — run ledger, lifecycle identifiers, review, timing, and thinking policy.
- `functioncalls` — tool names, argument shapes, display metadata, and safe registry lookups.
- `geometry` — geometry planning, compilation, verification, and GeoGebra protocol.
- `models` — model catalog snapshots, discovery contracts, and provider policy.
- `problem-bank` — problem-bank schemas and DTOs.

Compatibility subpaths such as `desktop-contracts`, `model-registry`, and
`model-discovery` remain available for existing consumers. New code should prefer the
domain subpaths above.

The package root contains only frequently used stable contracts plus structured logging.
Policy modules and implementation helpers do not belong in the root barrel.

### Policy Modules

Policy modules such as `agent-prompts`, `workflow-policy`, and provider proxy rules are
owned by a domain facade or remain package-internal. Changes require focused behavioral
tests.

### Implementation Helpers

Focused source modules under `src/` are internal implementation boundaries. They may be
re-exported by a domain facade, but backend and renderer code must never reach into
`packages/app/src/*` directly.

### Generated Or Bulky Data

`geogebra-command-reference-data` is generated or vendor-derived reference data. It is
not exported from the package root or as a package subpath. Consumers use focused search
and lookup APIs; do not make manual semantic edits directly in generated reference data.

## Snapshot Isolation

Registry storage is not a public mutation surface. Public registry snapshots and lookup
results return isolated copies. Compatibility registry arrays are frozen at runtime and
deprecated in favor of snapshot and lookup APIs.

## Adding Exports

1. Choose the narrowest existing domain subpath.
2. Keep internal registry storage and generated data private.
3. Add export-policy and isolation coverage.
4. Run the shared package, boundary, and renderer chunk checks.

## Verification

```bash
bun test tests/shared-package-export-policy.test.ts tests/model-registry-schema.test.ts tests/agent-harness.test.ts
bun run typecheck
bun run tauri:renderer:build
```
