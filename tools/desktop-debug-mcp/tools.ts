import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isAgentRunLedgerRecord, reviewAgentRunLedger, type AgentRunReviewReport } from "@geochat-ai/app";
import * as z from "zod/v4";
import { fetchProblemDetail, fetchProblems, fetchProblemSets } from "./backend-client";
import type { DesktopDebugMcpConfig } from "./config";
import { clampLimit } from "./config";
import type { DesktopDebugActionQueue } from "./debug-actions";
import { blockedResult, toolResult } from "./result";
import { redactionContext, redactRow } from "./redaction";
import { all, databaseFileInfo, ensureSafeReadOnlySql, get, quoteIdentifier, withReadonlyDatabase, type SqliteBinding } from "./sqlite";

type RegisterOptions = {
  config: DesktopDebugMcpConfig;
  actions: DesktopDebugActionQueue;
};

const idSchema = z.string().min(1).max(180);
const limitSchema = z.number().int().positive().max(1_000).optional();
const includeSensitiveSchema = z.boolean().optional();
const includeFullContentSchema = z.boolean().optional();
const problemQuestionTypeSchema = z.enum(["mcq", "fill_blank", "open_ended", "curated"]).optional();
const problemDifficultySchema = z.enum(["easy", "medium", "hard"]).optional();
const problemTaskTypeSchema = z.enum(["draw", "solve", "explain", "construct", "diagnose", "revise", "mixed", "animation"]).optional();
const problemSourceSchema = z.enum(["local", "cloud"]).optional();

const knownTables = [
  "messages",
  "conversations",
  "conversation_messages",
  "conversation_blackboard_entries",
  "users",
  "registration_applications",
  "session_tokens",
  "web_inquiries",
  "agent_run_ledgers",
  "agent_run_remote_tool_requests",
  "agent_run_policy_decisions",
  "agent_run_model_steps",
  "agent_error_events",
  "problem_sources",
  "problems",
  "problem_tags",
  "problem_topics",
  "problem_sets",
  "problem_set_items",
  "problem_attempts"
] as const;

