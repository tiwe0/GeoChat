import { ArrowLeftIcon, CloudDownloadIcon, CloudIcon, ImageIcon, LibraryBigIcon, MessageSquarePlusIcon, RefreshCwIcon, SearchIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ProblemSetSummary } from "@geochat-ai/app";
import type {
  DesktopProblemBankCacheState,
  DesktopProblemBankCatalog,
  DesktopProblemDetail,
  DesktopProblemBankPage,
} from "../../../shared/desktop-api";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";
import { STREAMDOWN_PLUGINS } from "../features/chat/streamdownPlugins";
import { backendAuthToken, backendOrigin } from "../features/desktop/runtime";
import { desktopProblemBankApi } from "../features/desktop/problemBankDesktop";
import { fetchProblemSets } from "../features/desktop/settings/problemBankApi";
import { useStreamdownTranslations } from "../i18n/useStreamdownTranslations";

export type ProblemBankListItem = ProblemSetSummary & { source: "local" | "cloud" };
type ProblemRow = DesktopProblemBankPage["items"][number];
type LoadState = "loading" | "ready" | "error";
type PageState = "idle" | "loading" | "error" | "complete";
type NetworkInformationLike = { saveData?: boolean; effectiveType?: string };

const PAGE_PREFETCH_LIMIT = 8;
const DETAIL_PREFETCH_LIMIT = 12;

type ProblemBankSessionSnapshot = {
  localSets: ProblemBankListItem[];
  cacheState: DesktopProblemBankCacheState | null;
  catalog: DesktopProblemBankCatalog | null;
};

const problemBankSession = {
  snapshot: null as ProblemBankSessionSnapshot | null,
  snapshotRequest: null as Promise<ProblemBankSessionSnapshot> | null,
  pageRequests: new Map<string, Promise<DesktopProblemBankPage>>(),
  pageResults: new Map<string, DesktopProblemBankPage>(),
  detailRequests: new Map<string, Promise<DesktopProblemDetail>>(),
  detailResults: new Map<string, DesktopProblemDetail>(),
};

export function shouldPredictivelyPrefetch(
  connection?: NetworkInformationLike,
  online = true,
) {
  if (!online || connection?.saveData) return false;
  return connection?.effectiveType !== "slow-2g" && connection?.effectiveType !== "2g";
}

function retainPrefetch<T>(
  cache: Map<string, Promise<T>>,
  results: Map<string, T>,
  key: string,
  request: Promise<T>,
  limit: number,
) {
  cache.set(key, request);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== "string") break;
    cache.delete(oldest);
    results.delete(oldest);
  }
  return request;
}

function networkAllowsPrefetch() {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return shouldPredictivelyPrefetch(connection, navigator.onLine);
}

