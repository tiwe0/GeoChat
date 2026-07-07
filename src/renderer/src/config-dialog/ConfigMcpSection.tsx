import { Activity, Brain, Clock3, Database, RefreshCw, Terminal } from "lucide-solid";
import { For, Show } from "solid-js";
import { interpolate, type Locale, type RendererI18n } from "../i18n";
import { SectionCard, SwitchField } from "../workbench-ui";
import type { AgentRunModelStepRecord, AgentRunRunnerSnapshot } from "@geochat-ai/app";
import type { RendererMcpStatus } from "../workbench-types";

export function ConfigExternalMcpSection(props: { copy: RendererI18n }) {
  return (
    <SectionCard class="config-module-card config-card-wide">
      <div class="mcp-setting">
        <div class="mcp-setting-main">
          <strong><Terminal size={16} />{props.copy.config.externalMcpTitle}</strong>
          <p>{props.copy.config.externalMcpBody}</p>
        </div>
        <span class="status-pill developing">{props.copy.config.externalMcpStatus}</span>
      </div>
      <div class="config-module-note">
        <strong>{props.copy.config.externalMcpStatusTitle}</strong>
        <p>{props.copy.config.externalMcpStatusBody}</p>
      </div>
    </SectionCard>
  );
}

export function ConfigMemorySection(props: { copy: RendererI18n }) {
  return (
    <SectionCard class="config-module-card config-card-wide">
      <div class="mcp-setting">
        <div class="mcp-setting-main">
          <strong><Brain size={16} />{props.copy.config.memoryConfigTitle}</strong>
          <p>{props.copy.config.memoryConfigBody}</p>
        </div>
        <span class="status-pill developing">{props.copy.config.memoryConfigStatus}</span>
      </div>
      <div class="config-module-note">
        <strong>{props.copy.config.memoryConfigStatusTitle}</strong>
        <p>{props.copy.config.memoryConfigStatusBody}</p>
      </div>
    </SectionCard>
  );
}

type LatencyHealthRow = {
  provider: string;
  model: string;
  sampleCount: number;
  timeoutCount: number;
  p50Ms: number;
  p95Ms: number;
};

function formatDurationMs(value: number) {
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return values[index];
}

function stepTimedOut(step: AgentRunModelStepRecord) {
  return step.status === "failed" && /timed out|timeout|operation timed out/i.test(step.error ?? "");
}

function latencyHealthRows(snapshots: AgentRunRunnerSnapshot[] | undefined): LatencyHealthRow[] {
  const groups = new Map<string, { provider: string; model: string; durations: number[]; timeouts: number }>();
  for (const snapshot of snapshots ?? []) {
    for (const step of snapshot.modelSteps ?? []) {
      if (typeof step.durationMs !== "number" || !Number.isFinite(step.durationMs)) continue;
      const key = `${step.modelProvider}\n${step.modelId}`;
      const group = groups.get(key) ?? { provider: step.modelProvider, model: step.modelId, durations: [], timeouts: 0 };
      group.durations.push(step.durationMs);
      if (stepTimedOut(step)) group.timeouts += 1;
      groups.set(key, group);
    }
  }
  return Array.from(groups.values())
    .map((group) => {
      const durations = [...group.durations].sort((a, b) => a - b);
      return {
        provider: group.provider,
        model: group.model,
        sampleCount: durations.length,
        timeoutCount: group.timeouts,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95)
      };
    })
    .sort((a, b) => b.p95Ms - a.p95Ms);
}

