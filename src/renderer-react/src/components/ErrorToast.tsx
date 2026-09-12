import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import {
  Alert,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type ErrorToastProps = {
  message: string | null | undefined;
};

/** A single, copyable diagnostic surface for renderer and backend failures. */
export function ErrorToast({ message }: ErrorToastProps) {
  const { t } = useTranslation();
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const visible = Boolean(message && message !== dismissedMessage);

  useEffect(() => {
    setDismissedMessage(null);
    setCopied(false);
  }, [message]);

  async function copyError() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access is permission-controlled; the error remains visible.
    }
  }

  return (
    <Snackbar
      open={visible}
      autoHideDuration={12000}
      onClose={() => setDismissedMessage(message ?? null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      sx={{ zIndex: (theme) => theme.zIndex.snackbar + 1 }}
    >
      <Alert
        severity="error"
        variant="filled"
        onClose={() => setDismissedMessage(message ?? null)}
        action={(
          <Tooltip title={copied ? t("common.copied") : t("common.copyError")}>
            <IconButton
              color="inherit"
              size="small"
              aria-label={copied ? t("common.copied") : t("common.copyError")}
              onClick={() => void copyError()}
            >
              <ContentCopyRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        sx={{
          alignItems: "flex-start",
          maxWidth: "min(680px, calc(100vw - 32px))",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ fontWeight: 800 }}>
            {t("common.error")}
          </Typography>
          <Typography variant="body2" component="div" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {message}
          </Typography>
        </Stack>
      </Alert>
    </Snackbar>
  );
}
