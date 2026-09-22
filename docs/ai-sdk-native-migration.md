# AI SDK native migration

This document records the boundary between AI SDK responsibilities and GeoChat domain logic.

| Capability | Previous implementation | Native AI SDK mechanism | Status |
| --- | --- | --- | --- |
| Agent loop and UI streaming | Manual `streamText` -> `toUIMessageStream` -> response assembly | `ToolLoopAgent` + `createAgentUIStreamResponse` | Migrated |
| Frontend chat/tool continuation | Custom runner client and polling coordinator | `useChat`, `DefaultChatTransport`, `onToolCall`, `addToolOutput` | Migrated |
| Skill selection output | JSON-only prompt plus fenced/raw JSON recovery parser | `generateText` + `Output.object` + Zod | Migrated |
| Provider lookup | Provider-specific conditional chain | Request-scoped `createProviderRegistry` | Migrated |
| Tool-call UI state | Browser-side remote-tool cache and request records | AI SDK UI message tool parts | Migrated |
| Tool availability by phase | Custom runner loop | `ToolLoopAgent.prepareStep.activeTools` backed by GeoChat policy | Migrated |
| Tool argument validation | Shared JSON schema plus ad-hoc runner checks | AI SDK `jsonSchema(..., { validate })` | Migrated |
| Recoverable malformed tool calls | Custom single-action protocol repair | AI SDK `repairToolCall` re-ask | Migrated |
| Safe command normalization | Runner-generated replacement requests | AI SDK `experimental_refineToolInput` | Migrated |
| Production write endpoint | Custom NDJSON runner/remote-tool queue | `/v1/chat` AI SDK UI stream | Migrated; legacy write route is no longer mounted |

## Intentionally retained GeoChat logic

AI SDK owns model calls, tool-call transport, loop control, UI message conversion, and structured output validation. It does not replace these product-specific responsibilities:

- GeoGebra tool definitions, argument schemas, execution, and result redaction.
- Workflow phase policy (read canvas, plan, write, verify, explain).
- Conversation/run ledgers, blackboard persistence, and diagnostics.
- Skill catalog search, curriculum matching, and post-selection enrichment.
- Protection against models echoing raw tool-result payloads.

The legacy model loop, paused runner, write controller, route, continuation services, remote-tool queue, browser coordinator, and remote execution cache have been deleted. The obsolete database tables, validators, migrations, and compatibility routes were removed rather than retained as a legacy layer.
