import type { ProblemDetail, ProblemListResponse, ProblemSetSummary, RuntimeInfo } from "@geochat-ai/app";
import { createEffect, createMemo, createResource, createSignal, type Accessor } from "solid-js";
import type { ProblemBankFilters } from "./problem-bank-utils";
import {
  decodeProblemDetailSource,
  decodeProblemListSource,
  encodeProblemDetailSource,
  encodeProblemListSource,
  fetchProblemDetail,
  fetchProblems,
  fetchProblemSets
} from "./workbench-api";

const DEFAULT_PROBLEM_FILTERS: ProblemBankFilters = {
  query: "",
  difficulty: "all",
  questionType: "all",
  year: "all",
  paper: "all",
  visualOnly: false
};

export function createProblemBankState(runtime: Accessor<RuntimeInfo | undefined>, locale: Accessor<string>) {
  const [activeProblemSetId, setActiveProblemSetId] = createSignal<string | undefined>();
  const [selectedProblemId, setSelectedProblemId] = createSignal<string | undefined>();
  const [problemDetailCache, setProblemDetailCache] = createSignal<Record<string, ProblemDetail>>({});
  const [problemFilters, setProblemFilters] = createSignal<ProblemBankFilters>({ ...DEFAULT_PROBLEM_FILTERS });
  const [loadedProblemList, setLoadedProblemList] = createSignal<ProblemListResponse | undefined>();
  const [problemListLoadingMore, setProblemListLoadingMore] = createSignal(false);
  const [problemListLoadMoreError, setProblemListLoadMoreError] = createSignal<unknown>();

  const [problemSets] = createResource(runtime, fetchProblemSets);
  const activeProblemSet = createMemo<ProblemSetSummary | undefined>(() => {
    const setId = activeProblemSetId();
    return problemSets.latest?.find((set) => set.id === setId);
  });
  const problemListSource = createMemo(() => {
    const info = runtime();
    const set = activeProblemSet();
    const setId = set?.id ?? activeProblemSetId();
    if (!info || !setId) return undefined;
    return encodeProblemListSource({
      source: set?.source ?? "local",
      backendBaseUrl: info.backendBaseUrl,
      backendAuthToken: info.backendAuthToken,
      setId,
      cloudBaseUrl: set?.cloudBaseUrl ?? undefined,
      bankSlug: set?.bankSlug ?? undefined,
      filters: problemFilters()
    });
  });
  const [problemList] = createResource(problemListSource, (source) => fetchProblems(decodeProblemListSource(source)));
  const displayProblemList = createMemo(() => runtime() ? loadedProblemList() ?? problemList.latest : undefined);
  const problemDetailSource = createMemo(() => {
    const info = runtime();
    const id = selectedProblemId();
    const set = activeProblemSet();
    const preview = displayProblemList()?.problems.find((item) => item.id === id);
    return info && id
      ? encodeProblemDetailSource({
        source: preview?.source ?? set?.source ?? "local",
        backendBaseUrl: info.backendBaseUrl,
        backendAuthToken: info.backendAuthToken,
        cloudBaseUrl: set?.cloudBaseUrl ?? undefined,
        bankSlug: preview?.bankSlug ?? set?.bankSlug ?? undefined,
        problemApiPath: preview?.problemApiPath ?? undefined,
        id
      })
      : undefined;
  });
  const [selectedProblem] = createResource(problemDetailSource, (source) => fetchProblemDetail(decodeProblemDetailSource(source)));

  createEffect(() => {
    if (runtime()) return;
    setActiveProblemSetId(undefined);
    setSelectedProblemId(undefined);
    setProblemDetailCache({});
    setProblemFilters({ ...DEFAULT_PROBLEM_FILTERS });
    setLoadedProblemList(undefined);
    setProblemListLoadMoreError(undefined);
  });

  createEffect(() => {
    const detail = selectedProblem.latest;
    if (!detail) return;
    cacheProblemDetail(detail);
  });

  const selectedProblemPreview = createMemo<ProblemDetail | undefined>(() => {
    const id = selectedProblemId();
    const problem = displayProblemList()?.problems.find((item) => item.id === id);
    return problem ? { ...problem, answer: null, analysis: null, rawPayload: null } : undefined;
  });

  const selectedProblemForDisplay = createMemo(() => {
    if (!runtime()) return undefined;
    const id = selectedProblemId();
    if (!id) return undefined;
    const detail = selectedProblem.latest;
    return detail?.id === id ? detail : problemDetailCache()[id] ?? selectedProblemPreview();
  });

  createEffect(() => {
    const sets = problemSets.latest;
    if (!sets?.length || activeProblemSetId()) return;
    const preferred = preferredInitialProblemSet(sets, locale());
    setActiveProblemSetId(preferred.id);
  });

  createEffect(() => {
    const list = problemList.latest;
    setLoadedProblemList(list);
    setProblemListLoadMoreError(undefined);
    if (!list?.problems.length) {
      setSelectedProblemId(undefined);
      return;
    }
    if (!selectedProblemId() || !list.problems.some((problem) => problem.id === selectedProblemId())) {
      setSelectedProblemId(list.problems[0].id);
    }
  });

  function cacheProblemDetail(problem: ProblemDetail) {
    setProblemDetailCache((current) => (current[problem.id] === problem ? current : { ...current, [problem.id]: problem }));
  }

  function selectProblemSet(id: string) {
    setActiveProblemSetId(id);
    setSelectedProblemId(undefined);
  }

  async function loadMoreProblems() {
    const current = displayProblemList();
    const nextCursor = current?.nextCursor;
    const source = problemListSource();
    if (!current || !nextCursor || !source || problemListLoadingMore()) return;
    setProblemListLoadingMore(true);
    setProblemListLoadMoreError(undefined);
    try {
      const next = await fetchProblems({ ...decodeProblemListSource(source), cursor: nextCursor });
      setLoadedProblemList({
        ...next,
        problems: [...current.problems, ...next.problems],
        total: current.problems.length + next.problems.length,
        offset: 0,
        source: next.source,
        nextCursor: next.nextCursor
      });
    } catch (error) {
      setProblemListLoadMoreError(error);
    } finally {
      setProblemListLoadingMore(false);
    }
  }

  return {
    activeProblemSetId,
    cacheProblemDetail,
    displayProblemList,
    loadMoreProblems,
    problemFilters,
    problemList,
    problemListLoadMoreError,
    problemListLoadingMore,
    problemSets,
    selectProblemSet,
    selectedProblem,
    selectedProblemForDisplay,
    selectedProblemId,
    setProblemFilters,
    setSelectedProblemId
  };
}

function preferredInitialProblemSet(sets: ProblemSetSummary[], locale: string) {
  if (locale.startsWith("zh")) {
    return sets.find((set) => set.slug === "openlmlab-gaokao-bench")
      ?? sets.find((set) => set.slug?.includes("gaokao"))
      ?? sets[0];
  }
  return sets.find((set) => set.slug === "visual-candidates") ?? sets[0];
}
