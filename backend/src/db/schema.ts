import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    ownerUserId: text("owner_user_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => [index("messages_owner_created_at_idx").on(table.ownerUserId, table.createdAt)]
);

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    ownerUserId: text("owner_user_id"),
    messageCount: integer("message_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => [
    index("conversations_owner_updated_at_idx").on(table.ownerUserId, table.updatedAt),
    index("conversations_updated_at_idx").on(table.updatedAt)
  ]
);

export const conversationMessages = sqliteTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    payload: text("payload", { mode: "json" }).notNull()
  },
  (table) => [
    index("conversation_messages_conversation_idx").on(table.conversationId, table.createdAt)
  ]
);

export const conversationBlackboardEntries = sqliteTable(
  "conversation_blackboard_entries",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    key: text("key").notNull(),
    category: text("category", {
      enum: [
        "original_problem",
        "givens",
        "goal",
        "math_analysis",
        "construction_plan",
        "canvas_state",
        "assumptions",
        "open_issues",
        "failed_attempts",
        "teaching_notes"
      ]
    }).notNull(),
    value: text("value").notNull(),
    status: text("status", { enum: ["active", "archived"] }).notNull(),
    confidence: integer("confidence").notNull(),
    reason: text("reason").notNull(),
    sourceMessageId: text("source_message_id"),
    sourceToolCallId: text("source_tool_call_id"),
    sourceRunId: text("source_run_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" })
  },
  (table) => [
    uniqueIndex("conversation_blackboard_entries_conversation_key_uidx").on(table.conversationId, table.key),
    index("conversation_blackboard_entries_lookup_idx").on(table.conversationId, table.status, table.category),
    check("conversation_blackboard_entries_confidence_ck", sql`${table.confidence} >= 0 AND ${table.confidence} <= 1000`)
  ]
);

export const agentRunLedgers = sqliteTable(
  "agent_run_ledgers",
  {
    runId: text("run_id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed", "cancelled"] }).notNull(),
    mode: text("mode", { enum: ["ai-sdk", "local-planner"] }).notNull(),
    modelProvider: text("model_provider").notNull(),
    modelId: text("model_id").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    payload: text("payload", { mode: "json" }).notNull()
  },
  (table) => [
    check("agent_run_ledgers_lifecycle_ck", sql`
      (${table.status} = 'running' AND ${table.completedAt} IS NULL) OR
      (${table.status} IN ('succeeded', 'failed', 'cancelled') AND ${table.completedAt} IS NOT NULL)
    `),
    check("agent_run_ledgers_timeline_ck", sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}`)
  ]
);

export const agentRunRemoteToolRequests = sqliteTable(
  "agent_run_remote_tool_requests",
  {
    requestId: text("request_id").primaryKey(),
    runId: text("run_id").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    status: text("status", { enum: ["pending", "running", "succeeded", "failed", "cancelled"] }).notNull(),
    requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull(),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    claimedBy: text("claimed_by"),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    attemptCount: integer("attempt_count").notNull().default(0),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    payload: text("payload", { mode: "json" }).notNull()
  },
  (table) => [
    uniqueIndex("agent_run_remote_tool_requests_run_tool_call_uidx").on(table.runId, table.toolCallId),
    index("agent_run_remote_tool_requests_run_id_idx").on(table.runId, table.status, table.requestedAt),
    check("agent_run_remote_tool_requests_attempt_count_ck", sql`${table.attemptCount} >= 0`),
    check("agent_run_remote_tool_requests_lifecycle_ck", sql`
      (${table.status} = 'pending' AND ${table.claimedAt} IS NULL AND ${table.leaseExpiresAt} IS NULL AND ${table.completedAt} IS NULL) OR
      (${table.status} = 'running' AND ${table.claimedAt} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL AND ${table.completedAt} IS NULL) OR
      (${table.status} IN ('succeeded', 'failed', 'cancelled') AND ${table.completedAt} IS NOT NULL)
    `),
    check("agent_run_remote_tool_requests_claim_state_ck", sql`
      (${table.claimedBy} IS NULL AND ${table.leaseExpiresAt} IS NULL) OR ${table.claimedAt} IS NOT NULL
    `),
    check("agent_run_remote_tool_requests_timeline_ck", sql`${table.claimedAt} IS NULL OR ${table.claimedAt} >= ${table.requestedAt}`),
    check("agent_run_remote_tool_requests_lease_timeline_ck", sql`${table.leaseExpiresAt} IS NULL OR ${table.leaseExpiresAt} >= ${table.claimedAt}`),
    check("agent_run_remote_tool_requests_completion_timeline_ck", sql`
      ${table.completedAt} IS NULL OR (
        ${table.completedAt} >= ${table.requestedAt} AND
        (${table.claimedAt} IS NULL OR ${table.completedAt} >= ${table.claimedAt})
      )
    `)
  ]
);

export const agentRunPolicyDecisions = sqliteTable(
  "agent_run_policy_decisions",
  {
    decisionId: text("decision_id").primaryKey(),
    runId: text("run_id").notNull(),
    stage: text("stage", { enum: ["runner_start", "runner_continuation", "ledger_tool_event", "remote_tool_request"] }).notNull(),
    kind: text("kind").notNull(),
    allowed: integer("allowed", { mode: "boolean" }).notNull(),
    toolCallId: text("tool_call_id"),
    toolName: text("tool_name"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    payload: text("payload", { mode: "json" }).notNull()
  },
  (table) => [
    index("agent_run_policy_decisions_run_id_idx").on(table.runId, table.createdAt),
    check("agent_run_policy_decisions_allowed_ck", sql`${table.allowed} IN (0, 1)`)
  ]
);

export const agentRunModelSteps = sqliteTable(
  "agent_run_model_steps",
  {
    stepId: text("step_id").primaryKey(),
    runId: text("run_id").notNull(),
    stage: text("stage", { enum: ["runner_start", "runner_continuation"] }).notNull(),
    source: text("source", { enum: ["model", "policy"] }).notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed", "cancelled"] }).notNull(),
    modelProvider: text("model_provider").notNull(),
    modelId: text("model_id").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    inputToolCount: integer("input_tool_count").notNull(),
    attachmentCount: integer("attachment_count").notNull(),
    outputType: text("output_type", { enum: ["tool", "finish"] }),
    outputToolCallId: text("output_tool_call_id"),
    outputToolName: text("output_tool_name"),
    payload: text("payload", { mode: "json" }).notNull()
  },
  (table) => [
    index("agent_run_model_steps_run_id_idx").on(table.runId, table.startedAt),
    check("agent_run_model_steps_input_tool_count_ck", sql`${table.inputToolCount} >= 0`),
    check("agent_run_model_steps_attachment_count_ck", sql`${table.attachmentCount} >= 0`),
    check("agent_run_model_steps_lifecycle_ck", sql`
      (${table.status} = 'running' AND ${table.completedAt} IS NULL) OR
      (${table.status} IN ('succeeded', 'failed', 'cancelled') AND ${table.completedAt} IS NOT NULL)
    `),
    check("agent_run_model_steps_timeline_ck", sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}`)
  ]
);