export function registerDesktopDebugTools(server: McpServer, { config, actions }: RegisterOptions) {
  server.registerTool(
    "get_desktop_runtime_diagnostics",
    {
      title: "Get GeoChat Desktop runtime diagnostics",
      description:
        "返回桌面调试 MCP 自身的运行诊断、SQLite 路径解析和安全配置。不会读取敏感环境变量值，也不会创建数据库文件。",
      inputSchema: {}
    },
    async () => toolResult({
      ok: true,
      runtime: {
        platform: process.platform,
        arch: process.arch,
        bunVersion: Bun.version,
        cwd: process.cwd(),
        nodeEnv: process.env.NODE_ENV ?? null
      },
      database: databaseFileInfo(config),
      backend: {
        baseUrl: config.backendBaseUrl,
        controlQueue: "in-memory; consumed by the Tauri renderer while the MCP switch is on"
      },
      limits: {
        defaultLimit: config.defaultLimit,
        maxLimit: config.maxLimit,
        defaultContentLimit: config.defaultContentLimit
      },
      safety: safetySummary(config)
    })
  );

  server.registerTool(
    "list_problem_bank_sets",
    {
      title: "List desktop problem bank sets",
      description:
        "通过本机后端列出题库题集。用于先选择 setId/slug，再调用 list_problem_bank_problems 或 select_desktop_problem。",
      inputSchema: {}
    },
    async () => {
      try {
        return toolResult({ ok: true, backendBaseUrl: config.backendBaseUrl, sets: await fetchProblemSets(config) });
      } catch (error) {
        return blockedResult(error instanceof Error ? error.message : "Problem set request failed.", { backendBaseUrl: config.backendBaseUrl });
      }
    }
  );

  server.registerTool(
    "list_problem_bank_problems",
    {
      title: "Search desktop problem bank problems",
      description:
        "通过本机后端搜索题库题目，支持题集、关键词、题型、年份、卷别、难度、任务类型和仅可视化过滤。返回 problemId，可交给 select_desktop_problem。",
      inputSchema: {
        setIdOrSlug: z.string().min(1).max(180).optional(),
        query: z.string().min(1).max(300).optional(),
        difficulty: problemDifficultySchema,
        questionType: problemQuestionTypeSchema,
        year: z.string().min(1).max(40).optional(),
        paper: z.string().min(1).max(80).optional(),
        topic: z.string().min(1).max(120).optional(),
        taskType: problemTaskTypeSchema,
        visualOnly: z.boolean().optional(),
        limit: limitSchema,
        offset: z.number().int().min(0).max(20_000).optional()
      }
    },
    async ({ setIdOrSlug, query, difficulty, questionType, year, paper, topic, taskType, visualOnly, limit, offset }) => {
      try {
        const result = await fetchProblems(config, {
          setIdOrSlug,
          query,
          difficulty,
          questionType,
          year,
          paper,
          topic,
          taskType,
          visualOnly,
          limit: clampLimit(limit, config, 20),
          offset
        });
        return toolResult({
          ok: true,
          backendBaseUrl: config.backendBaseUrl,
          problemList: result
        });
      } catch (error) {
        return blockedResult(error instanceof Error ? error.message : "Problem search failed.", { backendBaseUrl: config.backendBaseUrl });
      }
    }
  );

  server.registerTool(
    "get_desktop_ui_status",
    {
      title: "Get desktop renderer UI status",
      description:
        "通过已打开的 Tauri renderer 查询当前 UI 状态，包括是否正在运行、GeoGebra 是否 ready、当前模型是否配置密钥。用于发送调试消息前确认桌面端已准备好。",
      inputSchema: {}
    },
    async () => {
      const action = actions.enqueue({ type: "get_ui_status" });
      return toolResult({
        ok: true,
        queued: true,
        action,
        note: "Poll list_desktop_debug_actions until this action succeeds, then read action.result."
      });
    }
  );

  server.registerTool(
    "send_desktop_message",
    {
      title: "Send a message through the desktop UI",
      description:
        "把一条用户消息放入桌面端调试队列。打开 MCP 开关的 Tauri renderer 会消费该动作并调用真实 sendMessage，因此会触发当前模型、GeoGebra 画板工具和错误持久化。可选 conversationId 用于先恢复指定会话。",
      inputSchema: {
        content: z.string().min(1).max(20_000),
        conversationId: idSchema.optional()
      }
    },
    async ({ content, conversationId }) => {
      const action = actions.enqueue({ type: "send_message", content, conversationId });
      return toolResult({
        ok: true,
        queued: true,
        action,
        note: "The Tauri renderer must be open with the MCP switch enabled to execute this message."
      });
    }
  );

  server.registerTool(
    "run_single_problem_test",
    {
      title: "Run one desktop problem test",
      description:
        "执行一题端到端桌面测试：可直接传 content 作为用户题目，或传 problemId/筛选条件从题库选择一题并发送。工具会等待 renderer 消费动作并读取最新 Agent run 摘要；可选导出最终画布 PNG。",
      inputSchema: {
        content: z.string().min(1).max(20_000).optional(),
        conversationId: idSchema.optional(),
        problemId: idSchema.optional(),
        setIdOrSlug: z.string().min(1).max(180).optional(),
        query: z.string().min(1).max(300).optional(),
        difficulty: problemDifficultySchema,
        questionType: problemQuestionTypeSchema,
        year: z.string().min(1).max(40).optional(),
        paper: z.string().min(1).max(80).optional(),
        topic: z.string().min(1).max(120).optional(),
        taskType: problemTaskTypeSchema,
        visualOnly: z.boolean().optional(),
        source: problemSourceSchema,
        cloudBaseUrl: z.url().optional(),
        bankSlug: z.string().min(1).max(180).optional(),
        problemApiPath: z.string().min(1).max(300).optional(),
        timeoutMs: z.number().int().min(1_000).max(900_000).optional(),
        pollIntervalMs: z.number().int().min(250).max(5_000).optional(),
        exportPng: z.boolean().optional(),
        exportScale: z.number().min(0.25).max(4).optional(),
        transparent: z.boolean().optional(),
        dpi: z.number().int().min(1).max(600).optional(),
        includeSensitive: includeSensitiveSchema
      }
    },
    async (input) => {
      const timeoutMs = input.timeoutMs ?? 300_000;
      const pollIntervalMs = input.pollIntervalMs ?? 1_000;
      try {
        const launch = await enqueueSingleProblemTestAction({ config, actions, input });
        if (!launch.ok) return blockedResult(launch.message, launch.details);

        const action = await waitForDesktopDebugAction(actions, launch.action.id, timeoutMs, pollIntervalMs);
        const conversationId = resultConversationId(action.result) ?? launch.conversationId ?? input.conversationId ?? null;
        const redact = redactionContext(config, { includeSensitive: input.includeSensitive });
        const runSummary = conversationId
          ? readLatestRunSummaryForConversation(config, conversationId, redact)
          : null;

        let pngAction: Awaited<ReturnType<typeof waitForDesktopDebugAction>> | null = null;
        if (input.exportPng && action.status === "succeeded") {
          const exportAction = actions.enqueue({
            type: "export_png",
            exportScale: input.exportScale,
            transparent: input.transparent,
            dpi: input.dpi
          });
          pngAction = await waitForDesktopDebugAction(actions, exportAction.id, Math.min(timeoutMs, 60_000), pollIntervalMs);
        }

        return toolResult({
          ok: action.status === "succeeded",
          completed: action.status === "succeeded",
          timedOut: action.status === "queued" || action.status === "claimed",
          mode: launch.mode,
          problem: launch.problem ?? null,
          action,
          conversationId,
          runSummary,
          pngAction,
          note: action.status === "succeeded"
            ? "Single problem test finished. Inspect runSummary and pngAction.result when exportPng is enabled."
            : "Desktop renderer did not finish the action before timeout, or the action failed."
        });
      } catch (error) {
        return blockedResult(error instanceof Error ? error.message : "Single problem test failed.", { backendBaseUrl: config.backendBaseUrl });
      }
    }
  );

  server.registerTool(
    "export_desktop_canvas_png",
    {
      title: "Export current desktop GeoGebra canvas as PNG",
      description:
        "通过已打开且开启 MCP 的 Tauri renderer 调用真实 GeoGebra applet getPNGBase64，导出当前画布 PNG。用于检查 Agent 绘图视觉质量。返回 base64、dataUrl、byteEstimate 和导出参数；默认不写文件。",
      inputSchema: {
        exportScale: z.number().min(0.25).max(4).optional(),
        transparent: z.boolean().optional(),
        dpi: z.number().int().min(1).max(600).optional()
      }
    },
    async ({ exportScale, transparent, dpi }) => {
      const action = actions.enqueue({ type: "export_png", exportScale, transparent, dpi });
      return toolResult({
        ok: true,
        queued: true,
        action,
        note: "Poll list_desktop_debug_actions until this action succeeds, then read action.result.base64 or action.result.dataUrl."
      });
    }
  );

  server.registerTool(
    "list_desktop_debug_actions",
    {
      title: "List queued desktop debug actions",
      description:
        "查看 MCP 调试动作队列，包括 send_desktop_message/select_desktop_problem 是否已被桌面 renderer 消费、成功或失败。",
      inputSchema: {
        limit: limitSchema
      }
    },
    async ({ limit }) => toolResult({
      ok: true,
      actions: actions.list(clampLimit(limit, config, 30))
    })
  );

  server.registerTool(
    "select_desktop_problem",
    {
      title: "Select a problem in the desktop UI",
      description:
        "把题库题目选择动作放入桌面端调试队列。mode=show 会打开题库并选中题目；mode=draft 会填入输入框；mode=send 会调用真实发送流程开始解题。若不提供 problemId，则按过滤条件取第一题。",
      inputSchema: {
        problemId: idSchema.optional(),
        setIdOrSlug: z.string().min(1).max(180).optional(),
        query: z.string().min(1).max(300).optional(),
        difficulty: problemDifficultySchema,
        questionType: problemQuestionTypeSchema,
        year: z.string().min(1).max(40).optional(),
        paper: z.string().min(1).max(80).optional(),
        topic: z.string().min(1).max(120).optional(),
        taskType: problemTaskTypeSchema,
        visualOnly: z.boolean().optional(),
        source: problemSourceSchema,
        cloudBaseUrl: z.url().optional(),
        bankSlug: z.string().min(1).max(180).optional(),
        problemApiPath: z.string().min(1).max(300).optional(),
        mode: z.enum(["show", "draft", "send"]).optional(),
        conversationId: idSchema.optional()
      }
    },
    async ({ problemId, setIdOrSlug, query, difficulty, questionType, year, paper, topic, taskType, visualOnly, source, cloudBaseUrl, bankSlug, problemApiPath, mode = "show", conversationId }) => {
      try {
        let selectedProblemId = problemId;
        let problem: unknown;
        const selectedSource = source ?? (bankSlug || cloudBaseUrl || problemApiPath ? "cloud" : "local");
        if (!selectedProblemId && selectedSource === "cloud") {
          return blockedResult("Cloud problem selection requires problemId.", { cloudBaseUrl, bankSlug });
        }
        if (!selectedProblemId) {
          const list = await fetchProblems(config, {
            setIdOrSlug,
            query,
            difficulty,
            questionType,
            year,
            paper,
            topic,
            taskType,
            visualOnly,
            limit: 1
          }) as { problems?: Array<{ id?: unknown }> };
          const first = list.problems?.[0];
          if (!first || typeof first.id !== "string") {
            return blockedResult("No matching problem was found.", { backendBaseUrl: config.backendBaseUrl });
          }
          selectedProblemId = first.id;
          problem = first;
        } else if (selectedSource === "cloud") {
          problem = { id: selectedProblemId, source: "cloud", bankSlug, problemApiPath };
        } else {
          problem = await fetchProblemDetail(config, selectedProblemId);
        }

        const action = actions.enqueue({
          type: "select_problem",
          problemId: selectedProblemId,
          source: selectedSource,
          cloudBaseUrl,
          bankSlug,
          problemApiPath,
          mode,
          conversationId
        });
        return toolResult({
          ok: true,
          queued: true,
          action,
          problem,
          note: "The Tauri renderer must be open with the MCP switch enabled to execute this problem action."
        });
      } catch (error) {
        return blockedResult(error instanceof Error ? error.message : "Problem selection failed.", { backendBaseUrl: config.backendBaseUrl });
      }
    }
  );

  server.registerTool(
    "get_sqlite_overview",
    {
      title: "Get GeoChat Desktop SQLite overview",
      description:
        "读取桌面 SQLite 的只读概览：核心表计数、Agent run 状态、近期错误、题库规模和最近更新时间。适合先判断本地数据是否完整。",
      inputSchema: {
        includeSensitive: includeSensitiveSchema
      }
    },
    async ({ includeSensitive }) => {
      const file = databaseFileInfo(config);
      if (!file.exists) {
        return blockedResult("SQLite database file does not exist.", { database: file, safety: safetySummary(config) });
      }

      const redact = redactionContext(config, { includeSensitive });
      return toolResult(withReadonlyDatabase(config, (db) => {
        const tableCounts = readTableCounts(db);
        return {
          ok: true,
          database: file,
          safety: safetySummary(config),
          tableCounts,
          runStatus: readGroupedCount(db, "agent_run_ledgers", "status"),
          remoteToolStatus: readGroupedCount(db, "agent_run_remote_tool_requests", "status"),
          recentErrors: tableExists(db, "agent_error_events")
            ? all(
              db,
              `
                select code, severity, source, tool_name, count(*) as count, max(created_at) as latest_at
                from agent_error_events
                group by code, severity, source, tool_name
                order by latest_at desc
                limit 30
              `
            ).map((row) => redactRow(row, redact))
            : [],
          problemBank: {
            sources: countKnownTable(db, "problem_sources"),
            problems: countKnownTable(db, "problems"),
            sets: countKnownTable(db, "problem_sets"),
            attempts: countKnownTable(db, "problem_attempts")
          }
        };
      }));
    }
  );

  server.registerTool(
    "list_recent_conversations",
    {
      title: "List recent desktop conversations",
      description:
        "列出最近桌面会话，只返回摘要、消息数、最近 Agent run 状态和错误数量。用于选择要复盘的 conversationId。",
      inputSchema: {
        limit: limitSchema,
        ownerUserId: z.string().min(1).max(180).optional(),
        includeSensitive: includeSensitiveSchema
      }
    },
    async ({ limit, ownerUserId, includeSensitive }) => {
      const redact = redactionContext(config, { includeSensitive });
      return toolResult(withReadonlyDatabase(config, (db) => {
        const where = ownerUserId ? "where c.owner_user_id = ?" : "";
        const params = ownerUserId ? [ownerUserId, clampLimit(limit, config, 30)] : [clampLimit(limit, config, 30)];
        const conversations = all(
          db,
          `
            select
              c.id,
              c.title,
              c.summary,
              c.owner_user_id,
              c.message_count,
              c.created_at,
              c.updated_at,
              (
                select l.run_id
                from agent_run_ledgers l
                where l.conversation_id = c.id
                order by l.started_at desc
                limit 1
              ) as latest_run_id,
              (
                select l.status
                from agent_run_ledgers l
                where l.conversation_id = c.id
                order by l.started_at desc
                limit 1
              ) as latest_run_status,
              (
                select count(*)
                from agent_error_events e
                where e.conversation_id = c.id
              ) as error_count
            from conversations c
            ${where}
            order by c.updated_at desc
            limit ?
          `,
          params
        ).map((row) => redactRow(row, redact));

        return { ok: true, conversations };
      }));
    }
  );

  server.registerTool(
    "get_conversation_debug_bundle",
    {
      title: "Get desktop conversation debug bundle",
      description:
        "读取一个会话的完整调试包：会话元数据、消息、黑板、Agent ledger、远程工具请求、策略决策、模型步骤和错误事件。默认截断长内容并脱敏。",
      inputSchema: {
        conversationId: idSchema,
        messageLimit: limitSchema,
        includeFullContent: includeFullContentSchema,
        includeSensitive: includeSensitiveSchema
      }
    },
    async ({ conversationId, messageLimit, includeFullContent, includeSensitive }) => {
      const redact = redactionContext(config, { includeFullContent, includeSensitive });
      return toolResult(withReadonlyDatabase(config, (db) => {
        const bundle = {
          ok: true,
          conversation: maybeRedact(
            get(db, "select * from conversations where id = ?", [conversationId]),
            redact
          ),
          messages: all(
            db,
            `
              select id, conversation_id, role, content, created_at, payload
              from conversation_messages
              where conversation_id = ?
              order by created_at asc
              limit ?
            `,
            [conversationId, clampLimit(messageLimit, config, 120)]
          ).map((row) => redactRow(row, redact)),
          blackboard: all(
            db,
            `
              select *
              from conversation_blackboard_entries
              where conversation_id = ?
              order by status asc, category asc, updated_at desc
            `,
            [conversationId]
          ).map((row) => redactRow(row, redact)),
          runs: all(
            db,
            `
              select *
              from agent_run_ledgers
              where conversation_id = ?
              order by started_at desc
              limit 30
            `,
            [conversationId]
          ).map((row) => redactRow(row, redact)),
          toolRequests: all(
            db,
            `
              select r.*
              from agent_run_remote_tool_requests r
              join agent_run_ledgers l on l.run_id = r.run_id
              where l.conversation_id = ?
              order by r.requested_at desc
              limit 300
            `,
            [conversationId]
          ).map((row) => redactRow(row, redact)),
          policyDecisions: all(
            db,
            `
              select p.*
              from agent_run_policy_decisions p
              join agent_run_ledgers l on l.run_id = p.run_id
              where l.conversation_id = ?
              order by p.created_at desc
              limit 300
            `,
            [conversationId]
          ).map((row) => redactRow(row, redact)),
          modelSteps: all(
            db,
            `
              select s.*
              from agent_run_model_steps s
              join agent_run_ledgers l on l.run_id = s.run_id
              where l.conversation_id = ?
              order by s.started_at desc
              limit 300
            `,
            [conversationId]
          ).map((row) => redactRow(row, redact)),
          errors: all(
            db,
            `
              select *
              from agent_error_events
              where conversation_id = ?
              order by created_at desc
              limit 300
            `,
            [conversationId]
          ).map((row) => redactRow(row, redact))
        };
        return bundle;
      }));
    }
  );

  server.registerTool(
    "list_failed_agent_runs",
    {
      title: "List failed desktop agent runs",
      description:
        "列出失败/取消的桌面 Agent run，支持按 provider、工具名和开始时间过滤。用于定位工具预算、模型协议、画板构造等失败。",
      inputSchema: {
        limit: limitSchema,
        modelProvider: z.string().min(1).max(120).optional(),
        toolName: z.string().min(1).max(180).optional(),
        sinceIso: z.string().datetime().optional(),
        includeSensitive: includeSensitiveSchema
      }
    },
    async ({ limit, modelProvider, toolName, sinceIso, includeSensitive }) => {
      const redact = redactionContext(config, { includeSensitive });
      return toolResult(withReadonlyDatabase(config, (db) => {
        const where = ["l.status in ('failed', 'cancelled')"];
        const params: SqliteBinding[] = [];
        if (modelProvider) {
          where.push("l.model_provider = ?");
          params.push(modelProvider);
        }
        if (sinceIso) {
          where.push("l.started_at >= ?");
          params.push(Date.parse(sinceIso));
        }
        if (toolName) {
          where.push(`
            exists (
              select 1
              from agent_run_remote_tool_requests r
              where r.run_id = l.run_id and r.tool_name = ?
            )
          `);
          params.push(toolName);
        }
        params.push(clampLimit(limit, config, 50));

        const runs = all(
          db,
          `
            select
              l.run_id,
              l.conversation_id,
              l.status,
              l.mode,
              l.model_provider,
              l.model_id,
              l.started_at,
              l.completed_at,
              c.title as conversation_title,
              (
                select count(*)
                from agent_error_events e
                where e.run_id = l.run_id
              ) as error_count,
              (
                select e.code
                from agent_error_events e
                where e.run_id = l.run_id
                order by e.created_at desc
                limit 1
              ) as latest_error_code,
              (
                select e.message
                from agent_error_events e
                where e.run_id = l.run_id
                order by e.created_at desc
                limit 1
              ) as latest_error_message
            from agent_run_ledgers l
            left join conversations c on c.id = l.conversation_id
            where ${where.join(" and ")}
            order by l.started_at desc
            limit ?
          `,
          params
        ).map((row) => redactRow(row, redact));

        return { ok: true, runs };
      }));
    }
  );

  server.registerTool(
    "get_agent_run_debug_bundle",
    {
      title: "Get desktop agent run debug bundle",
      description:
        "读取单个 runId 的完整编排调试包：ledger、关联会话、黑板、工具请求、策略决策、模型步骤和错误。适合定位一轮失败的具体约束。",
      inputSchema: {
        runId: idSchema,
        includeFullContent: includeFullContentSchema,
        includeSensitive: includeSensitiveSchema
      }
    },
    async ({ runId, includeFullContent, includeSensitive }) => {
      const redact = redactionContext(config, { includeFullContent, includeSensitive });
      return toolResult(withReadonlyDatabase(config, (db) => {
        const run = get(db, "select * from agent_run_ledgers where run_id = ?", [runId]);
        const review = agentRunReviewFromLedgerRow(run);
        const conversationId = typeof run?.conversation_id === "string" ? run.conversation_id : "";
        return {
          ok: true,
          run: maybeRedact(run, redact),
          review: review.ok ? review.report : null,
          reviewUnavailable: review.ok ? null : review.reason,
          conversation: conversationId
            ? maybeRedact(get(db, "select * from conversations where id = ?", [conversationId]), redact)
            : null,
          blackboard: conversationId
            ? all(
              db,
              `
                select *
                from conversation_blackboard_entries
                where conversation_id = ?
                order by status asc, category asc, updated_at desc
              `,
              [conversationId]
            ).map((row) => redactRow(row, redact))
            : [],
          toolRequests: all(
            db,
            `
              select *
              from agent_run_remote_tool_requests
              where run_id = ?
              order by requested_at asc
            `,
            [runId]
          ).map((row) => redactRow(row, redact)),
          policyDecisions: all(
            db,
            `
              select *
              from agent_run_policy_decisions
              where run_id = ?
              order by created_at asc
            `,
            [runId]
          ).map((row) => redactRow(row, redact)),
          modelSteps: all(
            db,
            `
              select *
              from agent_run_model_steps
              where run_id = ?
              order by started_at asc
            `,
            [runId]
          ).map((row) => redactRow(row, redact)),
          errors: all(
            db,
            `
              select *
              from agent_error_events
              where run_id = ?
              order by created_at asc
            `,
            [runId]
          ).map((row) => redactRow(row, redact))
        };
      }));
    }
  );

  server.registerTool(
    "search_agent_errors",
    {
      title: "Search desktop agent errors",
      description:
        "搜索持久化的 Agent 错误事件，可按 run、conversation、source、code、severity、toolName 和消息片段过滤。默认脱敏并截断长 payload。",
      inputSchema: {
        limit: limitSchema,
        runId: idSchema.optional(),
        conversationId: idSchema.optional(),
        source: z.enum(["run", "tool", "remote_tool_request", "policy", "model_step"]).optional(),
        code: z.string().min(1).max(160).optional(),
        severity: z.enum(["warning", "error"]).optional(),
        toolName: z.string().min(1).max(180).optional(),
        messageContains: z.string().min(1).max(300).optional(),
        includeSensitive: includeSensitiveSchema
      }
    },
    async ({ limit, runId, conversationId, source, code, severity, toolName, messageContains, includeSensitive }) => {
      const redact = redactionContext(config, { includeSensitive });
      return toolResult(withReadonlyDatabase(config, (db) => {
        const where: string[] = [];
        const params: SqliteBinding[] = [];
        appendEquals(where, params, "run_id", runId);
        appendEquals(where, params, "conversation_id", conversationId);
        appendEquals(where, params, "source", source);
        appendEquals(where, params, "code", code);
        appendEquals(where, params, "severity", severity);
        appendEquals(where, params, "tool_name", toolName);
        if (messageContains) {
          where.push("message like ?");
          params.push(`%${messageContains}%`);
        }
        params.push(clampLimit(limit, config, 80));
        const errors = all(
          db,
          `
            select *
            from agent_error_events
            ${where.length ? `where ${where.join(" and ")}` : ""}
            order by created_at desc
            limit ?
          `,
          params
        ).map((row) => redactRow(row, redact));
        return { ok: true, errors };
      }));
    }
  );

  server.registerTool(
    "get_problem_bank_overview",
    {
      title: "Get desktop problem bank overview",
      description:
        "读取本地题库概览：题源、题集、题型/年份/难度分布和最近作答。用于判断桌面产品题库数据是否导入完整。",
      inputSchema: {
        limit: limitSchema,
        includeSensitive: includeSensitiveSchema
      }
    },
    async ({ limit, includeSensitive }) => {
      const redact = redactionContext(config, { includeSensitive });
      return toolResult(withReadonlyDatabase(config, (db) => ({
        ok: true,
        sources: tableExists(db, "problem_sources")
          ? all(db, "select id, kind, name, version, source_path, imported_at from problem_sources order by imported_at desc")
            .map((row) => redactRow(row, redact))
          : [],
        sets: tableExists(db, "problem_sets")
          ? all(db, "select id, slug, title, description, kind, created_at from problem_sets order by created_at desc")
            .map((row) => redactRow(row, redact))
          : [],
        byQuestionType: readGroupedCount(db, "problems", "question_type"),
        byTaskType: readGroupedCount(db, "problems", "task_type"),
        byDifficulty: readGroupedCount(db, "problems", "difficulty"),
        byYear: tableExists(db, "problems")
          ? all(
            db,
            `
              select year, count(*) as count
              from problems
              where year is not null and year != ''
              group by year
              order by year desc
              limit 80
            `
          )
          : [],
        recentAttempts: tableExists(db, "problem_attempts")
          ? all(
            db,
            `
              select
                a.id,
                a.problem_id,
                p.title as problem_title,
                a.conversation_id,
                a.run_id,
                a.status,
                a.model_provider,
                a.model_id,
                a.started_at,
                a.completed_at
              from problem_attempts a
              left join problems p on p.id = a.problem_id
              order by a.started_at desc
              limit ?
            `,
            [clampLimit(limit, config, 30)]
          ).map((row) => redactRow(row, redact))
          : []
      })));
    }
  );

  server.registerTool(
    "safe_sqlite_select",
    {
      title: "Run read-only SQLite SELECT",
      description:
        "执行受限的只读 SQLite 查询，仅允许单条 SELECT 或只读 PRAGMA，拒绝分号和 mutation 关键词。结果会按 limit 截断并脱敏。",
      inputSchema: {
        sql: z.string().min(1).max(10_000),
        limit: limitSchema,
        includeFullContent: includeFullContentSchema,
        includeSensitive: includeSensitiveSchema
      }
    },
    async ({ sql, limit, includeFullContent, includeSensitive }) => {
      try {
        ensureSafeReadOnlySql(sql);
      } catch (error) {
        return blockedResult(error instanceof Error ? error.message : "Unsafe SQL rejected.");
      }
      const redact = redactionContext(config, { includeFullContent, includeSensitive });
      return toolResult(withReadonlyDatabase(config, (db) => {
        const maxRows = clampLimit(limit, config, 100);
        const rows = all(db, sql).slice(0, maxRows).map((row) => redactRow(row, redact));
        return { ok: true, rowCount: rows.length, truncatedAt: maxRows, rows };
      }));
    }
  );
}

