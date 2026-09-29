# Agent Development Stack Notes

- Status: maintained reference inventory; not an adoption roadmap
- Last refreshed: 2026-09-29
- Owner area: backend agent runtime / shared contracts / renderer integration

This document records candidate libraries for the GeoChat Desktop agent runtime. These are planning notes, not the dependency manifest. The current installed dependency versions live in `package.json`, workspace package manifests, and the lockfile.

## Core Agent Framework

| Library | Version | Use |
| --- | --- | --- |
| `effect` | currently installed as `^3.21.2` | Functional effect system for side effects, concurrency, and service composition. |
| `@modelcontextprotocol/sdk` | currently installed as `^1.27.1` | Model Context Protocol SDK for standardized context/tool integration. |

## LLM Integration

| Library | Version | Use |
| --- | --- | --- |
| `ai` | currently installed as `7.0.109` | Vercel AI SDK core used by the Bun backend. |

The Vercel AI SDK ecosystem can support multiple LLM providers, including OpenAI, Anthropic, Google, Azure, Amazon Bedrock, Groq, Mistral, xAI, Perplexity, and Cohere.

## Database And Storage

| Library | Use |
| --- | --- |
| `drizzle-orm` (currently installed as `^0.45.2`) | Type-safe database queries. |
| `@effect/sql-sqlite-bun` | SQLite integration for Effect on Bun. |
| `@effect/platform-node` | Node.js platform services for Effect. |

## Observability

| Library | Use |
| --- | --- |
| `@effect/opentelemetry` | Effect integration with OpenTelemetry. |
| `@opentelemetry/sdk-trace-base` | Trace SDK primitives. |
| `@opentelemetry/exporter-trace-otlp-http` | OTLP HTTP trace exporter. |

## UI

| Library | Use |
| --- | --- |
| `react` / `react-dom` | React 19 renderer and application composition. |
| `@assistant-ui/react` | Shared assistant runtime, thread primitives, composer, and message presentation. |

## Utility Libraries

| Library | Use |
| --- | --- |
| `zod` | Type-safe validation. |
| `remeda` | Functional utility helpers. |
| `tree-sitter` / `web-tree-sitter` | Multi-language code parsing. |
| `marked` + `marked-shiki` | Markdown parsing and syntax highlighting. |
| `fuzzysort` | Fast fuzzy matching. |
| `immer` | Immutable state updates. |
| `gray-matter` | Front matter parsing. |
| `diff` | Text/code diff algorithms. |

## GitHub And Integrations

| Library | Use |
| --- | --- |
| `@octokit/rest` | GitHub REST API client. |
| `@octokit/graphql` | GitHub GraphQL client. |
| `@actions/core` / `@actions/github` | GitHub Actions integration. |

## Runtime And Tooling

| Library | Use |
| --- | --- |
| `@lydell/node-pty` | Pseudo-terminal support for command execution. |
| `cross-spawn` | Cross-platform process spawning. |
| `ws` | WebSocket server/client support. |
| `yargs` | CLI argument parsing. |
| `which` | Executable lookup. |

## Stack Direction

The candidate stack emphasizes:

- functional side-effect management with Effect
- type-safe boundaries with schemas and TypeScript
- multi-provider LLM support
- MCP-compatible context/tool integration
- first-class tracing with OpenTelemetry
- code understanding through Tree-sitter

Before adopting any candidate dependency, verify its current version, license,
bundle/runtime impact, and whether the feature belongs in the Bun backend, Tauri
shell/command bridge, shared `@geochat-ai/app` package, or React renderer. The
dependency manifests and lockfile are always authoritative over this inventory.