export const agentErrorEvents = sqliteTable(
  "agent_error_events",
  {
    eventId: text("event_id").primaryKey(),
    runId: text("run_id").notNull(),
    conversationId: text("conversation_id"),
    source: text("source", { enum: ["run", "tool", "remote_tool_request", "policy", "model_step"] }).notNull(),
    code: text("code").notNull(),
    severity: text("severity", { enum: ["warning", "error"] }).notNull(),
    message: text("message").notNull(),
    modelProvider: text("model_provider"),
    modelId: text("model_id"),
    toolCallId: text("tool_call_id"),
    toolName: text("tool_name"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    payload: text("payload", { mode: "json" }).notNull()
  },
  (table) => [
    index("agent_error_events_run_id_idx").on(table.runId, table.createdAt),
    index("agent_error_events_conversation_idx").on(table.conversationId, table.createdAt),
    index("agent_error_events_source_idx").on(table.source, table.createdAt)
  ]
);

export const problemSources = sqliteTable("problem_sources", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["geochat_benchmark_case", "gaokao_source_collection", "manual"] }).notNull(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  sourcePath: text("source_path"),
  sourceHash: text("source_hash").notNull(),
  importedAt: integer("imported_at", { mode: "timestamp_ms" }).notNull(),
  rawMetadata: text("raw_metadata", { mode: "json" }).notNull()
});

