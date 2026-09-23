import { useCallback, useEffect, useMemo, useState } from "react";
import DeleteSweepOutlined from "@mui/icons-material/DeleteSweepOutlined";
import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import type { DesktopProblemBankCacheState, DesktopProblemBankDownloadState } from "../../../../../shared/desktop-api";
import { desktopProblemBankApi } from "../problemBankDesktop";
import { SettingsSection } from "./SettingsSection";

export function ProblemBankCacheSettings() {
  const { t } = useTranslation();
  const [cacheState, setCacheState] = useState<DesktopProblemBankCacheState | null>(null);
  const [downloadStates, setDownloadStates] = useState<Record<string, DesktopProblemBankDownloadState>>({});
  const [action, setAction] = useState<"opening" | "clearing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  useEffect(() => {
    const api = desktopProblemBankApi();
    if (!api) return;
    let disposed = false;

    void Promise.all([
      api.getProblemBankCacheState(),
      api.getProblemBankDownloadStates(),
    ]).then(([nextCacheState, nextDownloadStates]) => {
      if (disposed) return;
      setCacheState(nextCacheState);
      setDownloadStates(Object.fromEntries(nextDownloadStates.map((state) => [state.bankSlug, state])));
    }).catch((caughtError) => {
      if (disposed) return;
      console.error("[ERROR] Failed to load problem-bank cache settings", caughtError);
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    });

    const unsubscribeCache = api.onProblemBankCacheState((state) => {
      if (!disposed) setCacheState(state);
    });
    const unsubscribeDownload = api.onProblemBankDownloadState((state) => {
      if (!disposed) {
        setDownloadStates((current) => ({ ...current, [state.bankSlug]: state }));
      }
    });
    return () => {
      disposed = true;
      unsubscribeCache();
      unsubscribeDownload();
    };
  }, []);

  const downloadInProgress = useMemo(
    () => Object.values(downloadStates).some((state) => state.status === "downloading"),
    [downloadStates],
  );

  const openCacheDirectory = useCallback(async () => {
    const api = desktopProblemBankApi();
    if (!api) return;
    setAction("opening");
    setError(null);
    try {
      await api.openProblemBankCacheDirectory();
    } catch (caughtError) {
      console.error("[ERROR] Failed to open the problem bank cache directory", caughtError);
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setAction(null);
    }
  }, []);

  const clearCache = useCallback(async () => {
    const api = desktopProblemBankApi();
    if (!api) return;
    setAction("clearing");
    setError(null);
    try {
      const next = await api.clearProblemBankCache();
      setCacheState(next);
      setDownloadStates({});
      setClearDialogOpen(false);
    } catch (caughtError) {
      console.error("[ERROR] Failed to clear the problem bank cache", caughtError);
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setAction(null);
    }
  }, []);

  const cachedBytes = cacheState?.cachedBytes ?? 0;

  return (
    <>
      <SettingsSection
        title={t("settings.problemBankCacheTitle")}
        description={t("settings.problemBankCacheDescription")}
      >
        <Stack className="settings-problem-bank-cache-control" spacing={0.75}>
          <Stack className="settings-problem-bank-cache-summary" direction="row" spacing={1.25}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {cacheState
                ? cachedBytes > 0
                  ? t("settings.problemBankCacheSize", { size: formatCacheSize(cachedBytes) })
                  : t("settings.problemBankCacheEmpty")
                : t("settings.problemBankLoading")}
            </Typography>
            <Stack className="settings-problem-bank-cache-actions" direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={action === "opening" ? <CircularProgress size={15} /> : <FolderOpenOutlined />}
                disabled={action !== null || !cacheState}
                onClick={() => void openCacheDirectory()}
              >
                {t("settings.problemBankOpenCacheDirectory")}
              </Button>
              <Button
                size="small"
                color="error"
                variant="text"
                startIcon={action === "clearing" ? <CircularProgress size={15} /> : <DeleteSweepOutlined />}
                disabled={action !== null || cachedBytes === 0 || downloadInProgress}
                onClick={() => setClearDialogOpen(true)}
              >
                {t("settings.problemBankClearCache")}
              </Button>
            </Stack>
          </Stack>
          {cacheState ? (
            <Typography variant="caption" color="text.secondary" noWrap title={cacheState.cacheDirectory}>
              {cacheState.cacheDirectory}
            </Typography>
          ) : null}
          {error ? <Typography variant="caption" color="error.main">{error}</Typography> : null}
        </Stack>
      </SettingsSection>

      <Dialog open={clearDialogOpen} onClose={() => action === null && setClearDialogOpen(false)}>
        <DialogTitle>{t("settings.problemBankClearCacheTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t("settings.problemBankClearCacheDescription")}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={action !== null} onClick={() => setClearDialogOpen(false)}>
            {t("settings.problemBankClearCacheCancel")}
          </Button>
          <Button color="error" variant="contained" disabled={action !== null} onClick={() => void clearCache()}>
            {action === "clearing" ? t("settings.problemBankClearingCache") : t("settings.problemBankClearCacheConfirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
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
