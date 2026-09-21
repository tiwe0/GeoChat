import { useEffect, useLayoutEffect, useRef, useState } from "react";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import TuneRounded from "@mui/icons-material/TuneRounded";
import { Box, Stack, Tab, Tabs } from "@mui/material";
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
 * implementation structure. These sections instead represent user-facing
 * concerns: model setup, app behaviour, and project info.
 */
const TABS = ["model", "general", "about"] as const;
type SettingsTab = (typeof TABS)[number];

export function SettingsPanel(props: { mcp: McpController; onRestartTour: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SettingsTab>("model");
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [verticalNavigation, setVerticalNavigation] = useState(true);
  const tabIcons = {
    model: <TuneRounded fontSize="small" />,
    general: <SettingsOutlined fontSize="small" />,
    about: <InfoOutlined fontSize="small" />,
  } as const;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const updateNavigation = (width: number) => setVerticalNavigation(width >= 560);
    updateNavigation(root.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) updateNavigation(entry.contentRect.width);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <Stack ref={rootRef} className="geochat-settings" sx={{ flex: 1, minHeight: 0 }}>
      <Box className={`settings-layout${verticalNavigation ? "" : " settings-layout--compact"}`}>
        <Tabs
          className="settings-navigation"
          value={tab}
          onChange={(_event, next: SettingsTab) => setTab(next)}
          orientation={verticalNavigation ? "vertical" : "horizontal"}
          variant={verticalNavigation ? "standard" : "fullWidth"}
          scrollButtons={false}
          aria-label={t("settings.navigationLabel")}
        >
          {TABS.map((value) => (
            <Tab
              key={value}
              id={`settings-tab-${value}`}
              aria-controls={`settings-panel-${value}`}
              value={value}
              icon={tabIcons[value]}
              iconPosition="start"
              label={t(`settings.tabs.${value}`)}
              title={t(`settings.tabDescriptions.${value}`)}
            />
          ))}
        </Tabs>

        <Box
          ref={contentRef}
          className={`settings-content${tab === "model" ? " settings-content--model" : ""}`}
        >
          <Box
            id="settings-panel-model"
            className="settings-tab-panel"
            role="tabpanel"
            aria-labelledby="settings-tab-model"
            hidden={tab !== "model"}
          >
            <ModelSettings />
          </Box>
          <Box
            id="settings-panel-general"
            className="settings-tab-panel"
            role="tabpanel"
            aria-labelledby="settings-tab-general"
            hidden={tab !== "general"}
          >
            <GeneralSettings mcp={props.mcp} onRestartTour={props.onRestartTour} />
          </Box>
          <Box
            id="settings-panel-about"
            className="settings-tab-panel"
            role="tabpanel"
            aria-labelledby="settings-tab-about"
            hidden={tab !== "about"}
          >
            <AboutSettings />
          </Box>
        </Box>
      </Box>
    </Stack>
  );
}
