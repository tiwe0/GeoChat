import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import PrivacyTipRounded from "@mui/icons-material/PrivacyTipRounded";
import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

type PrivacyPolicyPageProps = {
  onBack: () => void;
};

export function PrivacyPolicyPage({ onBack }: PrivacyPolicyPageProps) {
  const { t } = useTranslation();
  const sections = [
    [t("privacy.dataTitle"), t("privacy.dataBody")],
    [t("privacy.usageTitle"), t("privacy.usageBody")],
    [t("privacy.storageTitle"), t("privacy.storageBody")],
    [t("privacy.providersTitle"), t("privacy.providersBody")],
    [t("privacy.affiliationTitle"), t("privacy.affiliationBody")],
    [t("privacy.rightsTitle"), t("privacy.rightsBody")],
    [t("privacy.termsTitle"), t("privacy.termsBody")],
  ];

  return (
    <Stack sx={{ minHeight: 0, flex: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 1, py: 1 }}>
        <Button
          type="button"
          size="small"
          color="inherit"
          startIcon={<ArrowBackRounded fontSize="small" />}
          onClick={onBack}
          sx={{ minWidth: 0, whiteSpace: "nowrap" }}
        >
          {t("privacy.back")}
        </Button>
        <Typography variant="h6" sx={{ minWidth: 0, flex: 1, fontWeight: 700 }} noWrap>
          {t("privacy.title")}
        </Typography>
        <PrivacyTipRounded color="primary" fontSize="small" />
      </Stack>
      <Divider />
      <Box sx={{ minHeight: 0, flex: 1, overflowY: "auto", px: 2, py: 1.75 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t("privacy.intro")}
        </Typography>
        <Stack spacing={1.5}>
          {sections.map(([heading, body]) => (
            <Box key={heading}>
              <Typography variant="subtitle2" sx={{ mb: 0.35, fontWeight: 800 }}>
                {heading}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                {body}
              </Typography>
            </Box>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
          {t("privacy.contact")}
        </Typography>
      </Box>
    </Stack>
  );
}
