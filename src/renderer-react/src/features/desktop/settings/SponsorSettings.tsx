import VolunteerActivismOutlined from "@mui/icons-material/VolunteerActivismOutlined";
import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

export function SponsorSettings() {
  const { t } = useTranslation();

  return (
    <Box className="settings-page settings-sponsor-page">
      <Box className="settings-sponsor-placeholder">
        <Box className="settings-sponsor-mark" aria-hidden="true">
          <VolunteerActivismOutlined />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {t("settings.sponsorPlaceholder")}
        </Typography>
      </Box>
    </Box>
  );
}
