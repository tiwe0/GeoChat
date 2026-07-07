import { createEffect, createMemo, createSignal, For, Index, onCleanup, Show, type JSX } from "solid-js";
import type { FunctionCallCard } from "../functioncalls";
import type { DesktopFunctionCall } from "@geochat-ai/app";
import { interpolate, type Locale, type RendererI18n } from "../i18n";
import { normalizeStreamdownMath } from "../math-rendering";
import { isScrolledNearBottom } from "../chat-scroll";
import type { DesktopChatActivity, DesktopChatMessage } from "../workbench-types";
import { toolCallVisualStatus } from "../workbench-tool-calls";
import { toolActivityText } from "../tool-activity";
import { formatIsoTime } from "./formatting";
import { ToolCallTrace } from "./ToolCallTrace";

export type ChoiceScenarioPreviewInput = {
  cardKey: string;
  label: "A" | "B" | "C" | "D" | "all";
  commands: string[];
};

export type ChoiceScenarioPreviewResult = {
  ok: boolean;
  error?: string | null;
};

export type LatexTextComponent = (props: { text: string; class?: string }) => JSX.Element;

type StreamdownRenderer = {
  createElement: typeof import("react").createElement;
  createRoot: typeof import("react-dom/client").createRoot;
  Streamdown: typeof import("streamdown").Streamdown;
  math: ReturnType<typeof import("@streamdown/math").createMathPlugin>;
};

export function ChatMessageTimeline(props: {
  messages: DesktopChatMessage[];
  isRunning: boolean;
  copy: RendererI18n;
  locale: Locale;
  LatexText: LatexTextComponent;
  replayingCallId?: string | null;
  onPreviewChoiceScenario?: (input: ChoiceScenarioPreviewInput) => Promise<ChoiceScenarioPreviewResult>;
  onReplayCommands?: (call: DesktopFunctionCall) => void;
}) {
  let scrollContainer: HTMLDivElement | undefined;
  let bottomSentinel: HTMLDivElement | undefined;
  let autoScrollFrame: number | undefined;
  let autoScrollTimeout: number | undefined;
  let wasRunning = false;
  const [autoScrollEnabled, setAutoScrollEnabled] = createSignal(true);

  function containerIsNearBottom() {
    if (!scrollContainer) return true;
    return isScrolledNearBottom({
      scrollTop: scrollContainer.scrollTop,
      scrollHeight: scrollContainer.scrollHeight,
      clientHeight: scrollContainer.clientHeight
    });
  }

  function syncAutoScrollFromUserPosition() {
    setAutoScrollEnabled(containerIsNearBottom());
  }

  function scrollToBottom() {
    if (!bottomSentinel) return;
    if (autoScrollFrame !== undefined) cancelAnimationFrame(autoScrollFrame);
    if (autoScrollTimeout !== undefined) clearTimeout(autoScrollTimeout);
    autoScrollFrame = requestAnimationFrame(() => {
      bottomSentinel?.scrollIntoView({ block: "end" });
      autoScrollFrame = undefined;
      autoScrollTimeout = window.setTimeout(() => {
        bottomSentinel?.scrollIntoView({ block: "end" });
        autoScrollTimeout = undefined;
      }, 80);
    });
  }

  createEffect(() => {
    const running = props.isRunning;
    const messageSignature = props.messages.map((message) => [
      message.id,
      message.content.length,
      message.toolCalls?.length ?? 0,
      message.cards?.length ?? 0,
      message.usage?.totalTokens ?? 0
    ].join(":")).join("|");
    const justStartedRunning = running && !wasRunning;
    wasRunning = running;
    messageSignature;

    if (justStartedRunning) {
      setAutoScrollEnabled(true);
      scrollToBottom();
      return;
    }
    if (autoScrollEnabled()) {
      scrollToBottom();
    }
  });

  onCleanup(() => {
    if (autoScrollFrame !== undefined) cancelAnimationFrame(autoScrollFrame);
    if (autoScrollTimeout !== undefined) clearTimeout(autoScrollTimeout);
  });

  return (
    <div ref={scrollContainer} class="messages" onScroll={syncAutoScrollFromUserPosition}>
      <Show
        when={props.messages.length > 1}
        fallback={
          <div class="thread-welcome">
            <span>{props.copy.chat.workspaceLabel}</span>
            <h3>{props.copy.chat.welcomeTitle}</h3>
            <p>{props.copy.chat.welcomeBody}</p>
          </div>
        }
      >
        <Index each={props.messages}>
          {(message) => (
            <MessageBubble
              message={message()}
              copy={props.copy}
              locale={props.locale}
              LatexText={props.LatexText}
              replayingCallId={props.replayingCallId}
              onPreviewChoiceScenario={props.onPreviewChoiceScenario}
              onReplayCommands={props.onReplayCommands}
            />
          )}
        </Index>
      </Show>
      <div ref={bottomSentinel} class="messages-bottom-sentinel" aria-hidden="true" />
    </div>
  );
}