function safetySummary(config: DesktopDebugMcpConfig) {
  return {
    sqliteMode: "readonly",
    databaseWrites: false,
    desktopControlActions: "send_message/select_problem queue; renderer executes only while MCP switch is enabled",
    arbitrarySql: "SELECT/readonly PRAGMA only",
    sensitiveOutput: config.includeSensitiveByDefault ? "opt-in per tool" : "disabled"
  };
}

type SingleProblemTestInput = {
  content?: string;
  conversationId?: string;
  problemId?: string;
  setIdOrSlug?: string;
  query?: string;
  difficulty?: "easy" | "medium" | "hard";
  questionType?: "mcq" | "fill_blank" | "open_ended" | "curated";
  year?: string;
  paper?: string;
  topic?: string;
  taskType?: "draw" | "solve" | "explain" | "construct" | "diagnose" | "revise" | "mixed" | "animation";
  visualOnly?: boolean;
  source?: "local" | "cloud";
  cloudBaseUrl?: string;
  bankSlug?: string;
  problemApiPath?: string;
};

async function enqueueSingleProblemTestAction(input: {
  config: DesktopDebugMcpConfig;
  actions: DesktopDebugActionQueue;
  input: SingleProblemTestInput;
}): Promise<
  | {
      ok: true;
      mode: "content" | "problem";
      action: ReturnType<DesktopDebugActionQueue["enqueue"]>;
      conversationId?: string;
      problem?: unknown;
    }
  | { ok: false; message: string; details?: Record<string, unknown> }