export const problems = sqliteTable(
  "problems",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    sourceItemId: text("source_item_id").notNull(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    answer: text("answer"),
    analysis: text("analysis"),
    kind: text("kind", { enum: ["math_problem", "exploration", "regression"] }).notNull(),
    taskType: text("task_type", { enum: ["draw", "solve", "explain", "construct", "diagnose", "revise", "mixed", "animation"] }).notNull(),
    questionType: text("question_type", { enum: ["mcq", "fill_blank", "open_ended", "curated"] }).notNull(),
    paper: text("paper"),
    year: text("year"),
    score: integer("score"),
    category: text("category"),
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).notNull(),
    visualPotential: integer("visual_potential", { mode: "boolean" }).notNull(),
    rawPayload: text("raw_payload", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => [
    uniqueIndex("problems_source_item_uidx").on(table.sourceId, table.sourceItemId),
    index("problems_search_idx").on(table.taskType, table.difficulty, table.visualPotential),
    check("problems_visual_potential_ck", sql`${table.visualPotential} IN (0, 1)`)
  ]
);

export const problemTags = sqliteTable(
  "problem_tags",
  {
    problemId: text("problem_id").notNull(),
    tag: text("tag").notNull()
  },
  (table) => [uniqueIndex("problem_tags_uidx").on(table.problemId, table.tag), index("problem_tags_tag_idx").on(table.tag)]
);

export const problemTopics = sqliteTable(
  "problem_topics",
  {
    problemId: text("problem_id").notNull(),
    topic: text("topic").notNull()
  },
  (table) => [uniqueIndex("problem_topics_uidx").on(table.problemId, table.topic), index("problem_topics_topic_idx").on(table.topic)]
);

export const problemSets = sqliteTable(
  "problem_sets",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    sourceId: text("source_id").notNull(),
    kind: text("kind", { enum: ["curated", "generated", "imported", "eval"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => [uniqueIndex("problem_sets_slug_uidx").on(table.slug)]
);

export const problemSetItems = sqliteTable(
  "problem_set_items",
  {
    setId: text("set_id").notNull(),
    problemId: text("problem_id").notNull(),
    sortOrder: integer("sort_order").notNull()
  },
  (table) => [
    uniqueIndex("problem_set_items_uidx").on(table.setId, table.problemId),
    index("problem_set_items_set_order_idx").on(table.setId, table.sortOrder)
  ]
);

export const problemAttempts = sqliteTable(
  "problem_attempts",
  {
    id: text("id").primaryKey(),
    problemId: text("problem_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    ownerUserId: text("owner_user_id"),
    runId: text("run_id"),
    status: text("status", { enum: ["started", "completed", "failed"] }).notNull(),
    modelProvider: text("model_provider"),
    modelId: text("model_id"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    userRating: integer("user_rating"),
    notes: text("notes")
  },
  (table) => [
    index("problem_attempts_owner_idx").on(table.ownerUserId, table.startedAt),
    index("problem_attempts_problem_idx").on(table.problemId, table.startedAt),
    check("problem_attempts_lifecycle_ck", sql`
      (${table.status} = 'started' AND ${table.completedAt} IS NULL) OR
      (${table.status} IN ('completed', 'failed') AND ${table.completedAt} IS NOT NULL)
    `)
  ]
);

export const unifiedProblemSources = sqliteTable(
  "unified_problem_sources",
  {
    id: text("id").primaryKey(),
    requestedId: text("requested_id"),
    repoId: text("repo_id").notNull(),
    groupName: text("group_name", { enum: ["production", "external", "reasoning", "evaluation"] }).notNull(),
    commitSha: text("commit_sha"),
    license: text("license"),
    localDir: text("local_dir"),
    sourceHash: text("source_hash").notNull(),
    importedAt: integer("imported_at", { mode: "timestamp_ms" }).notNull(),
    rawMetadata: text("raw_metadata", { mode: "json" }).notNull()
  },
  (table) => [
    uniqueIndex("unified_problem_sources_repo_uidx").on(table.repoId, table.groupName),
    index("unified_problem_sources_group_idx").on(table.groupName)
  ]
);

export const unifiedProblemRecords = sqliteTable(
  "unified_problem_records",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    sourceItemId: text("source_item_id"),
    sourceFile: text("source_file").notNull(),
    sourceIndex: integer("source_index").notNull(),
    sourceSplit: text("source_split"),
    datasetId: text("dataset_id").notNull(),
    groupName: text("group_name", { enum: ["production", "external", "reasoning", "evaluation"] }).notNull(),
    modality: text("modality", { enum: ["text", "image", "multimodal"] }).notNull(),
    construction: text("construction", {
      enum: ["open_ended", "multiple_choice", "fill_blank", "worked_solution", "reasoning_trace"]
    }).notNull(),
    prompt: text("prompt").notNull(),
    answerFinal: text("answer_final"),
    answerType: text("answer_type", { enum: ["label", "free_form", "numeric", "expression", "multi_label", "unknown"] }),
    subject: text("subject"),
    grade: text("grade"),
    difficulty: text("difficulty"),
    language: text("language"),
    license: text("license"),
    mediaCount: integer("media_count").notNull().default(0),
    choiceCount: integer("choice_count").notNull().default(0),
    recordPayload: text("record_payload", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => [
    uniqueIndex("unified_problem_records_source_item_uidx").on(table.sourceId, table.sourceFile, table.sourceIndex),
    index("unified_problem_records_dataset_split_idx").on(table.datasetId, table.sourceSplit),
    index("unified_problem_records_group_idx").on(table.groupName, table.datasetId),
    index("unified_problem_records_shape_idx").on(table.construction, table.modality),
    index("unified_problem_records_taxonomy_idx").on(table.subject, table.grade)
  ]
);
