import { createMemo, For, Show } from "solid-js";
import {
  type DesktopFunctionCall,
  type FunctionCallToolName,
  type ToolExecutionResult
} from "@geochat-ai/app";
import { toolDisplayInfo, toolStatusLabel } from "../functioncalls";
import { interpolate, type RendererI18n } from "../i18n";
import { toolActivityText } from "../tool-activity";
import { toolCallVisualStatus } from "../workbench-tool-calls";

export function localizedToolDisplayInfo(toolName: FunctionCallToolName, copy: RendererI18n) {
  return copy.tools.displays[toolName] ?? toolDisplayInfo(toolName);
}

function localizedToolStatusLabel(toolName: FunctionCallToolName, status: DesktopFunctionCall["status"], hasError: boolean, copy: RendererI18n) {
  if (status === "running") return localizedToolDisplayInfo(toolName, copy).running;
  if (status === "done") return localizedToolDisplayInfo(toolName, copy).done;
  if (status === "error" || hasError) return localizedToolDisplayInfo(toolName, copy).error;
  return toolStatusLabel(toolName, status, hasError);
}

function toolExecutionResult(call: DesktopFunctionCall) {
  return call.result as ToolExecutionResult | undefined;
}

function commandResultsForCall(call: DesktopFunctionCall) {
  return toolExecutionResult(call)?.results ?? [];
}

type SkillSummaryForTrace = {
  name?: string;
  description?: string;
  category?: string;
  parent?: string;
  level?: number;
  recipes?: string[];
  score?: number;
  matchedFields?: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function skillSummaryFromUnknown(value: unknown): SkillSummaryForTrace | null {
  const record = asRecord(value);
  if (!record || typeof record.name !== "string") return null;
  return {
    name: record.name,
    description: typeof record.description === "string" ? record.description : undefined,
    category: typeof record.category === "string" ? record.category : undefined,
    parent: typeof record.parent === "string" ? record.parent : undefined,
    level: typeof record.level === "number" ? record.level : undefined,
    recipes: stringArray(record.recipes),
    score: typeof record.score === "number" ? record.score : undefined,
    matchedFields: stringArray(record.matchedFields)
  };
}

function skillTraceData(call: DesktopFunctionCall) {
  if (!["listSkills", "searchSkills", "loadSkill", "activateSkill"].includes(call.toolName)) return null;
  const payload = asRecord(toolExecutionResult(call)?.result);
  if (!payload) return null;
  if (call.toolName === "listSkills") {
    const skills = Array.isArray(payload.skills) ? payload.skills.map(skillSummaryFromUnknown).filter((skill): skill is SkillSummaryForTrace => Boolean(skill)) : [];
    return { kind: "list" as const, skills, count: typeof payload.count === "number" ? payload.count : skills.length };
  }
  if (call.toolName === "searchSkills") {
    const matches = Array.isArray(payload.matches) ? payload.matches.map(skillSummaryFromUnknown).filter((skill): skill is SkillSummaryForTrace => Boolean(skill)) : [];
    return {
      kind: "search" as const,
      query: typeof payload.query === "string" ? payload.query : "",
      matches,
      count: typeof payload.count === "number" ? payload.count : matches.length
    };
  }
  const skill = skillSummaryFromUnknown(payload);
  return skill ? { kind: "load" as const, skill } : null;
}

function skillInsightTitle(data: NonNullable<ReturnType<typeof skillTraceData>>, copy: RendererI18n) {
  if (data.kind === "list") return interpolate(copy.tools.skillListSummary, { count: data.count });
  if (data.kind === "search") return interpolate(copy.tools.skillSearchSummary, { count: data.count, query: data.query || "--" });
  return interpolate(copy.tools.skillLoadSummary, { skill: data.skill.name ?? "--" });
}

function metricForCall(call: DesktopFunctionCall, copy: RendererI18n) {
  const result = toolExecutionResult(call);
  if (call.toolName === "executeGeoGebraCommands") return interpolate(copy.tools.commandCount, { count: commandResultsForCall(call).length });
  if (call.toolName === "createGeometryPlan") {
    const plan = geometryPlanPayloadFromCall(call)?.plan;
    return plan && typeof plan === "object" && "steps" in plan && Array.isArray(plan.steps) ? interpolate(copy.tools.stepCount, { count: plan.steps.length }) : copy.tools.plan;
  }
  if (call.toolName === "getCanvasContext") {
    const context = result?.canvasContext;
    if (context && typeof context === "object" && "element_count" in context) return interpolate(copy.tools.objectCount, { count: Number(context.element_count) });
  }
  if (call.toolName === "getPNGBase64") {
    const value = result?.result;
    if (value && typeof value === "object" && "byteEstimate" in value) return `${Math.round(Number(value.byteEstimate) / 1024)} KB`;
  }
  if (call.toolName === "searchGeoGebraCommands") return interpolate(copy.tools.referenceCount, { count: Array.isArray(result?.result) ? result.result.length : 0 });
  if (call.toolName === "listSkills") {
    const data = skillTraceData(call);
    return data?.kind === "list" ? interpolate(copy.tools.skillCount, { count: data.count }) : localizedToolDisplayInfo(call.toolName, copy).metric;
  }
  if (call.toolName === "searchSkills") {
    const data = skillTraceData(call);
    return data?.kind === "search" ? interpolate(copy.tools.skillMatchCount, { count: data.count }) : localizedToolDisplayInfo(call.toolName, copy).metric;
  }
  if (call.toolName === "loadSkill" || call.toolName === "activateSkill") {
    const data = skillTraceData(call);
    return data?.kind === "load" && data.skill.name ? interpolate(copy.tools.skillLoaded, { skill: data.skill.name }) : localizedToolDisplayInfo(call.toolName, copy).metric;
  }
  return localizedToolDisplayInfo(call.toolName, copy).metric;
}

function geometryPlanPayloadFromCall(call: DesktopFunctionCall) {
  if (call.toolName !== "createGeometryPlan") return null;
  const result = toolExecutionResult(call)?.result;
  if (!result || typeof result !== "object") return null;
  return result as {
    plan?: {
      title?: string;
      taskType?: string;
      objects?: Array<{ id?: string; kind?: string; subtype?: string; role?: string }>;
      steps?: Array<{ id?: string; kind?: string; output?: string; object?: string }>;
      verificationTargets?: Array<{ kind?: string; object?: string; expected?: string; dependsOn?: string[]; description?: string }>;
      explanationGoals?: string[];
    };
    compilation?: { commands?: string[]; warnings?: string[] };
    executeArgs?: { commands?: string[] };
  };
}

function latestCall(calls: DesktopFunctionCall[], predicate?: (call: DesktopFunctionCall) => boolean) {
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const call = calls[index];
    if (!predicate || predicate(call)) return call;
  }
  return undefined;
}

