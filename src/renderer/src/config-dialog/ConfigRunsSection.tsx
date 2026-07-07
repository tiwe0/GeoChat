import { RefreshCw, ShieldCheck } from "lucide-solid";
import { For, Show } from "solid-js";
import {
  type AgentRunModelStepRecord,
  type AgentRunPolicyDecisionRecord,
  type AgentRunRunnerPhase,
  type AgentRunRunnerSnapshot,
  type AgentRunStatus,
  type FunctionCallToolName
} from "@geochat-ai/app";
import { toolDisplayInfo } from "../functioncalls";
import { interpolate, type Locale, type RendererI18n } from "../i18n";
import { SectionCard } from "../workbench-ui";

function localizedToolDisplayInfo(toolName: FunctionCallToolName, copy: RendererI18n) {
  return copy.tools.displays[toolName] ?? toolDisplayInfo(toolName);
}

function runStatusLabel(status: AgentRunStatus, copy: RendererI18n) {
  if (status === "succeeded") return copy.status.succeeded;
  if (status === "failed") return copy.status.failed;
  if (status === "cancelled") return copy.status.cancelled;
  return copy.status.running;
}

function runPhaseLabel(phase: AgentRunRunnerPhase, copy: RendererI18n) {
  if (phase === "needs_canvas_read") return copy.status.needsCanvasRead;
  if (phase === "planning") return copy.status.planning;
  if (phase === "writing") return copy.status.writing;
  if (phase === "verifying") return copy.status.verifying;
  if (phase === "repairing") return copy.status.repairing;
  if (phase === "explaining") return copy.status.explaining;
  return copy.status.complete;
}

function toolCallingModeLabel(mode: AgentRunRunnerSnapshot["modelPolicy"]["toolCallingMode"], copy: RendererI18n) {
  if (mode === "native") return copy.status.native;
  if (mode === "assumed") return copy.status.assumed;
  return copy.status.unsupported;
}

function policyDecisionStageLabel(stage: AgentRunPolicyDecisionRecord["stage"], copy: RendererI18n) {
  if (stage === "runner_start") return copy.status.runnerStart;
  if (stage === "runner_continuation") return copy.status.runnerContinuation;
  if (stage === "ledger_tool_event") return copy.status.ledgerToolEvent;
  return copy.status.remoteToolRequest;
}

function policyDecisionKindLabel(kind: AgentRunPolicyDecisionRecord["kind"], copy: RendererI18n) {
  if (kind === "runner_start_enqueued") return copy.status.runnerStartEnqueued;
  if (kind === "runner_continuation_enqueued") return copy.status.runnerContinuationEnqueued;
  if (kind === "runner_finished") return copy.status.runnerFinished;
  if (kind === "workflow_blocked") return copy.status.workflowBlocked;
  if (kind === "tool_boundary_blocked") return copy.status.toolBoundaryBlocked;
  if (kind === "budget_exhausted") return copy.status.budgetExhausted;
  if (kind === "backend_tool_auto_step_limit") return copy.status.backendToolLimit;
  if (kind === "model_error") return copy.status.modelError;
  if (kind === "model_mismatch") return copy.status.modelMismatch;
  return copy.status.toolDeadLetter;
}

function policyDecisionToolLabel(decision: AgentRunPolicyDecisionRecord, copy: RendererI18n) {
  return decision.toolName ? localizedToolDisplayInfo(decision.toolName, copy).label : "--";
}

function modelStepSourceLabel(source: AgentRunModelStepRecord["source"], copy: RendererI18n) {
  return source === "policy" ? copy.status.policy : copy.status.model;
}

function modelStepOutputLabel(step: AgentRunModelStepRecord, copy: RendererI18n) {
  if (step.outputType === "tool" && step.outputToolName) return localizedToolDisplayInfo(step.outputToolName, copy).label;
  if (step.outputType === "finish") return interpolate(copy.runs.textOutput, { count: step.outputTextLength ?? 0 });
  return "--";
}