export function filterProblemSets(sets: ProblemSetSummary[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return sets;
  return sets.filter((set) => [set.title, set.description, set.slug]
    .some((value) => value.toLocaleLowerCase().includes(normalized)));
}

export function catalogToProblemSets(catalog: DesktopProblemBankCatalog | null): ProblemBankListItem[] {
  if (!catalog) return [];
  return catalog.banks.map((bank) => ({
    id: `cloud:${catalog.releaseId}:${bank.bankSlug}`,
    slug: bank.bankSlug,
    title: bank.title,
    description: bank.description ?? bank.datasetId ?? "",
    kind: "imported",
    problemCount: bank.problemCount,
    source: "cloud",
    releaseId: catalog.releaseId,
    releaseChannel: catalog.channel as "production" | "evaluation" | "internal",
    bankSlug: bank.bankSlug,
    cloudBaseUrl: catalog.cloudBaseUrl,
    datasetId: bank.datasetId,
    accessTier: "open",
    reusePolicy: bank.reusePolicy,
  }));
}

function pageCacheKey(bank: ProblemBankListItem, cursor: string | null) {
  return `${bank.releaseId ?? "local"}:${bank.bankSlug ?? bank.slug}:${cursor ?? "0"}`;
}

function detailCacheKey(bank: ProblemBankListItem, problemId: string) {
  return `${bank.releaseId ?? "local"}:${bank.bankSlug ?? bank.slug}:${problemId}`;
}

function requestProblemPage(bank: ProblemBankListItem, cursor: string | null) {
  const desktopApi = desktopProblemBankApi();
  if (!desktopApi) return Promise.reject(new Error("Problem-bank desktop API is unavailable"));
  const key = pageCacheKey(bank, cursor);
  const cached = problemBankSession.pageResults.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = problemBankSession.pageRequests.get(key);
  if (pending) return pending;
  const request = desktopApi.loadProblemBankPage(bank.bankSlug ?? bank.slug, cursor)
    .then((page) => {
      problemBankSession.pageResults.set(key, page);
      return page;
    })
    .catch((caughtError) => {
      problemBankSession.pageRequests.delete(key);
      throw caughtError;
    });
  return retainPrefetch(
    problemBankSession.pageRequests,
    problemBankSession.pageResults,
    key,
    request,
    PAGE_PREFETCH_LIMIT,
  );
}

function requestProblemDetail(bank: ProblemBankListItem, problem: ProblemRow) {
  const desktopApi = desktopProblemBankApi();
  if (!desktopApi) return Promise.reject(new Error("Problem-bank desktop API is unavailable"));
  const key = detailCacheKey(bank, problem.id);
  const cached = problemBankSession.detailResults.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = problemBankSession.detailRequests.get(key);
  if (pending) return pending;
  const request = desktopApi.loadProblemDetail(bank.bankSlug ?? bank.slug, problem.id)
    .then((detail) => {
      problemBankSession.detailResults.set(key, detail);
      preloadFirstProblemMedia(detail);
      return detail;
    })
    .catch((caughtError) => {
      problemBankSession.detailRequests.delete(key);
      throw caughtError;
    });
  return retainPrefetch(
    problemBankSession.detailRequests,
    problemBankSession.detailResults,
    key,
    request,
    DETAIL_PREFETCH_LIMIT,
  );
}

function loadProblemBankSnapshot() {
  if (problemBankSession.snapshot) return Promise.resolve(problemBankSession.snapshot);
  if (problemBankSession.snapshotRequest) return problemBankSession.snapshotRequest;
  const desktopApi = desktopProblemBankApi();
  const request = Promise.all([
    fetchProblemSets(backendOrigin(), backendAuthToken()),
    desktopApi?.getProblemBankCacheState() ?? Promise.resolve(null),
    desktopApi?.getProblemBankCatalog().catch((caughtError) => {
      console.error("[ERROR] Failed to read the cached cloud problem-bank catalog", caughtError);
      return null;
    }) ?? Promise.resolve(null),
  ]).then(([localResult, cacheState, catalog]) => {
    const snapshot: ProblemBankSessionSnapshot = {
      localSets: localResult.sets.map((set) => ({ ...set, source: "local" as const })),
      cacheState,
      catalog,
    };
    problemBankSession.snapshot = snapshot;
    return snapshot;
  }).finally(() => {
    problemBankSession.snapshotRequest = null;
  });
  problemBankSession.snapshotRequest = request;
  return request;
}

export async function preloadProblemBankSidecar() {
  try {
    const snapshot = await loadProblemBankSnapshot();
    const firstCloudBank = catalogToProblemSets(snapshot.catalog)[0];
    if (firstCloudBank && networkAllowsPrefetch()) {
      await requestProblemPage(firstCloudBank, "0");
    }
  } catch (caughtError) {
    console.debug("[DEBUG] Problem-bank preload was skipped", caughtError);
  }
}

export function appendProblemPage(existing: ProblemRow[], page: DesktopProblemBankPage): ProblemRow[] {
  const ids = new Set(existing.map((item) => item.id));
  return [...existing, ...page.items.filter((item) => !ids.has(item.id))];
}

export function normalizeProblemMarkdown(value: string) {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[＼﹨]/g, "\\")
    .replace(/\\textbf\{([^{}]+)\}/g, "**$1**")
    .replace(/\\\\[ \t]*\n/g, "\n")
    .replace(/\\\{x\|\|\s*x\s*\\mid\s*\\leqslant/g, "\\{x \\mid |x| \\leqslant")
    .replace(/=\s*[，,]\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\\mathrm\{~,\s*~\s*则\s*~\}/g, "=($1,$2)\\text{，则 }");

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, "  \n"))
    .join("\n\n");
}

export function problemComposerText(prompt?: string | null, preview?: string | null, fallback = "") {
  return normalizeProblemMarkdown(prompt?.trim() || preview?.trim() || fallback.trim());
}

