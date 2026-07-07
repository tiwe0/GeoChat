# GeoChat Desktop Debug MCP

This MCP is a local debugging surface for the desktop app. SQLite inspection is read-only. Desktop control tools enqueue local actions that are executed by the Tauri renderer only while the MCP switch is enabled.

## Run

```bash
bun run mcp:desktop-debug
```

HTTP mode for desktop integration:

```bash
bun run mcp:desktop-debug:http
```

The HTTP MCP endpoint is:

```text
http://127.0.0.1:17369/mcp
```

Health check:

```text
http://127.0.0.1:17369/health
```

By default it reads:

```text
./data/geochat-desktop.sqlite
```

For the real Tauri desktop database, point the MCP at the desktop app data database path:

```bash
GEOCHAT_DESKTOP_MCP_DB_PATH="/Users/ivory/Library/Application Support/GeoChat Desktop/geochat-desktop.sqlite" bun run mcp:desktop-debug
```

## Configuration

- `GEOCHAT_DESKTOP_MCP_DB_PATH` or `GEOCHAT_DESKTOP_DB_PATH`: SQLite database path. Defaults to `./data/geochat-desktop.sqlite`.
- `GEOCHAT_DESKTOP_MCP_BACKEND_BASE_URL` or `GEOCHAT_DESKTOP_BACKEND_BASE_URL`: local backend base URL. Defaults to `http://127.0.0.1:${GEOCHAT_DESKTOP_BACKEND_PORT || 17365}`.
- `GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN`: bearer token for the local backend when the desktop dev runtime was started with local auth enabled.
- `GEOCHAT_DESKTOP_MCP_AUTH_TOKEN`: bearer token required by the HTTP MCP endpoint.
- `GEOCHAT_DESKTOP_MCP_DEFAULT_LIMIT`, `GEOCHAT_DESKTOP_MCP_MAX_LIMIT`, and `GEOCHAT_DESKTOP_MCP_CONTENT_LIMIT`: output limits.
- `GEOCHAT_DESKTOP_MCP_ALLOW_SENSITIVE=1`: allow sensitive output when a tool call also sets `includeSensitive: true`.

MCP client example:

```json
{
  "mcpServers": {
    "geochat-desktop-debug": {
      "command": "bun",
      "args": ["run", "mcp:desktop-debug"],
      "cwd": "/Users/ivory/Project/GeoChatDesktop",
      "env": {
        "GEOCHAT_DESKTOP_MCP_DB_PATH": "/Users/ivory/Library/Application Support/GeoChat Desktop/geochat-desktop.sqlite"
      }
    }
  }
}
```

## Tools

- `get_desktop_runtime_diagnostics`: runtime, database path, file state, MCP limits.
- `list_problem_bank_sets`: list problem-bank sets through the local backend.
- `list_problem_bank_problems`: search problems through the local backend, including `query`, `difficulty`, `questionType`, `year`, `paper`, `topic`, `taskType`, and `visualOnly` filters.
- `get_desktop_ui_status`: inspect the local renderer/MCP bridge state, queued UI actions, selected problem, and recent UI errors.
- `send_desktop_message`: enqueue a real desktop UI send-message action.
- `export_desktop_canvas_png`: enqueue a real desktop GeoGebra PNG export action; read the completed action result for `base64` or `dataUrl`.
- `select_desktop_problem`: enqueue a real desktop UI problem selection action; it can select by `problemId` or search with the same problem-bank filters. Modes are `show`, `draft`, and `send`.
- `list_desktop_debug_actions`: inspect queued/claimed/succeeded/failed desktop control actions.
- `get_sqlite_overview`: table counts, Agent run status, remote tool status, recent errors, problem bank counts.
- `list_recent_conversations`: recent conversation IDs with latest run status and error count.
- `get_conversation_debug_bundle`: conversation messages, blackboard, runs, tool requests, policy decisions, model steps, errors.
- `list_failed_agent_runs`: failed/cancelled runs filtered by provider, tool, and time.
- `get_agent_run_debug_bundle`: one run's ledger, deterministic review, conversation, blackboard, tools, policy, model steps, errors.
- `search_agent_errors`: persisted Agent error search.
- `get_problem_bank_overview`: local problem bank distributions and recent attempts.
- `safe_sqlite_select`: restricted single-statement SELECT/read-only PRAGMA.

## Safety

- SQLite is opened with Bun's read-only mode.
- Mutation SQL is rejected by `safe_sqlite_select`.
- Desktop control tools do not write SQLite directly. They enqueue in-memory actions consumed by the renderer over localhost HTTP.
- HTTP MCP requests require `GEOCHAT_DESKTOP_MCP_AUTH_TOKEN` when configured. Backend requests include `GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN` only when explicitly provided.
- Output is redacted by default for token/password/API-key-like fields, bulky image/base64 fields, and long content.
- Sensitive output is disabled unless `GEOCHAT_DESKTOP_MCP_ALLOW_SENSITIVE=1`, and individual tool calls still need `includeSensitive: true`.