function runDurationLabel(durationMs?: number | null) {
  if (durationMs === null || durationMs === undefined) return "--";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function formatIsoTime(value?: string | null, locale: Locale = "zh-CN") {
  if (!value) return "--";
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function canvasObjectCount(value: unknown) {
  if (!value || typeof value !== "object") return "--";
  const count = (value as { element_count?: unknown }).element_count;
  return typeof count === "number" ? `${count}` : "--";
}

export function ConfigRunsSection(props: {
  copy: RendererI18n;
  locale: Locale;
  snapshots: AgentRunRunnerSnapshot[] | undefined;
  loading: boolean;
  error: unknown;
  onRefresh: () => void;
}) {
  return (
    <>
      <SectionCard class="config-module-card config-card-wide">
        <div class="mcp-setting">
          <div class="mcp-setting-main">
            <strong>{props.copy.runs.title}</strong>
            <p>{props.copy.runs.body}</p>
          </div>
          <button class="icon-button" type="button" title={props.copy.runs.refresh} data-tooltip={props.copy.runs.refresh} onClick={props.onRefresh}>
            <RefreshCw size={15} />
          </button>
        </div>
      </SectionCard>
      <Show
        when={!props.loading}
        fallback={
          <SectionCard class="config-card-wide">
            <p>{props.copy.runs.loading}</p>
          </SectionCard>
        }
      >
        <Show
          when={!props.error}
          fallback={
            <SectionCard class="config-card-wide">
              <div class="inline-info">
                <ShieldCheck size={20} />
                <div>
                  <strong>{props.copy.runs.unavailableTitle}</strong>
                  <p>{props.error instanceof Error ? props.error.message : String(props.error)}</p>
                </div>
              </div>
            </SectionCard>
          }
        >
          <Show
            when={(props.snapshots ?? []).length}
            fallback={
              <SectionCard class="config-card-wide">
                <p>{props.copy.runs.empty}</p>
              </SectionCard>
            }
          >
            <div class="run-ledger-list">
              <For each={props.snapshots ?? []}>
                {(snapshot) => {
                  const run = snapshot.run;
                  return (
                    <details classList={{ "run-ledger-item": true, failed: run.status === "failed", running: run.status === "running" }}>
                      <summary>
                        <span class="run-status">{runStatusLabel(run.status, props.copy)}</span>
                        <span class={`run-phase ${snapshot.phase}`}>{runPhaseLabel(snapshot.phase, props.copy)}</span>
                        <strong>{run.modelProvider} / {run.modelId}</strong>
                        <span>{formatIsoTime(run.startedAt, props.locale)}</span>
                        <span>{runDurationLabel(run.durationMs)}</span>
                      </summary>
                      <div class="run-ledger-detail">
                        <p>{run.prompt}</p>
                        <div class="run-ledger-metrics">
                          <span>{interpolate(props.copy.runs.tools, { count: run.tools.length })}</span>
                          <span>{interpolate(props.copy.runs.images, { count: run.attachmentCount })}</span>
                          <span>{interpolate(props.copy.runs.phase, { phase: runPhaseLabel(snapshot.phase, props.copy) })}</span>
                          <span>{interpolate(props.copy.runs.toolMode, { mode: toolCallingModeLabel(snapshot.modelPolicy.toolCallingMode, props.copy) })}</span>
                          <span>{snapshot.modelPolicy.supportsImages ? props.copy.runs.supportsImages : props.copy.runs.textOnly}</span>
                          <span>{snapshot.modelPolicy.isKnownModel ? props.copy.runs.knownModel : snapshot.modelPolicy.isCustomModel ? props.copy.runs.customModel : props.copy.runs.unsupportedModel}</span>
                          <span>{interpolate(props.copy.runs.temperature, { value: snapshot.modelPolicy.defaultTemperature })}</span>
                          <span>{interpolate(props.copy.runs.modelSteps, { count: snapshot.modelSteps?.length ?? 0 })}</span>
                          <span>{interpolate(props.copy.runs.token, { value: run.usage?.totalTokens ?? "--" })}</span>
                        </div>
                        <Show when={run.error}>
                          <div class="run-ledger-error">{run.error}</div>
                        </Show>
                        <Show when={snapshot.policyDecisions?.length}>
                          <div class="run-policy-decision-list">
                            <div class="run-ledger-subhead">{props.copy.runs.policyDecisions}</div>
                            <For each={snapshot.policyDecisions ?? []}>
                              {(decision) => (
                                <div classList={{ "run-policy-decision-row": true, blocked: !decision.allowed }}>
                                  <span>{policyDecisionStageLabel(decision.stage, props.copy)}</span>
                                  <strong>{policyDecisionKindLabel(decision.kind, props.copy)}</strong>
                                  <em>{decision.allowed ? props.copy.runs.allowed : props.copy.runs.rejected}</em>
                                  <small>{policyDecisionToolLabel(decision, props.copy)}</small>
                                  <Show when={decision.message}>
                                    <p>{decision.message}</p>
                                  </Show>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                        <Show when={snapshot.modelSteps?.length}>
                          <div class="run-model-step-list">
                            <div class="run-ledger-subhead">{props.copy.runs.modelStepHead}</div>
                            <For each={snapshot.modelSteps ?? []}>
                              {(step) => (
                                <div classList={{ "run-model-step-row": true, failed: step.status === "failed" }}>
                                  <span>{modelStepSourceLabel(step.source, props.copy)}</span>
                                  <strong>{modelStepOutputLabel(step, props.copy)}</strong>
                                  <em>{runStatusLabel(step.status, props.copy)}</em>
                                  <small>{runDurationLabel(step.durationMs)}</small>
                                  <small>{interpolate(props.copy.runs.token, { value: step.usage?.totalTokens ?? "--" })}</small>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                        <div class="run-tool-list">
                          <div class="run-ledger-subhead">{props.copy.runs.toolTrace}</div>
                          <For each={run.tools}>
                            {(toolRecord) => (
                              <div classList={{ "run-tool-row": true, failed: toolRecord.status === "failed" }}>
                                <span>{runStatusLabel(toolRecord.status, props.copy)}</span>
                                <strong>{localizedToolDisplayInfo(toolRecord.toolName, props.copy).label}</strong>
                                <em>{runDurationLabel(toolRecord.durationMs)}</em>
                                <Show when={toolRecord.canvasBefore || toolRecord.canvasAfter}>
                                  <small>
                                    {interpolate(props.copy.runs.canvasDelta, { before: canvasObjectCount(toolRecord.canvasBefore), after: canvasObjectCount(toolRecord.canvasAfter) })}
                                  </small>
                                </Show>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </details>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>
      </Show>
    </>
  );
}
