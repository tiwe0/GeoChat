# assistant-ui migration plan

- Status: implemented; regression protection remains active
- Last refreshed: 2026-09-29
- Owner area: renderer / assistant workspace

## Goal

Use one `@assistant-ui/react` runtime and one shared message/composer rendering pipeline for window mode, fusion mode, and the fusion transcript, while preserving GeoChat's native-run lifecycle, AI SDK message persistence, renderer tool execution, and fusion spatial navigation.

## Invariants

1. `UIMessage<ChatMessageMetadata>` remains the persisted and transport source of truth.
2. One user submission creates one native run; one renderer tool call executes once.
3. Stop, retry, reconnect, active-run recovery, conversation switching, and canvas replay keep their current semantics.
4. A response keeps one stable shell through submitted, reasoning, tools, text, error, and complete states.
5. Window/transcript scrolling has one owner: assistant-ui. Fusion spatial navigation retains its custom height-window owner.
6. Switching window/fusion mode does not recreate the runtime or lose draft, attachments, messages, or an active run.
7. assistant-ui tool components render only; existing `executeRendererTool` remains the sole executor.

## Sequence

1. Add official `@assistant-ui/react` v0.15 runtime and primitives.
2. Add a GeoChat ExternalStoreRuntime adapter and lossless AI SDK message projection.
3. Build shared assistant-ui message parts, tool UI, user message, assistant message, and composer controls.
4. Replace window thread and transcript with assistant-ui thread primitives.
5. Reuse the shared assistant-ui message renderer inside fusion spatial cards without adding a second scroll owner.
6. Delete superseded hand-written message/composer paths after behavior parity is proven.
7. Run targeted behavior tests, full tests, typecheck, renderer build, chunk safety, and Tauri shell checks. Live visual acceptance remains user-owned.

## Stop condition

All three chat surfaces use the shared assistant-ui runtime/primitives, existing lifecycle tests and new adapter/component contracts pass, and no duplicate message/composer/tool execution path remains.
