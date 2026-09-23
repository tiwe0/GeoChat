import { useCallback, useEffect, useRef, useState } from "react";
import CloudDownloadOutlined from "@mui/icons-material/CloudDownloadOutlined";
import CheckCircleOutlineRounded from "@mui/icons-material/CheckCircleOutlineRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import LibraryBooksOutlined from "@mui/icons-material/LibraryBooksOutlined";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import ReplayRounded from "@mui/icons-material/ReplayRounded";
import SyncRounded from "@mui/icons-material/SyncRounded";
import {
  Box,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ProblemImportResponse, ProblemSetSummary } from "@geochat-ai/app";
import type {
  DesktopProblemBankCatalog,
  DesktopProblemBankDownloadState,
  DesktopProblemBankSummary,
} from "../../../../../shared/desktop-api";
import { useTranslation } from "react-i18next";
import { desktopProblemBankApi } from "../problemBankDesktop";
import { backendAuthToken, backendOrigin } from "../runtime";
import { fetchProblemSets, reindexProblemBank } from "./problemBankApi";

type LoadState = "loading" | "ready" | "error";

export function ProblemBankSettings() {
  const { t } = useTranslation();
  const [sets, setSets] = useState<ProblemSetSummary[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<ProblemImportResponse | null>(null);
  const [catalog, setCatalog] = useState<DesktopProblemBankCatalog | null>(null);
  const [downloadStates, setDownloadStates] = useState<Record<string, DesktopProblemBankDownloadState>>({});
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    setLoadState("loading");
    setError(null);
    try {
      const result = await fetchProblemSets(backendOrigin(), backendAuthToken(), { signal });
      if (signal?.aborted || version !== requestVersion.current) return false;
      setSets(result.sets);
      setLoadState("ready");
      return true;
    } catch (caughtError) {
      if (signal?.aborted || version !== requestVersion.current) return false;
      console.error("[ERROR] Failed to load the local problem bank", caughtError);
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      setLoadState("error");
      return false;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
      requestVersion.current += 1;
    };
  }, [load]);

  const loadCloudCatalog = useCallback(async () => {
    const api = desktopProblemBankApi();
    if (!api) return false;
    setCacheError(null);
    try {
      const [nextCatalog, nextDownloadStates] = await Promise.all([
        api.getProblemBankCatalog(),
        api.getProblemBankDownloadStates(),
      ]);
      setCatalog(nextCatalog);
      setDownloadStates(Object.fromEntries(nextDownloadStates.map((state) => [state.bankSlug, state])));
      return true;
    } catch (caughtError) {
      console.error("[ERROR] Failed to load the cloud problem-bank catalog", caughtError);
      setCacheError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      return false;
    }
  }, []);

  useEffect(() => {
    const api = desktopProblemBankApi();
    if (!api) return;
    let disposed = false;
    void loadCloudCatalog();
    const unsubscribeCache = api.onProblemBankCacheState((state) => {
      if (disposed) return;
      if (!state.activeReleaseId) {
        setCatalog(null);
        return;
      }
      void api.getProblemBankCatalog().then((nextCatalog) => {
        if (!disposed) setCatalog(nextCatalog);
      }).catch((caughtError) => {
        console.error("[ERROR] Failed to refresh the cloud problem-bank catalog", caughtError);
      });
    });
    const unsubscribeDownload = api.onProblemBankDownloadState((state) => {
      if (disposed) return;
      setDownloadStates((current) => ({ ...current, [state.bankSlug]: state }));
    });
    return () => {
      disposed = true;
      unsubscribeCache();
      unsubscribeDownload();
    };
  }, [loadCloudCatalog]);

  const reindex = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await reindexProblemBank(backendOrigin(), backendAuthToken());
      setLastImport(result);
      await load();
    } catch (caughtError) {
      console.error("[ERROR] Failed to reindex the local problem bank", caughtError);
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      setLoadState("error");
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const syncCloudCatalog = useCallback(async () => {
    const api = desktopProblemBankApi();
    if (!api) return;
    setCloudSyncing(true);
    setCacheError(null);
    try {
      await api.syncProblemBankMetadata();
      const nextCatalog = await api.getProblemBankCatalog();
      setCatalog(nextCatalog);
    } catch (caughtError) {
      console.error("[ERROR] Failed to sync the cloud problem-bank catalog", caughtError);
      setCacheError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setCloudSyncing(false);
    }
  }, []);

  const downloadBank = useCallback(async (bankSlug: string) => {
    const api = desktopProblemBankApi();
    if (!api) return;
    setCacheError(null);
    try {
      const next = await api.downloadProblemBank(bankSlug);
      setDownloadStates((current) => ({ ...current, [next.bankSlug]: next }));
    } catch (caughtError) {
      console.error(`[ERROR] Failed to download problem bank ${bankSlug}`, caughtError);
      setCacheError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }, []);

  const loading = loadState === "loading";
  const cloudSets = catalog?.banks ?? [];
  const totalSets = sets.length + cloudSets.length;
  const totalEntries = sets.reduce((total, set) => total + set.problemCount, 0)
    + cloudSets.reduce((total, set) => total + set.problemCount, 0);
  const busy = loading || syncing || cloudSyncing;

  return (
    <Box className="settings-page settings-problem-bank-page" aria-busy={busy}>
      <Box component="section" className="settings-problem-bank-card">
        <Box className="settings-problem-bank-header">
          <Stack className="settings-problem-bank-heading" direction="row" spacing={1.25}>
            <Box className="settings-problem-bank-mark" aria-hidden="true">
              <LibraryBooksOutlined fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 760 }}>
                {t("settings.problemBankTitle")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {loading
                  ? t("settings.problemBankLoading")
                  : t("settings.problemBankSummary", { sets: totalSets, entries: totalEntries })}
              </Typography>
            </Box>
          </Stack>

          <Stack className="settings-problem-bank-actions" direction="row" spacing={0.75}>
            <Tooltip title={t("settings.problemBankRefresh")} arrow>
              <span className="settings-tooltip-action">
                <IconButton
                  className="settings-icon-action"
                  size="small"
                  aria-label={t("settings.problemBankRefresh")}
                  disabled={busy}
                  onClick={() => void Promise.all([load(), loadCloudCatalog()])}
                >
                  {loading ? <CircularProgress size={16} /> : <RefreshRounded fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t("settings.problemBankSyncCloud")} arrow>
              <span className="settings-tooltip-action">
                <IconButton
                  className="settings-icon-action"
                  size="small"
                  aria-label={t("settings.problemBankSyncCloud")}
                  disabled={busy}
                  onClick={() => void syncCloudCatalog()}
                >
                  {cloudSyncing ? <CircularProgress size={16} /> : <CloudDownloadOutlined fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t("settings.problemBankReindex")} arrow>
              <span className="settings-tooltip-action">
                <IconButton
                  className="settings-icon-action"
                  size="small"
                  aria-label={t("settings.problemBankReindex")}
                  disabled={busy}
                  onClick={() => void reindex()}
                >
                  {syncing ? <CircularProgress size={16} /> : <SyncRounded fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Box>

        {cacheError ? (
          <Box className="settings-problem-bank-notice" role="status">
            <Typography variant="body2" color="error.main">{cacheError}</Typography>
          </Box>
        ) : null}

        {error ? (
          <Box className="settings-problem-bank-notice" role="status">
            <Typography variant="body2" color={sets.length ? "text.secondary" : "error.main"}>
              {error}
            </Typography>
          </Box>
        ) : lastImport?.message && !loading && totalSets === 0 ? (
          <Box className="settings-problem-bank-notice" role="status">
            <Typography variant="body2" color="text.secondary">
              {t("settings.problemBankDataMissing")}
            </Typography>
          </Box>
        ) : lastImport && !loading ? (
          <Box className="settings-problem-bank-notice" role="status">
            <Typography variant="body2" color="text.secondary">
              {lastImport.skipped
                ? t("settings.problemBankAlreadyIndexed", { count: lastImport.imported })
                : t("settings.problemBankIndexed", { count: lastImport.imported })}
            </Typography>
          </Box>
        ) : null}

        {!loading && totalSets === 0 ? (
          <Box className="settings-problem-bank-empty">
            <Typography variant="body2" sx={{ fontWeight: 650 }}>
              {t("settings.problemBankEmptyTitle")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("settings.problemBankEmptyDescription")}
            </Typography>
          </Box>
        ) : (
          <Box className="settings-problem-set-list">
            {cloudSets.map((set) => (
              <CloudProblemSetRow
                key={`${catalog?.releaseId}:${set.bankSlug}`}
                set={set}
                downloadState={downloadStates[set.bankSlug]?.releaseId === catalog?.releaseId
                  ? downloadStates[set.bankSlug]
                  : undefined}
                onDownload={downloadBank}
              />
            ))}
            {sets.map((set) => (
              <ProblemSetRow key={set.id} set={set} />
            ))}
          </Box>
        )}
      </Box>

    </Box>
  );
}

function formatCacheSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function ProblemSetRow({ set }: { set: ProblemSetSummary }) {
  const { t } = useTranslation();
  return (
    <Box className="settings-problem-set-row">
      <Box className="settings-problem-set-copy">
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Typography variant="body2" sx={{ fontWeight: 680 }} noWrap title={set.title}>
            {set.title}
          </Typography>
          <Typography component="span" className="settings-problem-set-kind" variant="caption">
            {t("settings.problemBankSources.local")}
          </Typography>
        </Stack>
        {set.description ? (
          <Typography variant="caption" color="text.secondary" noWrap title={set.description}>
            {set.description}
          </Typography>
        ) : null}
      </Box>
      <Typography className="settings-problem-set-count" variant="body2">
        {t("settings.problemBankProblemCount", { count: set.problemCount })}
      </Typography>
    </Box>
  );
}

function CloudProblemSetRow({
  set,
  downloadState,
  onDownload,
}: {
  set: DesktopProblemBankSummary;
  downloadState?: DesktopProblemBankDownloadState;
  onDownload: (bankSlug: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const description = set.description ?? set.datasetId ?? set.bankSlug;
  const downloading = downloadState?.status === "downloading";
  const complete = downloadState?.status === "complete";
  const canResume = downloadState?.status === "paused" || downloadState?.status === "error";
  const progress = downloadState?.totalBytes
    ? Math.min(100, Math.round((downloadState.downloadedBytes / downloadState.totalBytes) * 100))
    : 0;
  const actionLabel = complete
    ? t("settings.problemBankDownloaded")
    : canResume
      ? t("settings.problemBankResumeDownload")
      : t("settings.problemBankDownload");
  return (
    <Box className="settings-problem-set-row">
      <Box className="settings-problem-set-copy">
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 680 }} noWrap title={set.title}>
            {set.title}
          </Typography>
          <Typography component="span" className="settings-problem-set-kind" variant="caption">
            {t("settings.problemBankSources.cloud")}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap title={description}>
          {description}
        </Typography>
        {downloadState ? (
          <Typography className="settings-problem-set-download-status" variant="caption" color={downloadState.status === "error" ? "error.main" : "text.secondary"}>
            {downloading
              ? downloadState.totalBytes > 0
                ? t("settings.problemBankDownloading", {
                    progress,
                    downloaded: formatCacheSize(downloadState.downloadedBytes),
                    total: formatCacheSize(downloadState.totalBytes),
                  })
                : t("settings.problemBankPreparingDownload")
              : complete
                ? t("settings.problemBankDownloaded")
                : canResume
                  ? t("settings.problemBankDownloadPaused")
                  : null}
          </Typography>
        ) : null}
      </Box>
      <Stack className="settings-problem-set-actions" direction="row" spacing={1}>
        <Typography className="settings-problem-set-count" variant="body2">
          {t("settings.problemBankProblemCount", { count: set.problemCount })}
        </Typography>
        <Tooltip title={actionLabel} arrow>
          <span className="settings-tooltip-action">
            <IconButton
              className="settings-icon-action settings-problem-set-download"
              size="small"
              aria-label={actionLabel}
              disabled={downloading || complete}
              onClick={() => void onDownload(set.bankSlug)}
            >
              {downloading
                ? <CircularProgress size={18} variant={downloadState?.totalBytes ? "determinate" : "indeterminate"} value={progress} />
                : complete
                  ? <CheckCircleOutlineRounded fontSize="small" />
                  : canResume
                    ? <ReplayRounded fontSize="small" />
                    : <DownloadRounded fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  );
}
