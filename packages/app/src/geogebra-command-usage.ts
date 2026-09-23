import type { AgentRunLedgerRecord, AgentRunStatus, AgentRunToolRecord } from "./run-ledger";
import type { GeoGebraCommandTagMatch } from "./geogebra-command-reference";

export type GeoGebraCommandUsageItem = {
  commandName: string;
  executedCount: number;
  succeededCount: number;
  failedCount: number;
  toolCallCount: number;
  runCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sampleCommands: string[];
};

export type GeoGebraCommandSearchTagUsageItem = {
  tag: string;
  count: number;
  runCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type GeoGebraCommandSearchQueryUsageItem = {
  query: string;
  tags: string[];
  tagMatch: GeoGebraCommandTagMatch;
  count: number;
  runCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type AgentRunResultQuality = "clean_success" | "recovered_success" | "canvas_failed" | "model_failed";

export type AgentRunQualityItem = {
  runId: string;
  conversationId: string;
  status: AgentRunStatus;
  quality: AgentRunResultQuality;
  reason: string;
  failedExecuteCount: number;
  succeededExecuteCount: number;
  verifiedAfterWrite: boolean;
  failureCard: boolean;
  maxCanvasElementCount: number;
};

export type AgentRunQualitySummary = Record<AgentRunResultQuality, number>;

export type GeoGebraCommandUsageStats = {
  generatedAt: string;
  runCount: number;
  toolCallCount: number;
  executeToolCallCount: number;
  searchToolCallCount: number;
  runQuality: AgentRunQualitySummary;
  runQualityItems: AgentRunQualityItem[];
  commands: GeoGebraCommandUsageItem[];
  searchTags: GeoGebraCommandSearchTagUsageItem[];
  searchQueries: GeoGebraCommandSearchQueryUsageItem[];
};

type MutableUsageItem = Omit<GeoGebraCommandUsageItem, "runCount"> & {
  runIds: Set<string>;
  toolCallIds: Set<string>;
};

type MutableSearchTagUsageItem = Omit<GeoGebraCommandSearchTagUsageItem, "runCount"> & {
  runIds: Set<string>;
};

type MutableSearchQueryUsageItem = Omit<GeoGebraCommandSearchQueryUsageItem, "runCount"> & {
  runIds: Set<string>;
};

export function collectGeoGebraCommandUsageStats(runs: readonly AgentRunLedgerRecord[], generatedAt = new Date().toISOString()): GeoGebraCommandUsageStats {
  const commands = new Map<string, MutableUsageItem>();
  const searchTags = new Map<string, MutableSearchTagUsageItem>();
  const searchQueries = new Map<string, MutableSearchQueryUsageItem>();
  const runQualityItems: AgentRunQualityItem[] = [];
  const runQuality = createEmptyRunQualitySummary();
  let toolCallCount = 0;
  let executeToolCallCount = 0;
  let searchToolCallCount = 0;

  for (const run of runs) {
    const qualityItem = classifyAgentRunResultQuality(run);
    runQualityItems.push(qualityItem);
    runQuality[qualityItem.quality] += 1;
    for (const tool of run.tools) {
      toolCallCount += 1;
      if (tool.toolName === "executeGeoGebraCommands") {
        executeToolCallCount += 1;
        collectExecuteToolUsage(commands, run, tool);
      }
      if (tool.toolName === "searchGeoGebraCommands") {
        searchToolCallCount += 1;
        collectSearchToolUsage(searchTags, searchQueries, run, tool);
      }
    }
  }

  return {
    generatedAt,
    runCount: runs.length,
    toolCallCount,
    executeToolCallCount,
    searchToolCallCount,
    runQuality,
    runQualityItems,
    commands: [...commands.values()].map(finalizeCommandUsageItem).sort(compareCommandUsageItems),
    searchTags: [...searchTags.values()].map(finalizeSearchTagUsageItem).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    searchQueries: [...searchQueries.values()].map(finalizeSearchQueryUsageItem).sort(compareSearchQueryUsageItems)
  };
}

export function classifyAgentRunResultQuality(run: AgentRunLedgerRecord): AgentRunQualityItem {
  const executeTools = run.tools.filter((tool) => tool.toolName === "executeGeoGebraCommands");
  const failedExecuteCount = executeTools.filter((tool) => tool.status === "failed").length;
  const succeededExecuteTools = executeTools.filter((tool) => tool.status === "succeeded");
  const succeededExecuteCount = succeededExecuteTools.length;
  const latestSucceededExecuteAt = latestToolTimestamp(succeededExecuteTools);
  const verifiedAfterWrite = latestSucceededExecuteAt !== null && run.tools.some((tool) => isCanvasVerificationTool(tool, latestSucceededExecuteAt));
  const hasSuccessfulPngAfterWrite = latestSucceededExecuteAt !== null && run.tools.some((tool) => isSuccessfulPngVerificationTool(tool, latestSucceededExecuteAt));
  const failureCard = hasGeoGebraFailureCard(run);
  const maxCanvasElementCount = maxCanvasElementCountFromRun(run);
  const hasUnrecoveredFailedExecute = latestSucceededExecuteAt === null
    ? failedExecuteCount > 0
    : executeTools.some((tool) => tool.status === "failed" && toolTimestamp(tool) >= latestSucceededExecuteAt);

  if (run.status !== "succeeded") {
    return createRunQualityItem(run, "model_failed", run.error ?? `run status is ${run.status}`, failedExecuteCount, succeededExecuteCount, verifiedAfterWrite, failureCard, maxCanvasElementCount);
  }
  if (failureCard) {
    return createRunQualityItem(run, "canvas_failed", "assistant emitted GeoGebra failure card", failedExecuteCount, succeededExecuteCount, verifiedAfterWrite, failureCard, maxCanvasElementCount);
  }
  if (succeededExecuteCount === 0) {
    if (failedExecuteCount === 0) {
      return createRunQualityItem(run, "clean_success", "text-only solution completed without canvas commands", failedExecuteCount, succeededExecuteCount, verifiedAfterWrite, failureCard, maxCanvasElementCount);
    }
    return createRunQualityItem(run, "canvas_failed", "GeoGebra command execution failed before any successful canvas write", failedExecuteCount, succeededExecuteCount, verifiedAfterWrite, failureCard, maxCanvasElementCount);
  }
  if (hasUnrecoveredFailedExecute) {
    return createRunQualityItem(run, "canvas_failed", "last GeoGebra command execution failed", failedExecuteCount, succeededExecuteCount, verifiedAfterWrite, failureCard, maxCanvasElementCount);
  }
  if (!verifiedAfterWrite) {
    return createRunQualityItem(run, "canvas_failed", "canvas was not verified after the last write", failedExecuteCount, succeededExecuteCount, verifiedAfterWrite, failureCard, maxCanvasElementCount);
  }
  if (maxCanvasElementCount <= 0 && !hasSuccessfulPngAfterWrite) {
    return createRunQualityItem(run, "canvas_failed", "canvas verification found no drawable objects", failedExecuteCount, succeededExecuteCount, verifiedAfterWrite, failureCard, maxCanvasElementCount);
  }
  if (failedExecuteCount > 0) {
    return createRunQualityItem(run, "recovered_success", "failed commands were later recovered and verified", failedExecuteCount, succeededExecuteCount, verifiedAfterWrite, failureCard, maxCanvasElementCount);
  }
  return createRunQualityItem(run, "clean_success", "commands executed and verified without command failures", failedExecuteCount, succeededExecuteCount, verifiedAfterWrite, failureCard, maxCanvasElementCount);
}

export function extractGeoGebraCommandName(command: string): string {
  const normalized = command.trim();
  if (!normalized) return "Empty";

  if (/^\s*[A-Za-z][A-Za-z0-9_]*\s*\(\s*x\s*\)\s*=/u.test(normalized)) return "Function";

  const assignedCommand = normalized.match(/^\s*[A-Za-z][A-Za-z0-9_]*(?:\([^)]*\))?\s*=\s*([A-Za-z][A-Za-z0-9_]*)\s*\(/u)?.[1];
  if (assignedCommand) return assignedCommand;

  const directCommand = normalized.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*\(/u)?.[1];
  if (directCommand) return directCommand;

  if (/^\s*[A-Za-z][A-Za-z0-9_]*\s*=\s*\([^)]*,[^)]*(?:,[^)]*)?\)\s*$/u.test(normalized)) return "Point";
  if (/^\s*[A-Za-z][A-Za-z0-9_]*\s*:\s*(?:[xy]\s*=|.+[xy].*=)/u.test(normalized)) return "LineEquation";
  if (/^\s*[A-Za-z][A-Za-z0-9_]*\s*=/u.test(normalized)) return "Assignment";
  return "Expression";
}