function MessageBubble(props: {
  message: DesktopChatMessage;
  copy: RendererI18n;
  locale: Locale;
  LatexText: LatexTextComponent;
  replayingCallId?: string | null;
  onPreviewChoiceScenario?: (input: ChoiceScenarioPreviewInput) => Promise<ChoiceScenarioPreviewResult>;
  onReplayCommands?: (call: DesktopFunctionCall) => void;
}) {
  const LatexText = props.LatexText;
  const visualStatus = createMemo(() => toolCallVisualStatus(props.message.toolCalls));
  const isActivity = createMemo(() => props.message.role === "assistant" && (Boolean(props.message.activity) || isAssistantActivityContent(props.message.content, props.copy)));
  return (
    <article
      classList={{
        "chat-message": true,
        user: props.message.role === "user",
        assistant: props.message.role === "assistant",
        "status-success": props.message.role === "assistant" && visualStatus() === "success",
        "status-repairing": props.message.role === "assistant" && visualStatus() === "repairing",
        "status-failed": props.message.role === "assistant" && visualStatus() === "failed"
      }}
    >
      <div class="message-meta">
        <span>{props.message.role === "user" ? props.copy.chat.userName : props.copy.chat.assistantName}</span>
        <time>{displayMessageTime(props.message, props.locale)}</time>
      </div>
      <Show
        when={props.message.role === "user"}
        fallback={
          <Show
            when={isActivity()}
            fallback={<AssistantMessageContent content={props.message.content} LatexText={LatexText} />}
          >
            <AssistantActivityMessage activity={props.message.activity} content={props.message.content} copy={props.copy} LatexText={LatexText} />
          </Show>
        }
      >
        <LatexText text={props.message.content} class="message-markdown user" />
      </Show>
      <Show when={props.message.attachments?.length}>
        <div class="message-attachments">
          <For each={props.message.attachments ?? []}>
            {(attachment) => (
              <figure class="message-attachment">
                <img src={attachment.dataUrl} alt={attachment.name} />
                <figcaption>{attachment.name}</figcaption>
              </figure>
            )}
          </For>
        </div>
      </Show>
      <ToolCallTrace
        calls={props.message.toolCalls}
        copy={props.copy}
        replayingCallId={props.replayingCallId}
        onReplayCommands={props.onReplayCommands}
      />
      <FunctionCards cards={props.message.cards} copy={props.copy} LatexText={LatexText} onPreviewChoiceScenario={props.onPreviewChoiceScenario} />
      <Show when={props.message.usage?.totalTokens}>
        <div class="message-usage">
          <span>
            {props.copy.chat.tokenUsage}
            <b>{props.message.usage?.totalTokens}</b>
          </span>
        </div>
      </Show>
    </article>
  );
}

function FunctionCards(props: {
  cards?: FunctionCallCard[];
  copy: RendererI18n;
  LatexText: LatexTextComponent;
  onPreviewChoiceScenario?: (input: ChoiceScenarioPreviewInput) => Promise<ChoiceScenarioPreviewResult>;
}) {
  return (
    <Show when={props.cards?.length}>
      <div class="function-cards">
        <For each={props.cards}>
          {(card) => <FunctionCardView card={card} copy={props.copy} LatexText={props.LatexText} onPreviewChoiceScenario={props.onPreviewChoiceScenario} />}
        </For>
      </div>
    </Show>
  );
}

