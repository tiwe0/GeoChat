import {
  Alert,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Drawer,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import ChatBubbleOutlineRounded from "@mui/icons-material/ChatBubbleOutlineRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export type ConversationSummary = {
  id: string;
  model: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

type ConversationDrawerProps = {
  open: boolean;
  interactionDisabled: boolean;
  loading: boolean;
  selectingId: string | null;
  deletingId: string | null;
  error: string | null;
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  onClose: () => void;
  onSelect: (conversation: ConversationSummary) => void;
  onDelete: (conversation: ConversationSummary) => Promise<boolean>;
};

export function ConversationDrawer({
  open,
  interactionDisabled,
  loading,
  selectingId,
  deletingId,
  error,
  conversations,
  currentConversationId,
  onClose,
  onSelect,
  onDelete,
}: ConversationDrawerProps) {
  const { t } = useTranslation();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const busy = interactionDisabled || selectingId !== null || deletingId !== null;
  function closeDrawer() {
    setConfirmingId(null);
    onClose();
  }

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={closeDrawer}
      variant="temporary"
      ModalProps={{ keepMounted: true, disablePortal: true }}
      slotProps={{
        backdrop: { sx: { position: "absolute", bgcolor: "rgba(15, 23, 42, 0.22)" } },
        paper: {
          "aria-label": t("history.title"),
          sx: {
            position: "absolute",
            // Let conversation titles determine the drawer width while keeping
            // long titles readable without allowing the panel to take over.
            width: "fit-content",
            minWidth: 220,
            maxWidth: "min(480px, calc(100% - 40px))",
            borderRight: 1,
            borderColor: "divider",
            boxShadow: 6,
            bgcolor: "background.paper",
            overflowX: "hidden",
          },
        },
      }}
      sx={{
        position: "absolute",
        inset: 0,
        zIndex: 4,
        "& .MuiDrawer-paper": { position: "absolute" },
        "& .MuiModal-backdrop": { position: "absolute" },
      }}
    >
      <Stack sx={{ height: "100%", minHeight: 0 }}>
        <Stack
          direction="row"
          sx={{ minHeight: 56, px: 1.25, alignItems: "center", borderBottom: 1, borderColor: "divider" }}
        >
          <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 800 }}>
            {t("history.title")}
          </Typography>
          <IconButton type="button" size="small" onClick={closeDrawer} aria-label={t("history.close")} title={t("history.close")}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </Stack>

        <Box
          sx={{
            minHeight: 0,
            flex: 1,
            overflowY: "auto",
            px: 1,
            pb: 1,
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {loading ? (
            <Stack spacing={0.75} aria-label={t("history.loading")}>
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} variant="rounded" height={42} animation="wave" />
              ))}
            </Stack>
          ) : conversations.length === 0 ? (
            error ? (
              <Alert severity="error" sx={{ mt: 0.5 }}>{error}</Alert>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2 }}>
                {t("history.empty")}
              </Typography>
            )
          ) : (
            <Stack spacing={0.25}>
              {error && <Alert severity="error" sx={{ mb: 0.5 }}>{error}</Alert>}
              {conversations.map((conversation) => {
                const selected = conversation.id === currentConversationId;
                const confirming = conversation.id === confirmingId;
                const deleting = conversation.id === deletingId;
                if (confirming) {
                  return (
                    <Stack
                      key={conversation.id}
                      spacing={0.5}
                      sx={{ minHeight: 64, px: 1, py: 0.75, justifyContent: "center", borderRadius: 1, bgcolor: "action.hover" }}
                    >
                      <Typography variant="caption" color="text.primary" sx={{ fontWeight: 700 }}>
                        {t("history.confirmDelete")}
                      </Typography>
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                        <Button
                          type="button"
                          size="small"
                          color="inherit"
                          disabled={deleting}
                          onClick={() => setConfirmingId(null)}
                        >
                          {t("history.cancelDelete")}
                        </Button>
                        <Button
                          type="button"
                          size="small"
                          color="error"
                          disabled={deleting}
                          startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlineRounded fontSize="small" />}
                          onClick={async () => {
                            if (await onDelete(conversation)) setConfirmingId(null);
                          }}
                        >
                          {deleting ? t("history.deleting") : t("history.delete")}
                        </Button>
                      </Stack>
                    </Stack>
                  );
                }
                return (
                  <Box
                    key={conversation.id}
                    sx={{
                      width: "100%",
                      minHeight: 42,
                      display: "flex",
                      alignItems: "center",
                      position: "relative",
                      borderRadius: 1,
                      bgcolor: selected ? "action.selected" : "transparent",
                      color: selected ? "primary.main" : "text.primary",
                      borderLeft: 3,
                      borderColor: selected ? "primary.main" : "transparent",
                      "&:hover": { bgcolor: selected ? "action.selected" : "action.hover" },
                    }}
                  >
                    <ButtonBase
                      component="button"
                      type="button"
                      disabled={busy}
                      onClick={() => onSelect(conversation)}
                      aria-current={selected ? "page" : undefined}
                      sx={{
                        minWidth: 0,
                        minHeight: 42,
                        flex: 1,
                        px: 1,
                        py: 0.75,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        gap: 1,
                        borderRadius: 1,
                        color: "inherit",
                        textAlign: "left",
                        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
                      }}
                    >
                      <ChatBubbleOutlineRounded sx={{ flex: "0 0 auto", fontSize: 17 }} />
                      <Typography variant="body2" noWrap sx={{ minWidth: 0, flex: 1, fontWeight: selected ? 700 : 500 }}>
                        {conversation.title || t("history.untitled")}
                      </Typography>
                    </ButtonBase>
                    <IconButton
                      type="button"
                      size="small"
                      color="error"
                      disabled={busy}
                      onClick={() => setConfirmingId(conversation.id)}
                      aria-label={t("history.deleteConversation", { title: conversation.title || t("history.untitled") })}
                      title={t("history.deleteConversation", { title: conversation.title || t("history.untitled") })}
                      sx={{ flex: "0 0 auto", mr: 0.25 }}
                    >
                      <DeleteOutlineRounded sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>
      </Stack>
    </Drawer>
  );
}