function toolTraceCounts(calls: DesktopFunctionCall[]) {
  return calls.reduce(
    (counts, call) => {
      if (call.status === "running") counts.running += 1;
      else if (call.status === "error" || call.error) counts.failed += 1;
      else if (call.status === "done") counts.done += 1;
      return counts;
    },
    { done: 0, failed: 0, running: 0, total: calls.length }
  );
}

function toolTraceCurrentText(calls: DesktopFunctionCall[], copy: RendererI18n) {
  const running = latestCall(calls, (call) => call.status === "running");
  if (running) return toolActivityText(copy, running.toolName, "running");
  const failed = latestCall(calls, (call) => call.status === "error" || Boolean(call.error));
  if (failed) return localizedToolStatusLabel(failed.toolName, failed.status, Boolean(failed.error), copy);
  const latest = latestCall(calls);
  return latest ? localizedToolStatusLabel(latest.toolName, latest.status, Boolean(latest.error), copy) : copy.chat.backendToolSubmitted;
}

export function ToolCallTrace(props: {
  calls?: DesktopFunctionCall[];
  copy: RendererI18n;
  replayingCallId?: string | null;
  onReplayCommands?: (call: DesktopFunctionCall) => void;
}) {
  const calls = createMemo(() => props.calls ?? []);
  const visualStatus = createMemo(() => toolCallVisualStatus(calls()));
  const counts = createMemo(() => toolTraceCounts(calls()));
  const summaryText = createMemo(() => {
    const value = counts();
    if (value.failed) return interpolate(props.copy.tools.traceFailed, { count: value.failed, total: value.total });
    if (value.running) return interpolate(props.copy.tools.traceRunning, { count: value.running, total: value.total });
    return interpolate(props.copy.tools.traceDone, { done: value.done, total: value.total });
  });
  return (
    <Show when={calls().length}>
      <details
        classList={{
          "tool-trace": true,
          success: visualStatus() === "success",
          repairing: visualStatus() === "repairing",
          failed: visualStatus() === "failed"
        }}
        open={visualStatus() === "failed" || visualStatus() === "repairing"}
      >
        <summary class="tool-trace-summary">
          <span class="tool-trace-status-dot" aria-hidden="true" />
          <span class="tool-trace-summary-main">
            <span>{props.copy.tools.traceTitle}</span>
            <em>{toolTraceCurrentText(calls(), props.copy)}</em>
          </span>
          <b>{summaryText()}</b>
        </summary>
        <div class="tool-call-list">
          <For each={calls()}>
            {(call) => (
              <div classList={{ "tool-call": true, failed: call.status === "error" || Boolean(call.error) }}>
                <div class="tool-call-head">
                  <strong>{localizedToolDisplayInfo(call.toolName, props.copy).label}</strong>
                  <span>{localizedToolStatusLabel(call.toolName, call.status, Boolean(call.error), props.copy)}</span>
                </div>
                <div class="tool-call-meta">
                  <span>{props.copy.tools.operations}</span>
                  <span>{metricForCall(call, props.copy)}</span>
                </div>
                <Show when={commandResultsForCall(call).length}>
                  <details class="command-results">
                    <summary>
                      <span>{props.copy.tools.viewCommands}</span>
                      <Show when={props.onReplayCommands}>
                        <button
                          class="command-rerun-button"
                          type="button"
                          disabled={props.replayingCallId === (call.id || call.callId)}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            props.onReplayCommands?.(call);
                          }}
                        >
                          {props.replayingCallId === (call.id || call.callId) ? props.copy.tools.rerunCommandsBusy : props.copy.tools.rerunCommands}
                        </button>
                      </Show>
                    </summary>
                    <For each={commandResultsForCall(call)}>
                      {(result) => (
                        <div classList={{ "command-result": true, failed: !result.success }}>
                          <code>{result.command}</code>
                          <span>{result.success ? "ok" : result.error}</span>
                        </div>
                      )}
                    </For>
                  </details>
                </Show>
                <SkillToolInsight call={call} copy={props.copy} />
                <Show when={call.error}>
                  <p class="tool-error">{call.error}</p>
                </Show>
              </div>
            )}
          </For>
        </div>
      </details>
    </Show>
  );
}

