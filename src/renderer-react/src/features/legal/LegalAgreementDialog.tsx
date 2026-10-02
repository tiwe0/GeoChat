import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import type { DialogProps } from "@mui/material";
import { useTranslation } from "react-i18next";
import { getLegalCopy, LEGAL_AGREEMENT_VERSION, LEGAL_DOCUMENT_UPDATED_AT } from "./legalDocuments";

const LEGAL_DIALOG_Z_INDEX = 1700;

export interface LegalAgreementDialogProps {
  open: boolean;
  mode: "consent" | "review";
  busy?: boolean;
  error?: string | null;
  onAccept?: () => void;
  onDecline?: () => void;
  onClose?: () => void;
}

type LegalDocumentTab = "privacy" | "terms";

export function LegalAgreementDialog({
  open,
  mode,
  busy = false,
  error = null,
  onAccept,
  onDecline,
  onClose,
}: LegalAgreementDialogProps) {
  const { i18n } = useTranslation();
  const copy = useMemo(
    () => getLegalCopy(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const [activeDocument, setActiveDocument] = useState<LegalDocumentTab>("privacy");
  const [acknowledged, setAcknowledged] = useState(false);
  const isConsent = mode === "consent";
  const sections = activeDocument === "privacy" ? copy.privacySections : copy.termsSections;
  const titleId = "geochat-legal-dialog-title";
  const descriptionId = "geochat-legal-dialog-description";
  const panelId = `geochat-legal-${activeDocument}-panel`;

  const handleClose: NonNullable<DialogProps["onClose"]> = (_event, reason) => {
    if (isConsent) return;
    if (reason === "escapeKeyDown" || reason === "backdropClick") onClose?.();
  };

  return (
    <Dialog
      open={open}
      fullWidth
      maxWidth="md"
      onClose={handleClose}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      sx={{ zIndex: LEGAL_DIALOG_Z_INDEX }}
      slotProps={{
        paper: {
          sx: {
            width: "min(880px, calc(100vw - 24px))",
            height: "min(760px, calc(100dvh - 24px))",
            maxHeight: "calc(100dvh - 24px)",
            m: 1.5,
            borderRadius: 2,
            overflow: "hidden",
          },
        },
      }}
    >
      <DialogTitle id={titleId} sx={{ flexShrink: 0, px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 2.5 }, pb: 1 }}>
        <Typography component="span" variant="h6">
          {isConsent ? copy.title : copy.settingsTitle}
        </Typography>
        <Typography
          id={descriptionId}
          component="p"
          variant="body2"
          color="text.secondary"
          sx={{ mt: 0.75, maxWidth: "72ch", lineHeight: 1.6 }}
        >
          {isConsent ? copy.intro : copy.settingsDescription}
        </Typography>
        <Typography component="p" variant="caption" color="text.secondary" sx={{ mt: 0.75 }}>
          {copy.updatedLabel}: {LEGAL_DOCUMENT_UPDATED_AT} · v{LEGAL_AGREEMENT_VERSION}
        </Typography>
      </DialogTitle>

      <Box sx={{ flexShrink: 0, px: { xs: 2, sm: 3 }, borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={activeDocument}
          onChange={(_event, value: LegalDocumentTab) => setActiveDocument(value)}
          aria-label={`${copy.privacyTitle} / ${copy.termsTitle}`}
          variant="fullWidth"
        >
          <Tab
            id="geochat-legal-privacy-tab"
            value="privacy"
            label={copy.privacyTitle}
            aria-controls="geochat-legal-privacy-panel"
          />
          <Tab
            id="geochat-legal-terms-tab"
            value="terms"
            label={copy.termsTitle}
            aria-controls="geochat-legal-terms-panel"
          />
        </Tabs>
      </Box>

      <DialogContent
        key={activeDocument}
        dividers={false}
        id={panelId}
        role="tabpanel"
        aria-labelledby={`geochat-legal-${activeDocument}-tab`}
        tabIndex={0}
        sx={{
          minHeight: 0,
          overflowY: "auto",
          px: { xs: 2, sm: 3 },
          py: 2.5,
          scrollPaddingTop: 20,
        }}
      >
        <Stack component="article" spacing={3} sx={{ maxWidth: "72ch", mx: "auto" }}>
          {sections.map((section: { id: string; title: string; paragraphs: readonly string[] }) => (
            <Box component="section" key={section.id} aria-labelledby={`legal-section-${section.id}`}>
              <Typography id={`legal-section-${section.id}`} component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>
                {section.title}
              </Typography>
              <Stack spacing={1.25} sx={{ mt: 1 }}>
                {section.paragraphs.map((paragraph: string, index: number) => (
                  <Typography key={`${section.id}-${index}`} component="p" variant="body2" sx={{ lineHeight: 1.75 }}>
                    {paragraph}
                  </Typography>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </DialogContent>

      <Box sx={{ flexShrink: 0, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        {error ? (
          <Alert severity="error" role="alert" sx={{ mx: { xs: 2, sm: 3 }, mt: 2 }}>
            {error}
          </Alert>
        ) : null}

        {isConsent ? (
          <DialogActions
            sx={{
              px: { xs: 2, sm: 3 },
              py: 2,
              alignItems: { xs: "stretch", sm: "center" },
              flexDirection: { xs: "column", sm: "row" },
            }}
          >
            <FormControlLabel
              control={(
                <Checkbox
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  disabled={busy}
                />
              )}
              label={copy.acknowledgment}
              sx={{ flex: 1, alignItems: "flex-start", mr: { sm: 2 }, "& .MuiFormControlLabel-label": { pt: 0.75 } }}
            />
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              <Button color="inherit" disabled={busy} onClick={onDecline}>
                {copy.declineLabel}
              </Button>
              <Button
                variant="contained"
                disabled={!acknowledged || busy}
                onClick={onAccept}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                aria-busy={busy || undefined}
              >
                {busy ? copy.savingLabel : copy.acceptLabel}
              </Button>
            </Stack>
          </DialogActions>
        ) : (
          <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
            <Button variant="contained" onClick={onClose}>
              {copy.closeLabel}
            </Button>
          </DialogActions>
        )}
      </Box>
    </Dialog>
  );
}
