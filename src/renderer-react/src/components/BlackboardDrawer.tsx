import CloseRounded from "@mui/icons-material/CloseRounded";
import FactCheckRounded from "@mui/icons-material/FactCheckRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import {
  Alert,
  Box,
  Drawer,
  IconButton,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";
import {
  BLACKBOARD_CATEGORIES,
  type BlackboardCategory,
  type BlackboardEntry,
  type BlackboardEntryStatus,
} from "@geochat-ai/app/blackboard";
import { STREAMDOWN_PLUGINS } from "../features/chat/streamdownPlugins";
import { useStreamdownTranslations } from "../i18n/useStreamdownTranslations";

type BlackboardDrawerProps = {
  open: boolean;
  signedIn: boolean;
  conversationId: string | null;
  loading: boolean;
  error: string | null;
  entries: BlackboardEntry[];
  onClose: () => void;
  onRefresh: () => void;
};

export function BlackboardDrawer({
  open,
  signedIn,
  conversationId,
  loading,
  error,
  entries,
  onClose,
  onRefresh,
}: BlackboardDrawerProps) {
  const { t, i18n } = useTranslation();
  const streamdownTranslations = useStreamdownTranslations();
  const [status, setStatus] = useState<BlackboardEntryStatus>("active");
  const activeCount = entries.filter((entry) => entry.status === "active").length;
  const archivedCount = entries.length - activeCount;
  const groups = useMemo(() => groupEntries(entries, status), [entries, status]);
  const chalkFont = '"Chalkboard SE", "Segoe Print", "Bradley Hand", "Kaiti SC", STKaiti, KaiTi, cursive';
  const chalk = "#f4f1df";
  const mutedChalk = "rgba(244, 241, 223, 0.74)";
  const chalkLine = "rgba(244, 241, 223, 0.2)";

  useEffect(() => setStatus("active"), [conversationId]);

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      variant="temporary"
      ModalProps={{ keepMounted: true, disablePortal: true }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      slotProps={{
        backdrop: { sx: { position: "absolute", bgcolor: "rgba(15, 23, 42, 0.22)" } },
        paper: {
          id: "copilot-blackboard-drawer",
          role: "complementary",
          "aria-label": t("blackboard.title"),
          className: "geochatpro-blackboard",
          sx: {
            position: "absolute",
            width: "min(380px, calc(100% - 72px))",
            maxWidth: "100%",
            borderRight: 1,
            borderColor: "#092920",
            boxShadow: 6,
            bgcolor: "#173f35",
            color: chalk,
          },
        },
      }}
      sx={{
        position: "absolute",
        inset: 0,
        zIndex: 4,
        "& .MuiDrawer-paper": { position: "absolute" },
        "& .MuiModal-backdrop": { position: "absolute" },
        "& .blackboard-markdown": {
          color: chalk,
          fontFamily: chalkFont,
          fontSize: 17,
          lineHeight: 1.7,
        },
        "& .blackboard-markdown :is(h1, h2, h3, h4)": {
          color: chalk,
          fontFamily: chalkFont,
          fontWeight: 700,
        },
        "& .blackboard-markdown :is(a, blockquote)": { color: "#d8e9cf" },
        "& .blackboard-markdown .katex": { color: chalk },
        "& .blackboard-markdown :not(pre) > code": {
          color: "#f7e7a8",
          bgcolor: "rgba(4, 24, 18, 0.34)",
        },
        "& .blackboard-markdown [data-streamdown='code-block']": {
          borderColor: chalkLine,
          background: "rgba(4, 24, 18, 0.34)",
        },
        "& .blackboard-markdown [data-streamdown='code-block-header']": { color: mutedChalk },
        "& .blackboard-markdown [data-streamdown='code-block-body']": {
          borderColor: chalkLine,
          background: "rgba(4, 24, 18, 0.28)",
        },
        "& .blackboard-markdown [data-streamdown='code-block-body'] pre": { color: chalk },
        "& .blackboard-markdown [data-streamdown='code-block-actions'] button": { color: mutedChalk },
        "& .blackboard-markdown [data-streamdown='code-block-actions'] button:hover": {
          color: chalk,
          background: "rgba(244, 241, 223, 0.1)",
        },
      }}
    >
      <Stack sx={{ height: "100%", minHeight: 0 }}>
        <Stack
          component="header"
          direction="row"
          spacing={1}
          sx={{ minHeight: 56, px: 1.5, alignItems: "center", borderBottom: 1, borderColor: chalkLine, bgcolor: "#12362e" }}
        >
          <FactCheckRounded sx={{ fontSize: 20, color: "#f7e7a8" }} />
          <Typography variant="subtitle2" sx={{ minWidth: 0, flex: 1, fontFamily: chalkFont, fontSize: 17, fontWeight: 700 }}>
            {t("blackboard.title")}
          </Typography>
          <IconButton
            type="button"
            disabled={loading || !conversationId}
            onClick={onRefresh}
            aria-label={t("blackboard.refresh")}
            title={t("blackboard.refresh")}
            sx={{
              width: 40,
              height: 40,
              color: "#ffffff",
              "&.Mui-disabled": { color: "rgba(255, 255, 255, 0.52)" },
              "&:hover": { bgcolor: "rgba(244, 241, 223, 0.1)" },
            }}
          >
            <RefreshRounded fontSize="small" sx={{ animation: loading ? "copilot-spin 900ms linear infinite" : "none" }} />
          </IconButton>
          <IconButton
            type="button"
            onClick={onClose}
            aria-label={t("blackboard.close")}
            title={t("blackboard.close")}
            sx={{ width: 40, height: 40, color: chalk, "&:hover": { bgcolor: "rgba(244, 241, 223, 0.1)" } }}
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        </Stack>

        <Tabs
          value={status}
          onChange={(_event, value: BlackboardEntryStatus) => setStatus(value)}
          variant="fullWidth"
          aria-label={t("blackboard.views")}
          sx={{
            minHeight: 40,
            borderBottom: 1,
            borderColor: chalkLine,
            "& .MuiTabs-indicator": { bgcolor: "#f7e7a8", height: 2 },
            "& .MuiTab-root": { minHeight: 40, py: 0.5, color: mutedChalk, fontFamily: chalkFont, fontSize: 15 },
            "& .MuiTab-root.Mui-selected": { color: chalk },
          }}
        >
          <Tab value="active" label={t("blackboard.current", { count: activeCount })} />
          <Tab value="archived" label={t("blackboard.archived", { count: archivedCount })} />
        </Tabs>

        <Box sx={{ minHeight: 0, flex: 1, overflowY: "auto", px: 1.5, py: 2 }}>
          {loading && entries.length === 0 ? (
            <Stack spacing={2} aria-label={t("blackboard.loading")}>
              {Array.from({ length: 3 }, (_, index) => (
                <Stack key={index} spacing={1}>
                  <Skeleton width="34%" height={18} sx={{ bgcolor: "rgba(244, 241, 223, 0.16)" }} />
                  <Skeleton variant="rounded" height={54} sx={{ bgcolor: "rgba(244, 241, 223, 0.12)" }} />
                </Stack>
              ))}
            </Stack>
          ) : error ? (
            <Alert severity="error" sx={{ bgcolor: "rgba(255, 244, 242, 0.94)" }}>{error}</Alert>
          ) : !signedIn ? (
            <Typography variant="body2" sx={{ py: 1, color: mutedChalk, fontFamily: chalkFont, fontSize: 16 }}>
              {t("blackboard.signInRequired")}
            </Typography>
          ) : !conversationId ? (
            <Typography variant="body2" sx={{ py: 1, color: mutedChalk, fontFamily: chalkFont, fontSize: 16 }}>
              {t("blackboard.emptyNoConversation")}
            </Typography>
          ) : groups.length === 0 ? (
            <Typography variant="body2" sx={{ py: 1, color: mutedChalk, fontFamily: chalkFont, fontSize: 16 }}>
              {t(status === "active" ? "blackboard.emptyCurrent" : "blackboard.emptyArchived")}
            </Typography>
          ) : (
            <Stack spacing={2}>
              {groups.map((group) => (
                <Box component="section" key={group.category} aria-labelledby={`blackboard-${group.category}`}>
                  <Typography
                    id={`blackboard-${group.category}`}
                    variant="caption"
                    sx={{ display: "block", mb: 0.5, color: "#f7e7a8", fontFamily: chalkFont, fontSize: 14, fontWeight: 700, letterSpacing: 0 }}
                  >
                    {t(`blackboard.categories.${group.category}`)}
                  </Typography>
                  <Box sx={{ borderTop: 1, borderColor: chalkLine }}>
                    {group.entries.map((entry) => (
                      <Box key={entry.id} sx={{ py: 1.5, borderBottom: 1, borderColor: chalkLine }}>
                        <Streamdown
                          className="copilot-markdown blackboard-markdown"
                          plugins={STREAMDOWN_PLUGINS}
                          translations={streamdownTranslations}
                        >
                          {entry.value}
                        </Streamdown>
                        {entry.reason && (
                          <Typography
                            variant="caption"
                            sx={{ display: "block", mt: 1, color: mutedChalk, fontFamily: chalkFont, fontSize: 14, lineHeight: 1.55, letterSpacing: 0, overflowWrap: "anywhere" }}
                          >
                            <Box component="span" sx={{ fontWeight: 600 }}>{t("blackboard.reason")}: </Box>
                            {entry.reason}
                          </Typography>
                        )}
                        <Stack direction="row" sx={{ mt: 0.5, flexWrap: "wrap", columnGap: 1, rowGap: 0.25 }}>
                          <Typography variant="caption" sx={{ color: mutedChalk, fontFamily: chalkFont, fontWeight: 600, letterSpacing: 0 }}>
                            {t("blackboard.confidence", { value: Math.round(entry.confidence * 100) })}
                          </Typography>
                          <Typography variant="caption" sx={{ color: mutedChalk, fontFamily: chalkFont, letterSpacing: 0, fontVariantNumeric: "tabular-nums" }}>
                            {t("blackboard.updated", { value: formatUpdatedAt(entry.updatedAt, i18n.language) })}
                          </Typography>
                        </Stack>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Drawer>
  );
}

function groupEntries(entries: BlackboardEntry[], status: BlackboardEntryStatus) {
  return BLACKBOARD_CATEGORIES.flatMap((category) => {
    const categoryEntries = entries.filter((entry) => entry.status === status && entry.category === category);
    return categoryEntries.length ? [{ category, entries: categoryEntries }] : [];
  }) satisfies Array<{ category: BlackboardCategory; entries: BlackboardEntry[] }>;
}

function formatUpdatedAt(value: string, locale: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
