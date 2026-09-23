import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    revision: integer("revision").notNull().default(0),
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

export const agentErrorEvents = sqliteTable(
  "agent_error_events",
  {
    eventId: text("event_id").primaryKey(),
    runId: text("run_id").notNull(),
    conversationId: text("conversation_id"),
    source: text("source", { enum: ["run", "tool"] }).notNull(),
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

export const benchmarkRuns = sqliteTable(
  "benchmark_runs",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id"),
    suiteId: text("suite_id").notNull(),
    suiteVersion: text("suite_version").notNull(),
    suiteHash: text("suite_hash").notNull(),
    configHash: text("config_hash").notNull(),
    status: text("status", { enum: ["running", "completed", "failed", "interrupted", "cancelled"] }).notNull(),
    totalCases: integer("total_cases").notNull(),
    completedCases: integer("completed_cases").notNull().default(0),
    passedCases: integer("passed_cases").notNull().default(0),
    failedCases: integer("failed_cases").notNull().default(0),
    config: text("config", { mode: "json" }).notNull(),
    metrics: text("metrics", { mode: "json" }).notNull(),
    evidenceRefs: text("evidence_refs", { mode: "json" }).notNull(),
    error: text("error"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" })
  },
  (table) => [
    index("benchmark_runs_owner_started_idx").on(table.ownerUserId, table.startedAt),
    index("benchmark_runs_suite_started_idx").on(table.suiteId, table.startedAt),
    check("benchmark_runs_total_cases_ck", sql`${table.totalCases} >= 0`),
    check("benchmark_runs_case_counts_ck", sql`
      ${table.completedCases} >= 0 AND ${table.passedCases} >= 0 AND ${table.failedCases} >= 0 AND
      ${table.completedCases} <= ${table.totalCases} AND
      ${table.passedCases} + ${table.failedCases} <= ${table.completedCases}
    `),
    check("benchmark_runs_lifecycle_ck", sql`
      (${table.status} = 'running' AND ${table.completedAt} IS NULL) OR
      (${table.status} IN ('completed', 'failed', 'interrupted', 'cancelled') AND ${table.completedAt} IS NOT NULL)
    `)
  ]
);

export const benchmarkCaseResults = sqliteTable(
  "benchmark_case_results",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    caseId: text("case_id").notNull(),
    status: text("status", { enum: ["passed", "failed", "error", "skipped"] }).notNull(),
    score: real("score"),
    metrics: text("metrics", { mode: "json" }).notNull(),
    evidenceRefs: text("evidence_refs", { mode: "json" }).notNull(),
    error: text("error"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => [
    uniqueIndex("benchmark_case_results_run_case_uidx").on(table.runId, table.caseId),
    index("benchmark_case_results_run_idx").on(table.runId, table.completedAt),
    check("benchmark_case_results_score_ck", sql`${table.score} IS NULL OR (${table.score} >= 0 AND ${table.score} <= 1)`),
    check("benchmark_case_results_timeline_ck", sql`${table.startedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}`)
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