function SkillToolInsight(props: { call: DesktopFunctionCall; copy: RendererI18n }) {
  const data = createMemo(() => skillTraceData(props.call));
  const topSkills = createMemo(() => {
    const value = data();
    if (!value) return [];
    if (value.kind === "list") return value.skills.slice(0, 6);
    if (value.kind === "search") return value.matches.slice(0, 5);
    return [value.skill];
  });
  return (
    <Show when={data()}>
      {(value) => (
        <div class="skill-tool-insight">
          <div class="skill-tool-insight-head">
            <strong>{skillInsightTitle(value(), props.copy)}</strong>
          </div>
          <div class="skill-tool-result-list">
            <For each={topSkills()}>
              {(skill) => (
                <div class="skill-tool-result">
                  <div>
                    <b>{skill.name}</b>
                    <Show when={skill.description}>
                      <span>{skill.description}</span>
                    </Show>
                  </div>
                  <div class="skill-tool-badges">
                    <Show when={skill.level}>
                      <span>{interpolate(props.copy.tools.skillLevel, { level: skill.level ?? 1 })}</span>
                    </Show>
                    <Show when={skill.parent}>
                      <span>{interpolate(props.copy.tools.skillParent, { parent: skill.parent ?? "--" })}</span>
                    </Show>
                    <Show when={typeof skill.score === "number"}>
                      <span>{interpolate(props.copy.tools.skillScore, { score: skill.score ?? 0 })}</span>
                    </Show>
                    <Show when={skill.matchedFields?.length}>
                      <span>{interpolate(props.copy.tools.skillMatchedFields, { fields: skill.matchedFields?.join(", ") ?? "--" })}</span>
                    </Show>
                  </div>
                  <Show when={skill.recipes?.length}>
                    <div class="skill-tool-recipes">
                      <For each={skill.recipes?.slice(0, 3) ?? []}>
                        {(recipe) => <span>{recipe}</span>}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      )}
    </Show>
  );
}
