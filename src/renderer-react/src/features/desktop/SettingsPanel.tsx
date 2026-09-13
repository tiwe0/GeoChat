import { useState } from "react";
import { Box, Button, Stack, Tab, Tabs } from "@mui/material";
import { useTranslation } from "react-i18next";
import { ModelSettings } from "./settings/ModelSettings";
import { GeneralSettings } from "./settings/GeneralSettings";
import { AboutSettings } from "./settings/AboutSettings";
import type { McpController } from "./useMcpState";

/**
 * Desktop settings.
 *
 * A UX audit of the SolidJS renderer found its eight-tab settings dialog to be
 * the worst surface in the app: two tabs empty, a 4278px skills page whose own
 * copy said to leave it alone, and three red capability failures shown above
 * the field that fixes them.
 *
 * The lesson there was not "no tabs". It was that those tabs were grouped by
 * implementation structure, and several had nothing behind them. These three
 * are grouped by the decision a reader came to make — which model, how the
 * installation behaves, and who made it — and each has real content.
 */
const TABS = ["model", "general", "about"] as const;
type SettingsTab = (typeof TABS)[number];

export function SettingsPanel(props: { mcp: McpController; onClose: () => void; onRestartTour: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SettingsTab>("model");

  return (
    <Stack className="geochatpro-settings" sx={{ flex: 1, minHeight: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tab}
          onChange={(_event, next: SettingsTab) => setTab(next)}
          variant="scrollable"
          scrollButtons={false}
          sx={{ flex: 1, minHeight: 40, "& .MuiTab-root": { minHeight: 40, py: 0, fontSize: 13, textTransform: "none" } }}
        >
          {TABS.map((value) => (
            <Tab key={value} value={value} label={t(`settings.tabs.${value}`)} />
          ))}
        </Tabs>
        <Button size="small" onClick={props.onClose} sx={{ flex: "0 0 auto" }}>
          {t("settings.back")}
        </Button>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          p: 2.5,
        }}
      >
        {tab === "model" && <ModelSettings />}
        {tab === "general" && <GeneralSettings mcp={props.mcp} onRestartTour={props.onRestartTour} />}
        {tab === "about" && <AboutSettings />}
      </Box>
    </Stack>
  );
}
