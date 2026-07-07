import { BookOpen, Home, ImageIcon, Search, Send } from "lucide-solid";
import { createEffect, createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js";
import type { ProblemDetail, ProblemSetSummary, ProblemSummary } from "@geochat-ai/app";
import { interpolate, type Locale, type RendererI18n } from "./i18n";
import { readCachedCloudProblemMedia, writeCachedCloudProblemMedia } from "./problem-bank-cache";
import { problemDisplayPrompt, type ProblemBankFilters } from "./problem-bank-utils";
import { SelectField } from "./workbench-ui";

type LatexTextComponent = (props: { text: string; class?: string }) => JSX.Element;
type ProblemSetWithReusePolicy = ProblemSetSummary & {
  reusePolicy?: "allowed" | "restricted" | "unknown" | null;
};

export type ProblemBankPageProps = {
  locked: boolean;
  sets: ProblemSetWithReusePolicy[];
  setsLoading: boolean;
  setsError?: unknown;
  problems: ProblemSummary[];
  total: number;
  problemsLoading: boolean;
  problemsError?: unknown;
  problemsLoadingMore: boolean;
  problemsLoadMoreError?: unknown;
  hasMoreProblems: boolean;
  activeSetId?: string;
  selectedProblemId?: string;
  selectedProblem?: ProblemDetail;
  selectedProblemLoading: boolean;
  filters: ProblemBankFilters;
  copy: RendererI18n;
  locale: Locale;
  LatexText: LatexTextComponent;
  onBack: () => void;
  onSelectSet: (id: string) => void;
  onSelectProblem: (id: string) => void;
  onFiltersChange: (filters: ProblemBankFilters) => void;
  onLoadMoreProblems: () => void;
  onUseProblem: (problem: ProblemDetail, mode: "draft" | "send") => void;
};

const problemYearOptions = ["all", ...Array.from({ length: 16 }, (_, index) => String(2025 - index))] as const;

function problemQuestionTypeOptions(copy: RendererI18n): Array<{ value: ProblemBankFilters["questionType"]; label: string }> {
  return [
    { value: "all", label: copy.problem.allQuestionTypes },
    { value: "mcq", label: copy.problem.mcq },
    { value: "open_ended", label: copy.problem.openEnded }
  ];
}

function problemPaperOptions(copy: RendererI18n): Array<{ value: ProblemBankFilters["paper"]; label: string }> {
  return [
    { value: "all", label: copy.problem.allPapers },
    { value: "math_i", label: copy.problem.paperI },
    { value: "math_ii", label: copy.problem.paperII },
    { value: "math_iii", label: copy.problem.paperIII }
  ];
}

function problemYearFilterOptions(copy: RendererI18n): Array<{ value: string; label: string }> {
  return problemYearOptions.map((year) => ({
    value: year,
    label: year === "all" ? copy.problem.allYears : interpolate(copy.problem.year, { year })
  }));
}

function problemDifficultyOptions(copy: RendererI18n): Array<{ value: ProblemBankFilters["difficulty"]; label: string }> {
  return [
    { value: "all", label: copy.problem.allDifficulty },
    { value: "easy", label: copy.problem.easy },
    { value: "medium", label: copy.problem.medium },
    { value: "hard", label: copy.problem.hard }
  ];
}

function difficultyLabel(value: ProblemSummary["difficulty"] | ProblemBankFilters["difficulty"], copy: RendererI18n) {
  if (value === "easy") return copy.problem.easy;
  if (value === "medium") return copy.problem.medium;
  if (value === "hard") return copy.problem.hard;
  return copy.problem.allDifficulty;
}

function problemSetYear(set: ProblemSetSummary) {
  const match = set.slug.match(/^year-(\d{4})$/) ?? set.id.match(/^set-year-(\d{4})$/);
  return match?.[1];
}

function problemSetTitle(set: ProblemSetSummary, copy: RendererI18n) {
  const year = problemSetYear(set);
  if (year) return interpolate(copy.problem.setTitleYear, { year });
  const titles = copy.problem.setTitles as Record<string, string>;
  return titles[set.slug] ?? titles[set.id.replace(/^set-/, "")] ?? set.title;
}

function problemSetDescription(set: ProblemSetSummary, copy: RendererI18n) {
  const year = problemSetYear(set);
  if (year) return interpolate(copy.problem.setDescriptionYear, { year });
  const descriptions = copy.problem.setDescriptions as Record<string, string>;
  return descriptions[set.slug] ?? descriptions[set.id.replace(/^set-/, "")] ?? set.description;
}

function taskTypeLabel(value: ProblemSummary["taskType"], copy: RendererI18n) {
  const labels: Record<ProblemSummary["taskType"], string> = {
    draw: copy.problem.draw,
    solve: copy.problem.solve,
    explain: copy.problem.explain,
    construct: copy.problem.construct,
    diagnose: copy.problem.diagnose,
    revise: copy.problem.revise,
    mixed: copy.problem.mixed,
    animation: copy.problem.animation
  };
  return labels[value] ?? value;
}

function questionTypeLabel(value: ProblemSummary["questionType"], copy: RendererI18n) {
  const labels: Record<ProblemSummary["questionType"], string> = {
    mcq: copy.problem.mcq,
    fill_blank: copy.problem.fillBlank,
    open_ended: copy.problem.openEnded,
    curated: copy.problem.curated
  };
  return labels[value] ?? value;
}

function paperLabel(value: string | null, copy: RendererI18n) {
  const labels: Record<string, string> = {
    math_i: copy.problem.paperI,
    math_ii: copy.problem.paperII,
    math_iii: copy.problem.paperIII
  };
  return value ? (labels[value] ?? value) : undefined;
}

function problemTagLabel(value: string, copy: RendererI18n) {
  const tag = value.trim();
  const labels = copy.problem.tags as Record<string, string>;
  if (/^year-\d{4}$/.test(tag)) return interpolate(copy.problem.year, { year: tag.slice(5) });
  if (/^(gaokao-runnable-|runnable-|capability-|dev$)/.test(tag)) return undefined;
  return labels[tag];
}

function problemDisplayTags(problem: Pick<ProblemSummary, "tags" | "topics">, copy: RendererI18n) {
  return Array.from(new Set([...problem.topics, ...problem.tags].map((tag) => problemTagLabel(tag, copy)).filter((tag): tag is string => Boolean(tag)))).slice(0, 12);
}

function problemDisplayTitle(title: string) {
  return title.replace(/^GAOKAO\s+(?:Full|Dev)\s*[:：]\s*/i, "").trim();
}

function problemSourceLabel(set: ProblemSetSummary | undefined, copy: RendererI18n) {
  return set?.source === "cloud" ? copy.problem.cloudSource : copy.problem.localSource;
}

function problemReleaseLabel(set: ProblemSetSummary | undefined, copy: RendererI18n) {
  if (!set?.releaseId) return undefined;
  const channel = set.releaseChannel ? channelLabel(set.releaseChannel, copy) : undefined;
  return channel
    ? interpolate(copy.problem.releaseWithChannel, { release: set.releaseId, channel })
    : interpolate(copy.problem.release, { release: set.releaseId });
}

function channelLabel(channel: NonNullable<ProblemSetSummary["releaseChannel"]>, copy: RendererI18n) {
  if (channel === "production") return copy.problem.channelProduction;
  if (channel === "evaluation") return copy.problem.channelEvaluation;
  return copy.problem.channelInternal;
}

function reusePolicyLabel(value: ProblemSetWithReusePolicy["reusePolicy"], copy: RendererI18n) {
  if (value === "allowed") return copy.problem.reuseAllowed;
  if (value === "restricted") return copy.problem.reuseRestricted;
  if (value === "unknown") return copy.problem.reuseUnknown;
  return undefined;
}

function problemMediaSrc(media: ProblemSummary["media"][number]) {
  if (media.trackingUrl) return media.trackingUrl;
  if (media.r2Url) return media.r2Url;
  if (media.url) return media.url;
  if (!media.path || media.path.includes("::")) return undefined;
  if (/^(https?:|data:|file:)/i.test(media.path)) return media.path;
  if (media.path.startsWith("/")) return `file://${encodeURI(media.path)}`;
  return undefined;
}

function problemMediaLabel(media: ProblemSummary["media"][number], fallback: string) {
  return media.alt ?? media.path ?? media.url ?? fallback;
}

function CachedProblemMediaImage(props: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}) {
  const [resolvedSrc, setResolvedSrc] = createSignal(props.src);
  let objectUrl: string | undefined;
  let loadToken = 0;

  function revokeObjectUrl() {
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  }

  function showBlob(blob: Blob) {
    revokeObjectUrl();
    objectUrl = URL.createObjectURL(blob);
    setResolvedSrc(objectUrl);
  }

  createEffect(() => {
    const src = props.src;
    const token = ++loadToken;
    setResolvedSrc(src);
    revokeObjectUrl();
    if (!/^https?:\/\//i.test(src)) return;

    void (async () => {
      const cached = await readCachedCloudProblemMedia(src);
      if (token !== loadToken) return;
      if (cached) {
        showBlob(cached);
        return;
      }

      const response = await fetch(src, { cache: "force-cache" });
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) return;
      void writeCachedCloudProblemMedia(src, blob).catch(() => undefined);
      if (token === loadToken) showBlob(blob);
    })().catch(() => {
      if (token === loadToken) setResolvedSrc(src);
    });
  });

  onCleanup(() => {
    loadToken += 1;
    revokeObjectUrl();
  });

  return (
    <img
      src={resolvedSrc()}
      alt={props.alt}
      width={props.width}
      height={props.height}
      loading="lazy"
    />
  );
}