function collectExecuteToolUsage(commands: Map<string, MutableUsageItem>, run: AgentRunLedgerRecord, tool: AgentRunToolRecord) {
  for (const command of commandsFromExecuteTool(tool)) {
    const commandName = extractGeoGebraCommandName(command);
    const item = commands.get(commandName) ?? createCommandUsageItem(commandName);
    item.executedCount += 1;
    if (tool.status === "succeeded") item.succeededCount += 1;
    if (tool.status === "failed") item.failedCount += 1;
    item.runIds.add(run.runId);
    item.toolCallIds.add(`${run.runId}:${tool.toolCallId}`);
    item.firstSeenAt = earliestTimestamp(item.firstSeenAt, tool.startedAt);
    item.lastSeenAt = latestTimestamp(item.lastSeenAt, tool.completedAt ?? tool.startedAt);
    if (item.sampleCommands.length < 5 && !item.sampleCommands.includes(command)) item.sampleCommands.push(command);
    commands.set(commandName, item);
  }
}

function collectSearchToolUsage(
  searchTags: Map<string, MutableSearchTagUsageItem>,
  searchQueries: Map<string, MutableSearchQueryUsageItem>,
  run: AgentRunLedgerRecord,
  tool: AgentRunToolRecord
) {
  const args = searchArgs(tool.args);
  const tags = args.tags.length > 0 ? args.tags : ["untagged"];
  const query = args.query?.trim() || "(empty)";
  const seenAt = tool.completedAt ?? tool.startedAt;

  for (const tag of tags) {
    const tagItem = searchTags.get(tag) ?? {
      tag,
      count: 0,
      runIds: new Set<string>(),
      firstSeenAt: null,
      lastSeenAt: null
    };
    tagItem.count += 1;
    tagItem.runIds.add(run.runId);
    tagItem.firstSeenAt = earliestTimestamp(tagItem.firstSeenAt, tool.startedAt);
    tagItem.lastSeenAt = latestTimestamp(tagItem.lastSeenAt, seenAt);
    searchTags.set(tag, tagItem);
  }

  const queryKey = `${args.tagMatch}\u0000${tags.join("\u0000")}\u0000${query.toLowerCase()}`;
  const queryItem = searchQueries.get(queryKey) ?? {
    query,
    tags,
    tagMatch: args.tagMatch,
    count: 0,
    runIds: new Set<string>(),
    firstSeenAt: null,
    lastSeenAt: null
  };
  queryItem.count += 1;
  queryItem.runIds.add(run.runId);
  queryItem.firstSeenAt = earliestTimestamp(queryItem.firstSeenAt, tool.startedAt);
  queryItem.lastSeenAt = latestTimestamp(queryItem.lastSeenAt, seenAt);
  searchQueries.set(queryKey, queryItem);
}