export function ProblemBankSidecar({
  onClose,
  onUseProblem,
}: {
  onClose: () => void;
  onUseProblem: (problem: string) => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const initialSnapshot = problemBankSession.snapshot;
  const [localSets, setLocalSets] = useState<ProblemBankListItem[]>(initialSnapshot?.localSets ?? []);
  const [catalog, setCatalog] = useState<DesktopProblemBankCatalog | null>(initialSnapshot?.catalog ?? null);
  const [cacheState, setCacheState] = useState<DesktopProblemBankCacheState | null>(initialSnapshot?.cacheState ?? null);
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<LoadState>(initialSnapshot ? "ready" : "loading");
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selectedBank, setSelectedBank] = useState<ProblemBankListItem | null>(null);
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageState, setPageState] = useState<PageState>("idle");
  const [pageError, setPageError] = useState<string | null>(null);
  const [selectedProblem, setSelectedProblem] = useState<ProblemRow | null>(null);
  const [problemDetail, setProblemDetail] = useState<DesktopProblemDetail | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("ready");
  const [detailError, setDetailError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const requestVersion = useRef(0);
  const pageRequestVersion = useRef(0);
  const detailRequestVersion = useRef(0);
  const pageLoadingRef = useRef(false);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!problemBankSession.snapshot) setLoadState("loading");
    setError(null);
    try {
      const snapshot = await loadProblemBankSnapshot();
      if (version !== requestVersion.current) return;
      setLocalSets(snapshot.localSets);
      setCacheState(snapshot.cacheState);
      setCatalog(snapshot.catalog);
      setLoadState("ready");
    } catch (caughtError) {
      if (version !== requestVersion.current) return;
      console.error("[ERROR] Failed to load the problem-bank sidecar", caughtError);
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
    closeButtonRef.current?.focus({ preventScroll: true });
    const dispose = desktopProblemBankApi()?.onProblemBankCacheState(setCacheState);
    return () => {
      requestVersion.current += 1;
      pageRequestVersion.current += 1;
      detailRequestVersion.current += 1;
      dispose?.();
    };
  }, [load]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (selectedBank) {
        if (selectedProblem) {
          detailRequestVersion.current += 1;
          setSelectedProblem(null);
          setProblemDetail(null);
          setDetailState("ready");
          setDetailError(null);
          return;
        }
        pageRequestVersion.current += 1;
        detailRequestVersion.current += 1;
        pageLoadingRef.current = false;
        setSelectedBank(null);
        setProblems([]);
        setNextCursor(null);
        setPageState("idle");
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, selectedBank, selectedProblem]);

  const syncCloudCatalog = useCallback(async () => {
    const desktopApi = desktopProblemBankApi();
    if (!desktopApi || syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const nextState = await desktopApi.syncProblemBankMetadata();
      const nextCatalog = await desktopApi.getProblemBankCatalog();
      problemBankSession.snapshot = {
        localSets,
        cacheState: nextState,
        catalog: nextCatalog,
      };
      problemBankSession.pageRequests.clear();
      problemBankSession.pageResults.clear();
      problemBankSession.detailRequests.clear();
      problemBankSession.detailResults.clear();
      setCacheState(nextState);
      setCatalog(nextCatalog);
      setLoadState("ready");
    } catch (caughtError) {
      console.error("[ERROR] Failed to sync the cloud problem-bank catalog", caughtError);
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setSyncing(false);
    }
  }, [localSets, syncing]);

  const getProblemPage = useCallback((bank: ProblemBankListItem, cursor: string | null) => {
    return requestProblemPage(bank, cursor);
  }, []);

  const getProblemDetail = useCallback((bank: ProblemBankListItem, problem: ProblemRow) => {
    return requestProblemDetail(bank, problem);
  }, []);

  const prefetchBank = useCallback((bank: ProblemBankListItem) => {
    if (bank.source !== "cloud" || !networkAllowsPrefetch()) return;
    void getProblemPage(bank, "0").catch((caughtError) => {
      console.debug("[DEBUG] Predictive problem-bank page download was skipped", caughtError);
    });
  }, [getProblemPage]);

  const prefetchProblem = useCallback((problem: ProblemRow) => {
    if (!selectedBank || !networkAllowsPrefetch()) return;
    void getProblemDetail(selectedBank, problem).catch((caughtError) => {
      console.debug("[DEBUG] Predictive problem detail download was skipped", caughtError);
    });
  }, [getProblemDetail, selectedBank]);

  const loadProblemPage = useCallback(async (bank: ProblemBankListItem, cursor: string | null) => {
    if (!desktopProblemBankApi() || pageLoadingRef.current) return;
    const version = ++pageRequestVersion.current;
    pageLoadingRef.current = true;
    setPageState("loading");
    setPageError(null);
    try {
      const page = await getProblemPage(bank, cursor);
      if (version !== pageRequestVersion.current) return;
      setProblems((current) => appendProblemPage(current, page));
      setNextCursor(page.nextCursor);
      setPageState(page.nextCursor ? "idle" : "complete");
    } catch (caughtError) {
      if (version !== pageRequestVersion.current) return;
      console.error("[ERROR] Failed to lazily load a problem-bank page", caughtError);
      setPageError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      setPageState("error");
    } finally {
      if (version === pageRequestVersion.current) pageLoadingRef.current = false;
    }
  }, [getProblemPage]);

  const openBank = useCallback((bank: ProblemBankListItem) => {
    if (bank.source !== "cloud") return;
    pageRequestVersion.current += 1;
    detailRequestVersion.current += 1;
    pageLoadingRef.current = false;
    setSelectedBank(bank);
    const cachedPage = problemBankSession.pageResults.get(pageCacheKey(bank, "0"));
    setProblems(cachedPage?.items ?? []);
    setNextCursor(cachedPage?.nextCursor ?? "0");
    setPageState(cachedPage ? (cachedPage.nextCursor ? "idle" : "complete") : "idle");
    setPageError(null);
    setSelectedProblem(null);
    setProblemDetail(null);
    setDetailError(null);
    if (!cachedPage) void loadProblemPage(bank, "0");
  }, [loadProblemPage]);

  const switchBank = useCallback((bankSlug: string) => {
    const bank = catalogToProblemSets(catalog).find((item) => item.bankSlug === bankSlug);
    if (bank) openBank(bank);
  }, [catalog, openBank]);

  const openProblem = useCallback(async (problem: ProblemRow) => {
    if (!desktopProblemBankApi() || !selectedBank) return;
    const version = ++detailRequestVersion.current;
    const cachedDetail = problemBankSession.detailResults.get(detailCacheKey(selectedBank, problem.id));
    setSelectedProblem(problem);
    setProblemDetail(cachedDetail ?? null);
    setDetailState(cachedDetail ? "ready" : "loading");
    setDetailError(null);
    if (cachedDetail) return;
    try {
      const detail = await getProblemDetail(selectedBank, problem);
      if (version !== detailRequestVersion.current) return;
      setProblemDetail(detail);
      setDetailState("ready");
    } catch (caughtError) {
      if (version !== detailRequestVersion.current) return;
      console.error("[ERROR] Failed to load the problem detail", caughtError);
      setDetailError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      setDetailState("error");
    }
  }, [getProblemDetail, selectedBank]);

  const closeProblem = useCallback(() => {
    detailRequestVersion.current += 1;
    setSelectedProblem(null);
    setProblemDetail(null);
    setDetailState("ready");
    setDetailError(null);
  }, []);

  const closeBank = useCallback(() => {
    pageRequestVersion.current += 1;
    detailRequestVersion.current += 1;
    pageLoadingRef.current = false;
    setSelectedBank(null);
    setProblems([]);
    setNextCursor(null);
    setPageState("idle");
    setPageError(null);
    setSelectedProblem(null);
    setProblemDetail(null);
    setDetailError(null);
  }, []);

  const handleBodyScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (!selectedBank || selectedProblem || !nextCursor || pageState === "loading") return;
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight <= 180) {
      void loadProblemPage(selectedBank, nextCursor);
    }
  }, [loadProblemPage, nextCursor, pageState, selectedBank, selectedProblem]);

  useEffect(() => {
    if (!selectedBank || selectedProblem || !nextCursor || pageState !== "idle" || !networkAllowsPrefetch()) return;
    const timer = window.setTimeout(() => {
      void getProblemPage(selectedBank, nextCursor).catch((caughtError) => {
        console.debug("[DEBUG] Predictive next-page download was skipped", caughtError);
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [getProblemPage, nextCursor, pageState, selectedBank, selectedProblem]);

  const cloudSets = useMemo(() => catalogToProblemSets(catalog), [catalog]);
  const sets = useMemo(() => [...localSets, ...cloudSets], [cloudSets, localSets]);
  const visibleSets = useMemo(() => filterProblemSets(sets, query), [query, sets]);
  const totalProblems = sets.reduce((total, set) => total + set.problemCount, 0);
  const loading = loadState === "loading";
  const cloudReady = cloudSets.length > 0;
  const cloudActionLabel = cloudReady && cacheState?.updateAvailable
    ? t("problemBank.updateCloud")
    : t("problemBank.loadCloud");
  const viewTransitionKey = selectedProblem
    ? `detail:${selectedProblem.id}`
    : selectedBank
      ? `bank:${selectedBank.id}`
      : "catalog";

  useEffect(() => {
    const firstCloudBank = cloudSets[0];
    if (!firstCloudBank || selectedBank || loadState !== "ready" || !networkAllowsPrefetch()) return;
    const timer = window.setTimeout(() => prefetchBank(firstCloudBank), 500);
    return () => window.clearTimeout(timer);
  }, [cloudSets, loadState, prefetchBank, selectedBank]);

  return (
    <Box
      component="aside"
      id="copilot-problem-bank-sidecar"
      className="problem-bank-sidecar-content"
      role="complementary"
      aria-label={t("problemBank.drawerLabel")}
      aria-busy={loading || syncing || pageState === "loading" || detailState === "loading"}
    >
      <Box component="header" className="problem-bank-sidecar-header">
        <Stack direction="row" spacing={1} sx={{ minWidth: 0, alignItems: "center" }}>
          {selectedBank ? (
            <Tooltip title={t("problemBank.backToBanks")} arrow>
              <IconButton
                size="small"
                onClick={selectedProblem ? closeProblem : closeBank}
                aria-label={selectedProblem ? t("problemBank.backToProblems") : t("problemBank.backToBanks")}
              >
                <ArrowLeftIcon size={18} />
              </IconButton>
            </Tooltip>
          ) : (
            <Box className="problem-bank-sidecar-mark" aria-hidden="true">
              <LibraryBigIcon size={18} />
            </Box>
          )}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            {selectedBank ? (
              <TextField
                select
                variant="standard"
                size="small"
                value={selectedBank.bankSlug ?? selectedBank.slug}
                onChange={(event) => switchBank(event.target.value)}
                className="problem-bank-switcher"
                slotProps={{ htmlInput: { "aria-label": t("problemBank.switchBank") } }}
              >
                {cloudSets.map((bank) => (
                  <MenuItem key={bank.id} value={bank.bankSlug ?? bank.slug}>{bank.title}</MenuItem>
                ))}
              </TextField>
            ) : (
              <Typography variant="subtitle2" sx={{ fontWeight: 760 }} noWrap>{t("problemBank.title")}</Typography>
            )}
            <Typography variant="caption" color="text.secondary" noWrap>
              {selectedProblem
                ? detailState === "loading" ? t("problemBank.loadingDetail") : t("problemBank.problemDetail")
                : selectedBank
                ? pageState === "loading" && problems.length === 0
                  ? t("problemBank.loadingIndex")
                  : t("problemBank.loadedProblems", { loaded: problems.length, total: selectedBank.problemCount })
                : loading
                  ? t("problemBank.loading")
                  : t("problemBank.summary", { sets: sets.length, problems: totalProblems })}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={0.25}>
          {!selectedBank ? (
            <Tooltip title={t("problemBank.refresh")} arrow>
              <span>
                <IconButton size="small" disabled={loading || syncing} onClick={() => void load()} aria-label={t("problemBank.refresh")}>
                  {loading ? <CircularProgress size={16} /> : <RefreshCwIcon size={18} />}
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
          <Tooltip title={t("problemBank.close")} arrow>
            <IconButton data-fusion-panel-close ref={closeButtonRef} size="small" onClick={onClose} aria-label={t("problemBank.close")}>
              <XIcon size={18} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {!selectedBank ? (
        <Box className="problem-bank-sidecar-search">
          <TextField
            fullWidth
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("problemBank.searchPlaceholder")}
            slotProps={{
              htmlInput: { "aria-label": t("problemBank.searchLabel") },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon size={18} />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
      ) : null}

      <Box className="problem-bank-sidecar-body" onScroll={handleBodyScroll}>
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={viewTransitionKey}
            className="problem-bank-view-transition"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {selectedBank && selectedProblem ? (
              <ProblemDetailView
                summary={selectedProblem}
                detail={problemDetail}
                state={detailState}
                error={detailError}
                onRetry={() => void openProblem(selectedProblem)}
                onUseProblem={onUseProblem}
              />
            ) : selectedBank ? (
              <ProblemWaterfall
                problems={problems}
                state={pageState}
                error={pageError}
                hasMore={Boolean(nextCursor)}
                onRetry={() => void loadProblemPage(selectedBank, nextCursor ?? "0")}
                onOpenProblem={(problem) => void openProblem(problem)}
                onPrefetchProblem={prefetchProblem}
              />
            ) : loading ? (
              <ProblemBankSkeleton />
            ) : (
              <>
            {desktopProblemBankApi() && (!cloudReady || cacheState?.updateAvailable) ? (
              <Box className="problem-bank-cloud-loader" role="status">
                <Stack direction="row" spacing={1} sx={{ minWidth: 0, alignItems: "center" }}>
                  <CloudDownloadIcon color="#2563eb" size={18} />
                  <Typography variant="body2" sx={{ minWidth: 0, flex: 1, fontWeight: 700 }}>
                    {cloudReady ? t("problemBank.cloudUpdateAvailable") : t("problemBank.cloudNotLoaded")}
                  </Typography>
                  <Button size="small" variant="contained" disableElevation disabled={syncing} onClick={() => void syncCloudCatalog()}>
                    {syncing ? <CircularProgress size={15} color="inherit" /> : cloudActionLabel}
                  </Button>
                </Stack>
              </Box>
            ) : null}

            {error ? (
              <Box className="problem-bank-sidecar-state problem-bank-sidecar-state-compact" role="alert">
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{t("problemBank.loadFailed")}</Typography>
                <Typography variant="caption" color="text.secondary">{error}</Typography>
              </Box>
            ) : sets.length === 0 ? (
              <Box className="problem-bank-sidecar-state">
                <LibraryBigIcon color="#9ca3af" />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{t("problemBank.emptyTitle")}</Typography>
                <Typography variant="caption" color="text.secondary">{t("problemBank.emptyDescription")}</Typography>
              </Box>
            ) : visibleSets.length === 0 ? (
              <Box className="problem-bank-sidecar-state">
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{t("problemBank.noMatches")}</Typography>
                <Typography variant="caption" color="text.secondary">{t("problemBank.tryAnotherSearch")}</Typography>
              </Box>
            ) : (
              <Stack className="problem-bank-sidecar-list" spacing={0.75}>
                {visibleSets.map((set) => (
                  <Box
                    key={set.id}
                    component={set.source === "cloud" ? "button" : "article"}
                    type={set.source === "cloud" ? "button" : undefined}
                    className={`problem-bank-sidecar-item${set.source === "cloud" ? " problem-bank-sidecar-item-action" : ""}`}
                    onClick={set.source === "cloud" ? () => openBank(set as ProblemBankListItem) : undefined}
                    onPointerEnter={set.source === "cloud" ? () => prefetchBank(set as ProblemBankListItem) : undefined}
                    onFocus={set.source === "cloud" ? () => prefetchBank(set as ProblemBankListItem) : undefined}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                      <Box className="problem-bank-sidecar-source" aria-hidden="true">
                        {set.source === "cloud" ? <CloudIcon size={18} /> : <LibraryBigIcon size={18} />}
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          <Typography variant="body2" sx={{ minWidth: 0, flex: 1, fontWeight: 720 }} noWrap title={set.title}>{set.title}</Typography>
                          <Chip size="small" variant="outlined" label={set.source === "cloud" ? t("problemBank.cloud") : t("problemBank.local")} />
                        </Stack>
                        {set.description ? (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.35, display: "-webkit-box", overflow: "hidden", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}>{set.description}</Typography>
                        ) : null}
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.6, display: "block" }}>{t("problemBank.problemCount", { count: set.problemCount })}</Typography>
                      </Box>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </Box>
    </Box>
  );
}

function ProblemBankSkeleton() {
  const { t } = useTranslation();
  return (
    <Stack className="problem-bank-loading-stack" spacing={1} aria-label={t("problemBank.loading")} role="status">
      {[0, 1, 2].map((item) => (
        <Box key={item} className="problem-bank-sidecar-skeleton">
          <Skeleton animation="wave" variant="text" width="58%" />
          <Skeleton animation="wave" variant="text" width="82%" />
          <Skeleton animation="wave" variant="text" width="34%" />
        </Box>
      ))}
    </Stack>
  );
}

function ProblemIndexSkeleton() {
  const { t } = useTranslation();
  return (
    <Stack className="problem-bank-loading-stack" spacing={0.75} aria-label={t("problemBank.loadingIndex")} role="status">
      {[0, 1, 2, 3].map((item) => (
        <Box key={item} className="problem-bank-problem-card problem-bank-index-skeleton">
          <Skeleton animation="wave" variant="text" width="24%" />
          <Skeleton animation="wave" variant="text" width={item % 2 === 0 ? "92%" : "84%"} />
          <Skeleton animation="wave" variant="text" width="68%" />
        </Box>
      ))}
    </Stack>
  );
}

function ProblemDetailSkeleton() {
  const { t } = useTranslation();
  return (
    <Stack className="problem-bank-loading-stack problem-bank-detail-skeleton" spacing={1.25} aria-label={t("problemBank.loadingDetail")} role="status">
      <Box className="problem-bank-detail-section">
        <Skeleton animation="wave" variant="text" width="36%" />
        <Skeleton animation="wave" variant="text" width="94%" />
        <Skeleton animation="wave" variant="text" width="88%" />
        <Skeleton animation="wave" variant="text" width="64%" />
      </Box>
      <Skeleton animation="wave" variant="rounded" height={156} />
      <Box className="problem-bank-detail-section">
        <Skeleton animation="wave" variant="text" width="28%" />
        <Skeleton animation="wave" variant="text" width="78%" />
        <Skeleton animation="wave" variant="text" width="52%" />
      </Box>
    </Stack>
  );
}

function ProblemWaterfall({
  problems,
  state,
  error,
  hasMore,
  onRetry,
  onOpenProblem,
  onPrefetchProblem,
}: {
  problems: ProblemRow[];
  state: PageState;
  error: string | null;
  hasMore: boolean;
  onRetry: () => void;
  onOpenProblem: (problem: ProblemRow) => void;
  onPrefetchProblem: (problem: ProblemRow) => void;
}) {
  const { t } = useTranslation();
  if (state === "loading" && problems.length === 0) return <ProblemIndexSkeleton />;
  return (
    <Stack className="problem-bank-waterfall" spacing={1}>
      {problems.map((problem, index) => (
        <Box
          key={problem.id}
          component="button"
          type="button"
          className="problem-bank-problem-card problem-bank-problem-card-action"
          onClick={() => onOpenProblem(problem)}
          onPointerEnter={() => onPrefetchProblem(problem)}
          onFocus={() => onPrefetchProblem(problem)}
        >
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.55 }}>
            <Typography variant="caption" color="text.secondary">#{index + 1}</Typography>
            {problem.difficulty ? <Chip size="small" variant="outlined" label={problem.difficulty} /> : null}
            {problem.hasMedia ? <ImageIcon color="#6b7280" size={16} /> : null}
          </Stack>
          <ProblemMarkdown>{problem.promptPreview || problem.id}</ProblemMarkdown>
          {problem.knowledge?.length ? (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.65, display: "block" }}>
              {problem.knowledge.slice(0, 3).join(" · ")}
            </Typography>
          ) : null}
        </Box>
      ))}
      {state === "loading" ? (
        <Box className="problem-bank-page-status"><CircularProgress size={18} /><Typography variant="caption">{t("problemBank.loadingNextPage")}</Typography></Box>
      ) : state === "error" ? (
        <Box className="problem-bank-page-status" role="alert">
          <Typography variant="caption" color="error.main">{error ?? t("problemBank.pageLoadFailed")}</Typography>
          <Button size="small" onClick={onRetry}>{t("problemBank.retry")}</Button>
        </Box>
      ) : !hasMore && problems.length > 0 ? (
        <Typography className="problem-bank-page-end" variant="caption" color="text.secondary">{t("problemBank.allLoaded")}</Typography>
      ) : null}
    </Stack>
  );
}

function ProblemDetailView({
  summary,
  detail,
  state,
  error,
  onRetry,
  onUseProblem,
}: {
  summary: ProblemRow;
  detail: DesktopProblemDetail | null;
  state: LoadState;
  error: string | null;
  onRetry: () => void;
  onUseProblem: (problem: string) => void;
}) {
  const { t } = useTranslation();
  if (state === "loading") return <ProblemDetailSkeleton />;
  if (state === "error" || !detail) {
    return (
      <Box className="problem-bank-sidecar-state" role="alert">
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{t("problemBank.detailLoadFailed")}</Typography>
        <Typography variant="caption" color="text.secondary">{error}</Typography>
        <Button size="small" onClick={onRetry}>{t("problemBank.retry")}</Button>
      </Box>
    );
  }
  const problem = detail.problem;
  const answer = problem.answer;
  const media = problem.media ?? [];
  const composerText = problemComposerText(problem.prompt, summary.promptPreview, summary.id);
  return (
    <Stack className="problem-bank-detail" spacing={1.25}>
      <Box className="problem-bank-detail-section">
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.75 }}>
          {problem.taxonomy?.difficulty ? <Chip size="small" variant="outlined" label={problem.taxonomy.difficulty} /> : null}
          <Typography variant="caption" color="text.secondary">{problem.source?.datasetId ?? summary.id}</Typography>
        </Stack>
        <ProblemMarkdown>{problem.prompt || summary.promptPreview || summary.id}</ProblemMarkdown>
        <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 1.25 }}>
          <Button
            size="small"
            variant="contained"
            disableElevation
            startIcon={<MessageSquarePlusIcon size={18} />}
            onClick={() => onUseProblem(composerText)}
          >
            {t("problemBank.useInComposer")}
          </Button>
        </Stack>
      </Box>
      {media.map((item, index) => {
        const src = item.r2Url || item.url || item.trackingUrl;
        return src ? (
          <ProblemMedia
            key={`${src}-${index}`}
            src={src}
            alt={item.alt || t("problemBank.problemImage", { index: index + 1 })}
          />
        ) : null;
      })}
      {answer ? (
        <Box className="problem-bank-detail-section problem-bank-detail-answer">
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t("problemBank.answer")}</Typography>
          {answer.final ? <ProblemMarkdown>{answer.final}</ProblemMarkdown> : null}
          {answer.analysis || answer.solution ? (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block", fontWeight: 700 }}>{t("problemBank.analysis")}</Typography>
              <ProblemMarkdown>{answer.analysis || answer.solution || ""}</ProblemMarkdown>
            </>
          ) : null}
        </Box>
      ) : null}
    </Stack>
  );
}

function preloadFirstProblemMedia(detail: DesktopProblemDetail) {
  if (typeof Image === "undefined" || !networkAllowsPrefetch()) return;
  const first = detail.problem.media?.find((item) => item.r2Url || item.url || item.trackingUrl);
  const src = first?.r2Url || first?.url || first?.trackingUrl;
  if (!src) return;
  const image = new Image();
  image.decoding = "async";
  image.src = src;
}

function ProblemMedia({ src, alt }: { src: string; alt: string }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (failed) {
    return (
      <Box className="problem-bank-detail-image-fallback" role="alert">
        <ImageIcon color="#9ca3af" />
        <Typography variant="caption" color="text.secondary">{t("problemBank.imageLoadFailed")}</Typography>
        <Button size="small" onClick={() => { setAttempt((current) => current + 1); setFailed(false); }}>
          {t("problemBank.retry")}
        </Button>
      </Box>
    );
  }

  return (
    <Box
      key={attempt}
      component="img"
      className="problem-bank-detail-image"
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        console.error("[ERROR] Failed to load problem media from the configured source.");
        setFailed(true);
      }}
    />
  );
}

function ProblemMarkdown({ children }: { children: string }) {
  const translations = useStreamdownTranslations();
  return (
    <Streamdown
      className="copilot-markdown problem-bank-problem-markdown"
      plugins={STREAMDOWN_PLUGINS}
      translations={translations}
    >
      {normalizeProblemMarkdown(children)}
    </Streamdown>
  );
}
