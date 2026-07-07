import { AlertCircle, ShieldCheck, Sparkles, X } from "lucide-solid";
import { createMemo, For, Show } from "solid-js";
import type { BlackboardEntry } from "@geochat-ai/app";
import { interpolate, type Locale, type RendererI18n } from "../i18n";
import { IconButton } from "../workbench-ui";
import { formatIsoTime } from "./formatting";
import type { LatexTextComponent } from "./ChatMessageTimeline";

const BLACKBOARD_CATEGORY_ORDER = [
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
] as const satisfies readonly BlackboardEntry["category"][];

function blackboardCategoryLabel(category: BlackboardEntry["category"], copy: RendererI18n) {
  return copy.blackboard.categories[category] ?? category;
}

function sortedBlackboardEntries(entries: BlackboardEntry[]) {
  return [...entries]
    .filter((entry) => entry.status === "active")
    .sort((a, b) => {
      const orderA = BLACKBOARD_CATEGORY_ORDER.indexOf(a.category);
      const orderB = BLACKBOARD_CATEGORY_ORDER.indexOf(b.category);
      if (orderA !== orderB) return orderA - orderB;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
}

export function ChatBlackboardPanel(props: {
  entries: BlackboardEntry[];
  error?: string | null;
  LatexText: LatexTextComponent;
  open: boolean;
  copy: RendererI18n;
  locale: Locale;
  onToggle: () => void;
}) {
  const entries = createMemo(() => (props.open ? sortedBlackboardEntries(props.entries) : []));
  const latestUpdatedAt = createMemo(() => entries()[0]?.updatedAt);
  const countLabel = createMemo(() => interpolate(props.copy.blackboard.count, { count: entries().length }));
  const LatexText = props.LatexText;

  return (
    <div id="chat-blackboard-drawer" classList={{ "blackboard-layer": true, open: props.open }} aria-hidden={!props.open}>
      <button class="blackboard-scrim" type="button" onClick={props.onToggle} aria-label={props.copy.blackboard.scrimAria} />
      <section classList={{ "blackboard-panel": true, empty: entries().length === 0 }} aria-label={props.copy.blackboard.title}>
        <Show when={props.open}>
          <header class="blackboard-head">
            <span class="blackboard-mark" aria-hidden="true">
              <Sparkles size={15} />
            </span>
            <span class="blackboard-title">
              <strong>{props.copy.blackboard.title}</strong>
              <small>
                <Show
                  when={latestUpdatedAt()}
                  fallback={props.copy.blackboard.subtitle}
                >
                  {interpolate(props.copy.blackboard.updated, { time: formatIsoTime(latestUpdatedAt(), props.locale) })}
                </Show>
              </small>
            </span>
            <span class="blackboard-count">{countLabel()}</span>
            <IconButton title={props.copy.blackboard.closeDrawer} onClick={props.onToggle}>
              <X size={15} />
            </IconButton>
          </header>
          <div class="blackboard-content">
            <Show
              when={!props.error}
              fallback={
                <div class="blackboard-error" role="status">
                  <AlertCircle size={15} aria-hidden="true" />
                  <span>{props.copy.blackboard.unavailable}</span>
                </div>
              }
            >
              <Show
                when={entries().length > 0}
                fallback={
                  <div class="blackboard-empty">
                    <ShieldCheck size={15} aria-hidden="true" />
                    <span>{props.copy.blackboard.empty}</span>
                  </div>
                }
              >
                <ol class="blackboard-list">
                  <For each={entries()}>
                    {(entry) => (
                      <li class={`blackboard-entry category-${entry.category}`}>
                        <div class="blackboard-entry-head">
                          <span>{blackboardCategoryLabel(entry.category, props.copy)}</span>
                          <b>{interpolate(props.copy.blackboard.confidence, { confidence: Math.round(entry.confidence * 100) })}</b>
                        </div>
                        <LatexText text={entry.value} class="blackboard-entry-value" />
                        <Show when={entry.reason}>
                          <p class="blackboard-reason">
                            {interpolate(props.copy.blackboard.reason, { reason: entry.reason })}
                          </p>
                        </Show>
                      </li>
                    )}
                  </For>
                </ol>
              </Show>
            </Show>
          </div>
        </Show>
      </section>
    </div>
  );
}