function commandsFromExecuteTool(tool: AgentRunToolRecord) {
  const args = tool.args as { commands?: unknown } | undefined;
  return Array.isArray(args?.commands) ? args.commands.filter((item): item is string => typeof item === "string") : [];
}

function createEmptyRunQualitySummary(): AgentRunQualitySummary {
  return {
    clean_success: 0,
    recovered_success: 0,
    canvas_failed: 0,
    model_failed: 0
  };
}

function createRunQualityItem(
  run: AgentRunLedgerRecord,
  quality: AgentRunResultQuality,
  reason: string,
  failedExecuteCount: number,
  succeededExecuteCount: number,
  verifiedAfterWrite: boolean,
  failureCard: boolean,
  maxCanvasElementCount: number
): AgentRunQualityItem {
  return {
    runId: run.runId,
    conversationId: run.conversationId,
    status: run.status,
    quality,
    reason,
    failedExecuteCount,
    succeededExecuteCount,
    verifiedAfterWrite,
    failureCard,
    maxCanvasElementCount
  };
}

function latestToolTimestamp(tools: readonly AgentRunToolRecord[]) {
  let latest: string | null = null;
  for (const tool of tools) {
    latest = latestTimestamp(latest, tool.completedAt ?? tool.startedAt);
  }
  return latest;
}

function toolTimestamp(tool: AgentRunToolRecord) {
  return tool.completedAt ?? tool.startedAt;
}

function isCanvasVerificationTool(tool: AgentRunToolRecord, after: string) {
  if (tool.status !== "succeeded") return false;
  if (tool.toolName !== "getCanvasContext" && tool.toolName !== "getPNGBase64") return false;
  return toolTimestamp(tool) >= after;
}

function isSuccessfulPngVerificationTool(tool: AgentRunToolRecord, after: string) {
  return tool.status === "succeeded" && tool.toolName === "getPNGBase64" && toolTimestamp(tool) >= after;
}