export function ConfigDebugSection(props: {
  copy: RendererI18n;
  locale: Locale;
  snapshots: AgentRunRunnerSnapshot[] | undefined;
  snapshotsLoading: boolean;
  snapshotsError: unknown;
  modelStepTimeoutSeconds: string;
  selectedModelStepTimeoutMs: number;
  status: RendererMcpStatus;
  enabled: boolean;
  busy: boolean;
  onRefreshRuns: () => void;
  onModelStepTimeoutSecondsChange: (value: string) => void;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const rows = () => latencyHealthRows(props.snapshots).slice(0, 4);
  const warningThresholdMs = () => props.selectedModelStepTimeoutMs * 0.8;
  const timeoutSecondsBounds = () => props.locale === "en-US" ? "30-300" : "30 - 300";
  return (
    <>
      <SectionCard class="config-module-card config-card-wide">
        <div class="mcp-setting">
          <div class="mcp-setting-main">
            <strong><Activity size={16} />{props.copy.config.debugRuntimeTitle}</strong>
            <p>{props.copy.config.debugRuntimeBody}</p>
          </div>
          <button class="icon-button" type="button" title={props.copy.runs.refresh} data-tooltip={props.copy.runs.refresh} onClick={props.onRefreshRuns}>
            <RefreshCw size={15} />
          </button>
        </div>
        <div class="debug-runtime-grid">
          <label class="debug-timeout-field">
            <span>{props.copy.config.modelStepTimeoutLabel}</span>
            <input
              type="number"
              inputmode="numeric"
              min="30"
              max="300"
              step="10"
              value={props.modelStepTimeoutSeconds}
              onInput={(event) => props.onModelStepTimeoutSecondsChange(event.currentTarget.value)}
            />
            <em>
              {interpolate(props.copy.config.modelStepTimeoutHint, {
                seconds: Math.round(props.selectedModelStepTimeoutMs / 1000),
                range: timeoutSecondsBounds()
              })}
            </em>
          </label>
          <div class="debug-latency-panel">
            <div class="debug-latency-heading">
              <strong><Clock3 size={15} />{props.copy.config.modelLatencyTitle}</strong>
              <span>{interpolate(props.copy.config.modelLatencyTimeoutBudget, { seconds: Math.round(props.selectedModelStepTimeoutMs / 1000) })}</span>
            </div>
            <Show
              when={!props.snapshotsLoading}
              fallback={<p class="mcp-status-text">{props.copy.config.modelLatencyLoading}</p>}
            >
              <Show
                when={!props.snapshotsError}
                fallback={<p class="mcp-status-text failed">{props.snapshotsError instanceof Error ? props.snapshotsError.message : String(props.snapshotsError)}</p>}
              >
                <Show
                  when={rows().length}
                  fallback={<p class="mcp-status-text">{props.copy.config.modelLatencyEmpty}</p>}
                >
                  <div class="debug-latency-list">
                    <For each={rows()}>
                      {(row) => {
                        const risky = row.p95Ms >= warningThresholdMs() || row.timeoutCount > 0;
                        return (
                          <div classList={{ "debug-latency-row": true, risky }}>
                            <strong>{row.provider} / {row.model}</strong>
                            <span>{interpolate(props.copy.config.modelLatencyP50, { value: formatDurationMs(row.p50Ms) })}</span>
                            <span>{interpolate(props.copy.config.modelLatencyP95, { value: formatDurationMs(row.p95Ms) })}</span>
                            <span>{interpolate(props.copy.config.modelLatencySamples, { count: row.sampleCount })}</span>
                            <Show when={row.timeoutCount > 0}>
                              <em>{interpolate(props.copy.config.modelLatencyTimeouts, { count: row.timeoutCount })}</em>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </Show>
            </Show>
          </div>
        </div>
      </SectionCard>
      <ConfigMcpSection
        copy={props.copy}
        status={props.status}
        enabled={props.enabled}
        busy={props.busy}
        onEnabledChange={props.onEnabledChange}
      />
    </>
  );
}

export function ConfigMcpSection(props: {
  copy: RendererI18n;
  status: RendererMcpStatus;
  enabled: boolean;
  busy: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <SectionCard class="config-module-card config-card-wide">
      <div class="mcp-setting">
        <div class="mcp-setting-main">
          <strong><Database size={16} />{props.copy.config.mcpTitle}</strong>
          <p>{props.copy.config.mcpBody}</p>
        </div>
        <SwitchField
          checked={props.enabled}
          disabled={!props.status.available || props.busy}
          label={props.copy.config.mcpTitle}
          onLabel={props.copy.config.mcpOn}
          offLabel={props.copy.config.mcpOff}
          onChange={props.onEnabledChange}
        />
      </div>
      <Show
        when={props.status.available}
        fallback={<p class="mcp-status-text">{props.copy.config.mcpUnavailable}</p>}
      >
        <p classList={{ "mcp-status-text": true, running: props.status.running, failed: Boolean(props.status.error) }}>
          {props.status.running
            ? interpolate(props.copy.config.mcpRunning, { endpoint: props.status.endpoint ?? "" })
            : props.status.error
              ? props.status.error
              : props.copy.config.mcpStopped}
        </p>
      </Show>
      <Show when={props.status.running && props.status.endpoint}>
        <div class="mcp-command">
          <span><Terminal size={14} />{props.copy.config.mcpEndpointLabel}</span>
          <code>{props.status.endpoint}</code>
          <Show when={props.status.healthUrl}>
            <code>{props.status.healthUrl}</code>
          </Show>
          <p>
            {interpolate(props.copy.config.mcpProcessHint, {
              pid: props.status.pid ?? "--",
              port: props.status.port
            })}
          </p>
        </div>
      </Show>
    </SectionCard>
  );
}