> {
  const content = input.input.content?.trim();
  if (content) {
    return {
      ok: true,
      mode: "content",
      conversationId: input.input.conversationId,
      action: input.actions.enqueue({
        type: "send_message",
        content,
        conversationId: input.input.conversationId
      })
    };
  }

  let selectedProblemId = input.input.problemId;
  let problem: unknown;
  const selectedSource = input.input.source ?? (input.input.bankSlug || input.input.cloudBaseUrl || input.input.problemApiPath ? "cloud" : "local");
  if (!selectedProblemId && selectedSource === "cloud") {
    return { ok: false, message: "Cloud problem test requires problemId.", details: { cloudBaseUrl: input.input.cloudBaseUrl, bankSlug: input.input.bankSlug } };
  }
  if (!selectedProblemId) {
    const list = await fetchProblems(input.config, {
      setIdOrSlug: input.input.setIdOrSlug,
      query: input.input.query,
      difficulty: input.input.difficulty,
      questionType: input.input.questionType,
      year: input.input.year,
      paper: input.input.paper,
      topic: input.input.topic,
      taskType: input.input.taskType,
      visualOnly: input.input.visualOnly,
      limit: 1
    }) as { problems?: Array<{ id?: unknown }> };
    const first = list.problems?.[0];
    if (!first || typeof first.id !== "string") {
      return { ok: false, message: "No matching problem was found.", details: { backendBaseUrl: input.config.backendBaseUrl } };
    }
    selectedProblemId = first.id;
    problem = first;
  } else if (selectedSource === "cloud") {
    problem = { id: selectedProblemId, source: "cloud", bankSlug: input.input.bankSlug, problemApiPath: input.input.problemApiPath };
  } else {
    problem = await fetchProblemDetail(input.config, selectedProblemId);
  }

  return {
    ok: true,
    mode: "problem",
    conversationId: input.input.conversationId,
    problem,
    action: input.actions.enqueue({
      type: "select_problem",
      problemId: selectedProblemId,
      source: selectedSource,
      cloudBaseUrl: input.input.cloudBaseUrl,
      bankSlug: input.input.bankSlug,
      problemApiPath: input.input.problemApiPath,
      mode: "send",
      conversationId: input.input.conversationId
    })
  };
}

