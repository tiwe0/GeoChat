import CropSquareRounded from "@mui/icons-material/CropSquareRounded";
import HubRounded from "@mui/icons-material/HubRounded";
import { Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { InteractionMode } from "../../../../shared/desktop/workbench-types";
import { useInteractionMode } from "./useInteractionMode";

export function InteractionModeSettings() {
  const { t } = useTranslation();
  const interaction = useInteractionMode();

  return (
    <Stack spacing={0.75}>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={interaction.mode}
        onChange={(_event, value: InteractionMode | null) => { if (value) interaction.setMode(value); }}
        aria-label={t("settings.interactionMode")}
      >
        <ToggleButton value="window" sx={{ gap: 0.75, textTransform: "none" }}>
          <CropSquareRounded fontSize="small" />
          {t("settings.interactionWindow")}
        </ToggleButton>
        <ToggleButton value="fusion" sx={{ gap: 0.75, textTransform: "none" }}>
          <HubRounded fontSize="small" />
          {t("settings.interactionFusion")}
        </ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="caption" color="text.secondary">
        {interaction.mode === "fusion" ? t("settings.interactionFusionSummary") : t("settings.interactionWindowSummary")}
      </Typography>
    </Stack>
  );
}