export default function ProblemBankPage(props: ProblemBankPageProps) {
  const activeSet = createMemo(() => props.sets.find((set) => set.id === props.activeSetId));
  const activeSetTitle = createMemo(() => {
    const set = activeSet();
    return set ? problemSetTitle(set, props.copy) : props.copy.problem.problems;
  });
  const LatexText = props.LatexText;

  return (
    <section class="problem-bank-page">
      <div class="problem-bank-shell">
        <header class="problem-bank-header">
          <div>
            <span>{props.copy.problem.eyebrow}</span>
            <h2>{props.copy.problem.title}</h2>
            <p>{props.copy.problem.body}</p>
          </div>
          <button class="app-button secondary" type="button" onClick={props.onBack}>
            <Home size={16} />{props.copy.app.backToWorkbench}
          </button>
        </header>

        <Show when={props.locked}>
          <section class="problem-bank-locked-state" aria-labelledby="problem-bank-locked-title">
            <BookOpen size={28} />
            <div>
              <h3 id="problem-bank-locked-title">{props.copy.problem.unavailableTitle}</h3>
              <p>{props.copy.problem.unavailableBody}</p>
              <small>{props.copy.problem.unavailableHint}</small>
            </div>
            <button class="app-button" type="button" onClick={props.onBack}>
              <Home size={16} />{props.copy.problem.unavailableAction}
            </button>
          </section>
        </Show>

        <Show when={!props.locked}>
        <div class="problem-bank-grid">
          <aside class="problem-set-sidebar">
            <div class="problem-pane-head">
              <strong>{props.copy.problem.sets}</strong>
              <span>{interpolate(props.copy.problem.setCount, { count: props.sets.length })}</span>
            </div>
            <Show
              when={!props.setsLoading}
              fallback={<div class="problem-empty-state">{props.copy.problem.loadingSets}</div>}
            >
              <Show
                when={!props.setsError}
                fallback={<div class="problem-empty-state">{interpolate(props.copy.problem.setsUnavailable, { message: props.setsError instanceof Error ? props.setsError.message : String(props.setsError) })}</div>}
              >
                <div class="problem-set-list">
                  <For each={props.sets}>
                    {(set) => (
                      <button
                        type="button"
                        classList={{ "problem-set-item": true, active: props.activeSetId === set.id }}
                        onClick={() => props.onSelectSet(set.id)}
                      >
                        <strong>{problemSetTitle(set, props.copy)}</strong>
                        <span>{problemSetDescription(set, props.copy)}</span>
                        <b>{interpolate(props.copy.problem.problemCount, { count: set.problemCount })}</b>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </aside>

          <section class="problem-list-pane">
            <div class="problem-list-toolbar">
              <label class="problem-search">
                <Search size={15} />
                <input
                  value={props.filters.query}
                  placeholder={props.copy.problem.searchPlaceholder}
                  onInput={(event) => props.onFiltersChange({ ...props.filters, query: event.currentTarget.value })}
                />
              </label>
              <div class="problem-filter-grid">
                <SelectField
                  id="problem-filter-question-type"
                  value={props.filters.questionType}
                  options={problemQuestionTypeOptions(props.copy)}
                  ariaLabel={props.copy.problem.filterQuestionType}
                  class="problem-filter-select"
                  menuMinWidth={180}
                  onChange={(value) => props.onFiltersChange({ ...props.filters, questionType: value as ProblemBankFilters["questionType"] })}
                />
                <SelectField
                  id="problem-filter-year"
                  value={props.filters.year}
                  options={problemYearFilterOptions(props.copy)}
                  ariaLabel={props.copy.problem.filterYear}
                  class="problem-filter-select"
                  menuMinWidth={180}
                  onChange={(value) => props.onFiltersChange({ ...props.filters, year: value })}
                />
                <SelectField
                  id="problem-filter-paper"
                  value={props.filters.paper}
                  options={problemPaperOptions(props.copy)}
                  ariaLabel={props.copy.problem.filterPaper}
                  class="problem-filter-select"
                  menuMinWidth={180}
                  onChange={(value) => props.onFiltersChange({ ...props.filters, paper: value })}
                />
                <SelectField
                  id="problem-filter-difficulty"
                  value={props.filters.difficulty}
                  options={problemDifficultyOptions(props.copy)}
                  ariaLabel={props.copy.problem.filterDifficulty}
                  class="problem-filter-select"
                  menuMinWidth={180}
                  onChange={(value) => props.onFiltersChange({ ...props.filters, difficulty: value as ProblemBankFilters["difficulty"] })}
                />
              </div>
              <label class="problem-toggle">
                <input
                  type="checkbox"
                  checked={props.filters.visualOnly}
                  onChange={(event) => props.onFiltersChange({ ...props.filters, visualOnly: event.currentTarget.checked })}
                />
                <span>{props.copy.problem.visualOnly}</span>
              </label>
            </div>
            <div class="problem-pane-head">
              <div>
                <strong>{activeSetTitle()}</strong>
                <div class="problem-active-set-meta">
                  <span>{problemSourceLabel(activeSet(), props.copy)}</span>
                  <Show when={problemReleaseLabel(activeSet(), props.copy)}>{(label) => <span>{label()}</span>}</Show>
                  <Show when={reusePolicyLabel(activeSet()?.reusePolicy, props.copy)}>{(label) => <span>{label()}</span>}</Show>
                </div>
              </div>
              <span>{interpolate(props.copy.problem.problemCount, { count: props.total })}</span>
            </div>
            <Show
              when={!props.problemsLoading}
              fallback={<div class="problem-empty-state">{props.copy.problem.loadingProblems}</div>}
            >
              <Show
                when={!props.problemsError}
                fallback={<div class="problem-empty-state">{interpolate(props.copy.problem.problemLoadFailed, { message: props.problemsError instanceof Error ? props.problemsError.message : String(props.problemsError) })}</div>}
              >
                <div class="problem-list">
                  <Show when={props.problems.length} fallback={<div class="problem-empty-state">{props.copy.problem.noMatches}</div>}>
                    <For each={props.problems}>
                      {(problem) => (
                        <button
                          type="button"
                          classList={{ "problem-row": true, active: props.selectedProblemId === problem.id }}
                          onClick={() => props.onSelectProblem(problem.id)}
                        >
                          <div>
                            <strong><LatexText text={problemDisplayTitle(problem.title)} /></strong>
                            <p><LatexText text={problemDisplayPrompt(problem.prompt)} /></p>
                          </div>
                          <div class="problem-row-meta">
                            <span>{taskTypeLabel(problem.taskType, props.copy)}</span>
                            <span>{questionTypeLabel(problem.questionType, props.copy)}</span>
                            <Show when={problem.year}><span>{problem.year}</span></Show>
                            <Show when={paperLabel(problem.paper, props.copy)}>{(label) => <span>{label()}</span>}</Show>
                            <span>{difficultyLabel(problem.difficulty, props.copy)}</span>
                            <Show when={problem.visualPotential}><span>{props.copy.problem.canvas}</span></Show>
                            <Show when={problem.media.length}>
                              <span class="problem-media-count" title={interpolate(props.copy.problem.imageCount, { count: problem.media.length })}>
                                <ImageIcon size={11} />{problem.media.length}
                              </span>
                            </Show>
                          </div>
                        </button>
                      )}
                    </For>
                  </Show>
                </div>
                <Show when={props.hasMoreProblems || props.problemsLoadMoreError}>
                  <div class="problem-list-footer">
                    <Show when={props.problemsLoadMoreError}>
                      <span>{interpolate(props.copy.problem.problemLoadFailed, { message: props.problemsLoadMoreError instanceof Error ? props.problemsLoadMoreError.message : String(props.problemsLoadMoreError) })}</span>
                    </Show>
                    <Show when={props.hasMoreProblems}>
                      <button
                        class="app-button secondary"
                        type="button"
                        disabled={props.problemsLoadingMore}
                        onClick={props.onLoadMoreProblems}
                      >
                        {props.problemsLoadingMore ? props.copy.problem.loadingMoreProblems : props.copy.problem.loadMoreProblems}
                      </button>
                    </Show>
                  </div>
                </Show>
              </Show>
            </Show>
          </section>

          <aside class="problem-detail-pane" classList={{ "loading-detail": props.selectedProblemLoading && Boolean(props.selectedProblem) }}>
            <Show
              when={props.selectedProblem}
              fallback={
                <Show
                  when={!props.selectedProblemLoading}
                  fallback={<div class="problem-empty-state">{props.copy.problem.loadingDetail}</div>}
                >
                  <div class="problem-detail-empty">
                    <BookOpen size={22} />
                    <strong>{props.copy.problem.selectProblem}</strong>
                    <p>{props.copy.problem.selectProblemBody}</p>
                  </div>
                </Show>
              }
            >
                {(problem) => (
                  <>
                    <Show when={props.selectedProblemLoading}>
                      <div class="problem-detail-loading">{props.copy.problem.loadingDetail}</div>
                    </Show>
                    <div class="problem-detail-head">
                      <div>
                        <strong><LatexText text={problemDisplayTitle(problem().title)} /></strong>
                        <div class="problem-detail-meta">
                          <span>{taskTypeLabel(problem().taskType, props.copy)}</span>
                          <span>{questionTypeLabel(problem().questionType, props.copy)}</span>
                          <Show when={problem().year}><span>{problem().year}</span></Show>
                          <Show when={paperLabel(problem().paper, props.copy)}>{(label) => <span>{label()}</span>}</Show>
                          <span>{difficultyLabel(problem().difficulty, props.copy)}</span>
                          <Show when={problem().score}><span>{interpolate(props.copy.problem.points, { score: problem().score ?? 0 })}</span></Show>
                        </div>
                      </div>
                    </div>
                    <div class="problem-detail-body">
                      <p><LatexText text={problemDisplayPrompt(problem().prompt)} /></p>
                      <Show when={problem().media.length}>
                        <div class="problem-media-grid">
                          <For each={problem().media}>
                            {(media) => (
                              <figure class="problem-media-item">
                                <Show
                                  when={problemMediaSrc(media)}
                                  fallback={
                                    <div class="problem-media-placeholder">
                                      <ImageIcon size={18} />
                                      <span>{props.copy.problem.imageUnavailable}</span>
                                      <code>{problemMediaLabel(media, props.copy.problem.imageUnavailable)}</code>
                                    </div>
                                  }
                                >
                                  {(src) => (
                                    <CachedProblemMediaImage
                                      src={src()}
                                      alt={problemMediaLabel(media, props.copy.problem.imageUnavailable)}
                                      width={media.width ?? undefined}
                                      height={media.height ?? undefined}
                                    />
                                  )}
                                </Show>
                              </figure>
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={problemDisplayTags(problem(), props.copy).length}>
                        <div class="problem-tags">
                          <For each={problemDisplayTags(problem(), props.copy)}>
                            {(tag) => <span>{tag}</span>}
                          </For>
                        </div>
                      </Show>
                      <Show when={problem().answer}>
                        <details class="problem-answer">
                          <summary>{props.copy.problem.viewAnswer}</summary>
                          <p><LatexText text={problem().answer ?? ""} /></p>
                        </details>
                      </Show>
                      <Show when={problem().analysis}>
                        <details class="problem-answer">
                          <summary>{props.copy.problem.viewAnalysis}</summary>
                          <p><LatexText text={problem().analysis ?? ""} /></p>
                        </details>
                      </Show>
                    </div>
                    <div class="problem-detail-actions">
                      <button class="app-button secondary" type="button" onClick={() => props.onUseProblem(problem(), "draft")}>
                        {props.copy.problem.fillInput}
                      </button>
                      <button class="app-button" type="button" onClick={() => props.onUseProblem(problem(), "send")}>
                        <Send size={16} />{props.copy.problem.startSolving}
                      </button>
                    </div>
                  </>
                )}
            </Show>
          </aside>
        </div>
        </Show>
      </div>
    </section>
  );
}