async function waitForDesktopDebugAction(
  actions: DesktopDebugActionQueue,
  actionId: string,
  timeoutMs: number,
  pollIntervalMs: number
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const action = actions.list(200).find((item) => item.id === actionId);
    if (!action) throw new Error(`Desktop debug action was not found: ${actionId}`);
    if (action.status === "succeeded" || action.status === "failed") return action;
    await sleep(pollIntervalMs);
  }
  const action = actions.list(200).find((item) => item.id === actionId);
  if (!action) throw new Error(`Desktop debug action was not found: ${actionId}`);
  return action;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resultConversationId(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const value = (result as Record<string, unknown>).conversationId;
  return typeof value === "string" && value.trim() ? value : null;
}

function readLatestRunSummaryForConversation(
  config: DesktopDebugMcpConfig,
  conversationId: string,
  redact: ReturnType<typeof redactionContext>
) {
  return withReadonlyDatabase(config, (db) => {
    if (!tableExists(db, "agent_run_ledgers")) {
      return { conversationId, run: null, review: null, reviewUnavailable: "agent_run_ledgers table does not exist.", errors: [], toolStatus: [] };
    }
    const run = get(
      db,
      `
        select *
        from agent_run_ledgers
        where conversation_id = ?
        order by started_at desc
        limit 1
      `,
      [conversationId]
    );
    const runId = typeof run?.run_id === "string" ? run.run_id : null;
    const review = agentRunReviewFromLedgerRow(run);
    return {
      conversationId,
      run: maybeRedact(run, redact),
      review: review.ok ? review.report : null,
      reviewUnavailable: review.ok ? null : review.reason,
      errors: runId && tableExists(db, "agent_error_events")
        ? all(
          db,
          `
            select code, severity, source, tool_name, message, created_at
            from agent_error_events
            where run_id = ?
            order by created_at desc
            limit 20
          `,
          [runId]
        ).map((row) => redactRow(row, redact))
        : [],
      toolStatus: runId && tableExists(db, "agent_run_remote_tool_requests")
        ? all(
          db,
          `
            select tool_name, status, count(*) as count
            from agent_run_remote_tool_requests
            where run_id = ?
            group by tool_name, status
            order by tool_name asc, status asc
          `,
          [runId]
        )
        : []
    };
  });
}

