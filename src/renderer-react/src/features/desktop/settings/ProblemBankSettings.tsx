import { useCallback, useEffect, useRef, useState } from "react";
import LibraryBooksOutlined from "@mui/icons-material/LibraryBooksOutlined";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SyncRounded from "@mui/icons-material/SyncRounded";
import { Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ProblemImportResponse, ProblemSetSummary } from "@geochat-ai/app";
import { useTranslation } from "react-i18next";
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

  const loading = loadState === "loading";
  const totalEntries = sets.reduce((total, set) => total + set.problemCount, 0);

  return (
    <Box className="settings-page settings-problem-bank-page" aria-busy={loading || syncing}>
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
                  : t("settings.problemBankSummary", { sets: sets.length, entries: totalEntries })}
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
                  disabled={loading || syncing}
                  onClick={() => void load()}
                >
                  {loading ? <CircularProgress size={16} /> : <RefreshRounded fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t("settings.problemBankReindex")} arrow>
              <span className="settings-tooltip-action">
                <IconButton
                  className="settings-icon-action"
                  size="small"
                  aria-label={t("settings.problemBankReindex")}
                  disabled={loading || syncing}
                  onClick={() => void reindex()}
                >
                  {syncing ? <CircularProgress size={16} /> : <SyncRounded fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Box>

        {error ? (
          <Box className="settings-problem-bank-notice" role="status">
            <Typography variant="body2" color={sets.length ? "text.secondary" : "error.main"}>
              {error}
            </Typography>
          </Box>
        ) : lastImport?.message && !loading ? (
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

        {!loading && sets.length === 0 ? (
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
            {sets.map((set) => (
              <ProblemSetRow key={set.id} set={set} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
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
            {t(`settings.problemBankKinds.${set.kind}`)}
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