function FunctionCardView(props: {
  card: FunctionCallCard;
  copy: RendererI18n;
  LatexText: LatexTextComponent;
  onPreviewChoiceScenario?: (input: ChoiceScenarioPreviewInput) => Promise<ChoiceScenarioPreviewResult>;
}) {
  const LatexText = props.LatexText;
  const choices = createMemo(() => props.card.choices ?? []);
  const cardKey = createMemo(() => [
    props.card.title,
    props.card.summary ?? "",
    choices().map((choice) => `${choice.label}:${choice.statement}`).join("|")
  ].join("::"));
  const initialSelection = () => (props.card.displayMode === "compare_choices" ? "all" : choices()[0]?.label ?? "all");
  const [activeChoice, setActiveChoice] = createSignal<string>(initialSelection());
  const [previewingChoice, setPreviewingChoice] = createSignal<string | null>(null);
  const [previewError, setPreviewError] = createSignal<string | null>(null);
  let previewRunId = 0;
  const visibleChoices = createMemo(() => {
    if (activeChoice() === "all") return choices();
    return choices().filter((choice) => choice.label === activeChoice());
  });

  createEffect(() => {
    const labels = new Set<string>(choices().map((choice) => choice.label));
    if (activeChoice() === "all" || labels.has(activeChoice())) return;
    setActiveChoice(initialSelection());
  });

  async function selectChoice(label: "A" | "B" | "C" | "D") {
    setActiveChoice(label);
    setPreviewError(null);
    const choice = choices().find((item) => item.label === label);
    const commands = choice?.commands?.map((command) => command.trim()).filter(Boolean) ?? [];
    if (!commands.length || !props.onPreviewChoiceScenario) return;
    const runId = ++previewRunId;
    setPreviewingChoice(label);
    try {
      const result = await props.onPreviewChoiceScenario({ cardKey: cardKey(), label, commands });
      if (runId === previewRunId && !result.ok) setPreviewError(result.error || props.copy.cards.choicePreviewFailed);
    } catch (error) {
      if (runId === previewRunId) setPreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      if (runId === previewRunId) setPreviewingChoice(null);
    }
  }

  async function showAllChoices() {
    setActiveChoice("all");
    setPreviewError(null);
    if (!props.onPreviewChoiceScenario) return;
    const runId = ++previewRunId;
    setPreviewingChoice("all");
    try {
      const result = await props.onPreviewChoiceScenario({ cardKey: cardKey(), label: "all", commands: [] });
      if (runId === previewRunId && !result.ok) setPreviewError(result.error || props.copy.cards.choicePreviewFailed);
    } catch (error) {
      if (runId === previewRunId) setPreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      if (runId === previewRunId) setPreviewingChoice(null);
    }
  }

  return (
    <section class="function-card">
      <strong>{props.card.title}</strong>
      <Show when={props.card.summary}>
        {(summary) => <MarkdownFragment content={summary()} LatexText={LatexText} />}
      </Show>
      <Show when={props.card.answer}>
        {(answer) => <MarkdownFragment content={answer()} LatexText={LatexText} />}
      </Show>
      <Show when={props.card.steps?.length}>
        <ol>
          <For each={props.card.steps}>
            {(step) => (
              <li>
                <b>{step.label}</b>
                <MarkdownFragment content={step.body} class="function-card-step-body" LatexText={LatexText} />
              </li>
            )}
          </For>
        </ol>
      </Show>
      <Show when={props.card.items?.length}>
        <ul class="function-card-items">
          <For each={props.card.items}>
            {(item) => (
              <li>
                <MarkdownFragment content={item} LatexText={LatexText} />
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={props.card.baseConditions?.length}>
        <ul class="function-card-items">
          <For each={props.card.baseConditions}>
            {(item) => (
              <li>
                <MarkdownFragment content={item} LatexText={LatexText} />
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={(props.card.elements?.length ?? 0) > 0}>
        <SelectedElementsList elements={props.card.elements ?? []} nextActionHint={props.card.nextActionHint} copy={props.copy} LatexText={LatexText} />
      </Show>
      <Show when={choices().length}>
        <div class="function-card-choice-tabs">
          <For each={choices()}>
            {(choice) => (
              <button
                type="button"
                class={`function-card-choice-tab ${activeChoice() === choice.label ? "active" : ""}`}
                aria-pressed={activeChoice() === choice.label}
                onClick={() => void selectChoice(choice.label)}
              >
                <span>{choice.label}</span>
                <small class={choice.verdict}>{choiceVerdictLabel(choice.verdict, props.copy)}</small>
              </button>
            )}
          </For>
          <button
            type="button"
            class={`function-card-choice-tab all ${activeChoice() === "all" ? "active" : ""}`}
            aria-pressed={activeChoice() === "all"}
            onClick={() => void showAllChoices()}
          >
            {props.copy.cards.choiceAll}
          </button>
        </div>
        <Show when={previewingChoice()}>
          {(label) => <p class="function-card-choice-preview-status">{interpolate(props.copy.cards.choicePreviewing, { choice: choicePreviewLabel(label(), props.copy) })}</p>}
        </Show>
        <Show when={previewError()}>
          {(error) => <p class="function-card-choice-preview-error">{error()}</p>}
        </Show>
        <div class="function-card-choices">
          <For each={visibleChoices()}>
            {(choice) => <ChoiceAnalysisItem choice={choice} copy={props.copy} LatexText={LatexText} />}
          </For>
        </div>
      </Show>
      <Show when={props.card.commands?.length}>
        <details class="function-card-commands">
          <summary>{props.copy.chat.commandDraft}</summary>
          <For each={props.card.commands}>
            {(command) => <code>{command}</code>}
          </For>
        </details>
      </Show>
    </section>
  );
}

function SelectedElementsList(props: { elements: NonNullable<FunctionCallCard["elements"]>; nextActionHint?: string | null; copy: RendererI18n; LatexText: LatexTextComponent }) {
  const LatexText = props.LatexText;
  return (
    <div class="function-card-selected-elements">
      <For each={props.elements}>
        {(element) => (
          <article class="function-card-selected-element">
            <div class="function-card-selected-element-head">
              <code>{element.label}</code>
              <Show when={element.type}>
                {(type) => <span>{props.copy.cards.selectedElementType}: {type()}</span>}
              </Show>
            </div>
            <Show when={element.description}>
              {(description) => <MarkdownFragment content={description()} LatexText={LatexText} />}
            </Show>
            <Show when={element.role}>
              {(role) => <p><b>{props.copy.cards.selectedElementRole}</b> {role()}</p>}
            </Show>
          </article>
        )}
      </For>
      <Show when={props.nextActionHint}>
        {(hint) => <p class="function-card-selected-next"><b>{props.copy.cards.selectedNextAction}</b> {hint()}</p>}
      </Show>
    </div>
  );
}

function ChoiceAnalysisItem(props: { choice: NonNullable<FunctionCallCard["choices"]>[number]; copy: RendererI18n; LatexText: LatexTextComponent }) {
  const LatexText = props.LatexText;
  return (
    <article class="function-card-choice">
      <div class="function-card-choice-header">
        <span class="function-card-choice-label">{props.choice.label}</span>
        <span class={`function-card-choice-verdict ${props.choice.verdict}`}>{choiceVerdictLabel(props.choice.verdict, props.copy)}</span>
      </div>
      <MarkdownFragment content={props.choice.statement} class="function-card-choice-statement" LatexText={LatexText} />
      <MarkdownFragment content={props.choice.explanation} LatexText={LatexText} />
      <Show when={props.choice.constructionFocus}>
        {(focus) => <p class="function-card-choice-meta"><b>{props.copy.cards.choiceConstructionFocus}</b> {focus()}</p>}
      </Show>
      <Show when={props.choice.evidence?.length}>
        <div class="function-card-choice-evidence-block">
          <b>{props.copy.cards.choiceEvidence}</b>
          <ul class="function-card-choice-evidence">
            <For each={props.choice.evidence}>
              {(item) => (
                <li>
                  <MarkdownFragment content={item} LatexText={LatexText} />
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={props.choice.commands?.length}>
        <details class="function-card-commands">
          <summary>{props.copy.chat.commandDraft}</summary>
          <For each={props.choice.commands}>
            {(command) => <code>{command}</code>}
          </For>
        </details>
      </Show>
    </article>
  );
}

function choiceVerdictLabel(verdict: "true" | "false" | "unknown", copy: RendererI18n) {
  if (verdict === "true") return copy.cards.choiceTrue;
  if (verdict === "false") return copy.cards.choiceFalse;
  return copy.cards.choiceUnknown;
}

function choicePreviewLabel(label: string, copy: RendererI18n) {
  return label === "all" ? copy.cards.choiceAll : label;
}

function needsRichMarkdown(content: string) {
  return /(^|\n)\s{0,3}(```|~~~|#{1,6}\s|>\s|[-*+]\s+|\d+\.\s+|\|.+\|)/.test(content)
    || /!\[[^\]]*]\([^)]+\)|\[[^\]]+]\([^)]+\)|<\/?[a-z][\s\S]*?>|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__/.test(content);
}

function MarkdownFragment(props: { content?: string | null; class?: string; LatexText: LatexTextComponent }) {
  const content = createMemo(() => props.content?.trim() ?? "");
  const rich = createMemo(() => needsRichMarkdown(content()));
  const LatexText = props.LatexText;
  return (
    <Show when={content()}>
      {(value) => (
        <div class={props.class ? `markdown-fragment ${props.class}` : "markdown-fragment"}>
          <Show
            when={rich()}
            fallback={<LatexText text={value()} class="message-markdown assistant" />}
          >
            <StreamdownMessage content={value()} role="assistant" />
          </Show>
        </div>
      )}
    </Show>
  );
}

let streamdownRendererPromise: Promise<StreamdownRenderer> | undefined;

function loadStreamdownRenderer() {
  streamdownRendererPromise ??= Promise.all([
    import("react"),
    import("react-dom/client"),
    import("streamdown"),
    import("@streamdown/math"),
    import("streamdown/styles.css"),
    import("katex/dist/katex.min.css")
  ]).then(([react, reactDom, streamdown, streamdownMath]) => ({
    createElement: react.createElement,
    createRoot: reactDom.createRoot,
    Streamdown: streamdown.Streamdown,
    math: streamdownMath.createMathPlugin({ singleDollarTextMath: true })
  }));
  return streamdownRendererPromise;
}

function StreamdownMessage(props: { content: string; role: "user" | "assistant" }) {
  let host: HTMLDivElement | undefined;
  let root: import("react-dom/client").Root | undefined;
  let renderVersion = 0;
  let disposed = false;

  createEffect(() => {
    if (!host) return;
    const content = props.role === "assistant" ? normalizeStreamdownMath(props.content) : props.content;
    const role = props.role;
    const currentVersion = ++renderVersion;
    void loadStreamdownRenderer().then(({ createElement, createRoot, Streamdown, math }) => {
      if (!host || disposed || currentVersion !== renderVersion) return;
      root ??= createRoot(host);
      root.render(createElement(Streamdown, {
        className: `message-markdown ${role}`,
        mode: "streaming",
        dir: "auto",
        plugins: { math },
        parseIncompleteMarkdown: true,
        controls: {
          code: { copy: true, download: false },
          table: { copy: true, download: false, fullscreen: false }
        },
        children: content
      }));
    });
  });

  onCleanup(() => {
    disposed = true;
    renderVersion += 1;
    root?.unmount();
  });

  return <div ref={host} class="message-markdown-host" />;
}

function AssistantMessageContent(props: { content: string; LatexText: LatexTextComponent }) {
  const rich = createMemo(() => needsRichMarkdown(props.content));
  const LatexText = props.LatexText;
  return (
    <Show
      when={rich()}
      fallback={<LatexText text={props.content} class="message-markdown assistant" />}
    >
      <StreamdownMessage content={props.content} role="assistant" />
    </Show>
  );
}

function activityTemplatePrefix(template: string) {
  return template.split("{tool}")[0] ?? "";
}

function isAssistantActivityContent(content: string, copy: RendererI18n) {
  const text = content.trim();
  if (!text) return false;
  if ([
    copy.chat.backendPlanning,
    copy.chat.backendNextTool,
    copy.chat.backendCachedTool,
    copy.chat.backendToolSubmitted
  ].includes(text)) return true;
  if (Object.values(copy.chat.toolActivities).includes(text)) return true;
  const runningPrefix = activityTemplatePrefix(copy.chat.backendToolRunning);
  const thinkingPrefix = activityTemplatePrefix(copy.chat.backendToolResultThinking);
  return Boolean(runningPrefix && text.startsWith(runningPrefix)) || Boolean(thinkingPrefix && text.startsWith(thinkingPrefix));
}

function activityContent(activity: DesktopChatActivity | undefined, fallback: string, copy: RendererI18n) {
  if (!activity) return fallback;
  if (activity.kind === "backend_planning") return copy.chat.backendPlanning;
  if (activity.kind === "backend_cached_tool") return copy.chat.backendCachedTool;
  if (activity.kind === "backend_tool_running") {
    return toolActivityText(copy, activity.toolName, "running");
  }
  return copy.chat.backendToolSubmitted;
}

function displayMessageTime(message: DesktopChatMessage, locale: Locale) {
  return message.createdAtIso ? formatIsoTime(message.createdAtIso, locale) : message.createdAt;
}

function AssistantActivityMessage(props: { activity?: DesktopChatActivity; content: string; copy: RendererI18n; LatexText: LatexTextComponent }) {
  const LatexText = props.LatexText;
  const content = createMemo(() => activityContent(props.activity, props.content, props.copy));
  return (
    <div class="message-activity" role="status" aria-live="polite">
      <span class="message-activity-dot" aria-hidden="true" />
      <LatexText text={content()} class="message-markdown assistant activity" />
    </div>
  );
}