function readTableCounts(db: Parameters<typeof all>[0]) {
  const existing = new Set(
    all(db, "select name from sqlite_master where type = 'table'")
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string")
  );
  return knownTables.map((table) => ({
    table,
    exists: existing.has(table),
    count: existing.has(table) ? countTable(db, table) : null
  }));
}

function countTable(db: Parameters<typeof all>[0], table: string) {
  const row = get(db, `select count(*) as count from ${quoteIdentifier(table)}`);
  return Number(row?.count ?? 0);
}

function countKnownTable(db: Parameters<typeof all>[0], table: string) {
  return tableExists(db, table) ? countTable(db, table) : 0;
}

function readGroupedCount(db: Parameters<typeof all>[0], table: string, column: string) {
  if (!tableExists(db, table)) return [];
  return all(
    db,
    `
      select ${quoteIdentifier(column)} as value, count(*) as count
      from ${quoteIdentifier(table)}
      group by ${quoteIdentifier(column)}
      order by count desc, ${quoteIdentifier(column)} asc
    `
  );
}

function tableExists(db: Parameters<typeof all>[0], table: string) {
  return Boolean(get(db, "select 1 as present from sqlite_master where type = 'table' and name = ?", [table]));
}

export function agentRunReviewFromLedgerRow(row: unknown): { ok: true; report: AgentRunReviewReport } | { ok: false; reason: string } {
  if (!row || typeof row !== "object") {
    return { ok: false, reason: "Agent run ledger row was not found." };
  }
  const payload = (row as Record<string, unknown>).payload;
  if (typeof payload !== "string") {
    return { ok: false, reason: "Agent run ledger payload is unavailable." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { ok: false, reason: "Agent run ledger payload is not valid JSON." };
  }

  if (!isAgentRunLedgerRecord(parsed)) {
    return { ok: false, reason: "Agent run ledger payload does not match the current AgentRunLedgerRecord schema." };
  }
  return { ok: true, report: reviewAgentRunLedger(parsed) };
}

function appendEquals(where: string[], params: SqliteBinding[], column: string, value: SqliteBinding | undefined) {
  if (value === undefined || value === null || value === "") return;
  where.push(`${quoteIdentifier(column)} = ?`);
  params.push(value);
}

function maybeRedact<T>(row: T | undefined, redact: ReturnType<typeof redactionContext>) {
  return row ? redactRow(row, redact) : null;
}