function hasGeoGebraFailureCard(run: AgentRunLedgerRecord) {
  return run.tools.some((tool) => {
    if (tool.toolName !== "showSolutionSteps") return false;
    const serialized = safeSerializeToolPayload(tool);
    return serialized.includes("GeoGebra 命令修复失败") || serialized.includes("GeoGebra command repair failed") || serialized.includes("命令修复未能完成");
  });
}

function maxCanvasElementCountFromRun(run: AgentRunLedgerRecord) {
  let maxCount = 0;
  for (const tool of run.tools) {
    maxCount = Math.max(maxCount, maxCanvasElementCountFromValue(tool.result));
    maxCount = Math.max(maxCount, maxCanvasElementCountFromValue(tool.canvasAfter));
  }
  return maxCount;
}

function maxCanvasElementCountFromValue(value: unknown, depth = 0): number {
  if (!value || depth > 6) return 0;
  if (Array.isArray(value)) {
    return value.reduce((maxCount, item) => Math.max(maxCount, maxCanvasElementCountFromValue(item, depth + 1)), 0);
  }
  if (typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  const directCount = typeof record.element_count === "number" && Number.isFinite(record.element_count) ? record.element_count : 0;
  return Object.values(record).reduce<number>((maxCount, item) => Math.max(maxCount, maxCanvasElementCountFromValue(item, depth + 1)), directCount);
}

function safeSerializeToolPayload(tool: AgentRunToolRecord) {
  try {
    return JSON.stringify({ args: tool.args, result: tool.result, error: tool.error });
  } catch (caughtError) {
    console.error("[ERROR] Caught exception at packages/app/src/geogebra-command-usage.ts:323", caughtError);
    return `${tool.error ?? ""}`;
  }
}

function searchArgs(args: unknown) {
  if (!args || typeof args !== "object") return { tags: [], tagMatch: "any" as const };
  const payload = args as { query?: unknown; tags?: unknown; tagMatch?: unknown };
  return {
    query: typeof payload.query === "string" ? payload.query : undefined,
    tags: normalizeSearchTags(payload.tags),
    tagMatch: payload.tagMatch === "all" ? "all" as const : "any" as const
  };
}

function normalizeSearchTags(tags: unknown) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function createCommandUsageItem(commandName: string): MutableUsageItem {
  return {
    commandName,
    executedCount: 0,
    succeededCount: 0,
    failedCount: 0,
    toolCallCount: 0,
    runIds: new Set<string>(),
    toolCallIds: new Set<string>(),
    firstSeenAt: null,
    lastSeenAt: null,
    sampleCommands: []
  };
}

function finalizeCommandUsageItem(item: MutableUsageItem): GeoGebraCommandUsageItem {
  return {
    commandName: item.commandName,
    executedCount: item.executedCount,
    succeededCount: item.succeededCount,
    failedCount: item.failedCount,
    toolCallCount: item.toolCallIds.size,
    runCount: item.runIds.size,
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
    sampleCommands: item.sampleCommands
  };
}

function finalizeSearchTagUsageItem(item: MutableSearchTagUsageItem): GeoGebraCommandSearchTagUsageItem {
  return {
    tag: item.tag,
    count: item.count,
    runCount: item.runIds.size,
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt
  };
}

function finalizeSearchQueryUsageItem(item: MutableSearchQueryUsageItem): GeoGebraCommandSearchQueryUsageItem {
  return {
    query: item.query,
    tags: item.tags,
    tagMatch: item.tagMatch,
    count: item.count,
    runCount: item.runIds.size,
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt
  };
}

function compareCommandUsageItems(a: GeoGebraCommandUsageItem, b: GeoGebraCommandUsageItem) {
  return b.executedCount - a.executedCount || b.runCount - a.runCount || a.commandName.localeCompare(b.commandName);
}

function compareSearchQueryUsageItems(a: GeoGebraCommandSearchQueryUsageItem, b: GeoGebraCommandSearchQueryUsageItem) {
  return b.count - a.count
    || a.tagMatch.localeCompare(b.tagMatch)
    || a.tags.join("\u0000").localeCompare(b.tags.join("\u0000"))
    || a.query.localeCompare(b.query);
}

function earliestTimestamp(current: string | null, candidate?: string | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate < current ? candidate : current;
}

function latestTimestamp(current: string | null, candidate?: string | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate > current ? candidate : current;
}
