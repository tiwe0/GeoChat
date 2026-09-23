import { useCallback, useEffect, useMemo, useState } from "react";
import AutoAwesomeOutlined from "@mui/icons-material/AutoAwesomeOutlined";
import ExtensionOutlined from "@mui/icons-material/ExtensionOutlined";
import SearchRounded from "@mui/icons-material/SearchRounded";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_BUSINESS_AGENT_SKILL_NAMES,
  DESKTOP_CONFIG_CHANGED_EVENT,
  VISUAL_PROFILE_NAMES,
  normalizeSkillConfig,
  persistDesktopConfig,
  readDesktopConfig,
} from "../../../../../shared/desktop/desktop-config";
import type { DesktopAgentSkillSummary } from "../../../../../shared/skill-catalog";
import type { SkillConfig, VisualProfileName } from "../../../../../shared/desktop/workbench-types";
import { backendAuthToken, backendOrigin } from "../runtime";
import { SettingsDisclosure } from "./SettingsDisclosure";
import { fetchSkillCatalog } from "./skillsApi";

type LoadState = "loading" | "ready" | "error";

const CATEGORY_I18N_KEYS: Record<string, string> = {
  "middle-school-number-algebra": "settings.skillCategories.numberAlgebra",
  "middle-high-school-algebra": "settings.skillCategories.algebra",
  "middle-high-school-functions": "settings.skillCategories.functions",
  "middle-school-geometry": "settings.skillCategories.geometry",
  "high-school-algebra": "settings.skillCategories.highSchoolAlgebra",
  "high-school-functions": "settings.skillCategories.highSchoolFunctions",
  "high-school-plane-geometry": "settings.skillCategories.planeGeometry",
  "high-school-solid-geometry": "settings.skillCategories.solidGeometry",
  "high-school-geometry-algebra": "settings.skillCategories.vectorGeometry",
  "high-school-analytic-geometry": "settings.skillCategories.analyticGeometry",
  "high-school-calculus": "settings.skillCategories.calculus",
  "middle-high-school-statistics-probability": "settings.skillCategories.probabilityStatistics",
  "geogebra-workflow": "settings.skillCategories.geogebraWorkflow",
  "visual-post-processing": "settings.skillCategories.visualProcessing",
};

const VISUAL_PROFILE_I18N_KEYS: Record<VisualProfileName, string> = {
  "exam-clean": "settings.skillVisualProfiles.examClean",
  "teaching-demo": "settings.skillVisualProfiles.teachingDemo",
  "choice-comparison": "settings.skillVisualProfiles.choiceComparison",
  "dynamic-exploration": "settings.skillVisualProfiles.dynamicExploration",
  "proof-highlight": "settings.skillVisualProfiles.proofHighlight",
  "spatial-3d": "settings.skillVisualProfiles.spatial3d",
};

function fallbackCatalog(): DesktopAgentSkillSummary[] {
  return DEFAULT_BUSINESS_AGENT_SKILL_NAMES.map((name) => ({
    name,
    description: "",
    source: "built-in",
    maturity: "default",
    tags: [],
  }));
}

function displaySkillName(name: string) {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function SkillsSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<SkillConfig>(() => readDesktopConfig().skills);
  const [catalog, setCatalog] = useState<DesktopAgentSkillSummary[]>(fallbackCatalog);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");

  const persist = useCallback((update: (current: SkillConfig) => SkillConfig) => {
    const desktopConfig = readDesktopConfig();
    const next = normalizeSkillConfig(update(desktopConfig.skills));
    setConfig(next);
    persistDesktopConfig({ ...desktopConfig, skills: next });
  }, []);

  useEffect(() => {
    const sync = () => setConfig(readDesktopConfig().skills);
    globalThis.addEventListener?.(DESKTOP_CONFIG_CHANGED_EVENT, sync);
    return () => globalThis.removeEventListener?.(DESKTOP_CONFIG_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    void fetchSkillCatalog(backendOrigin(), backendAuthToken(), { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setCatalog(result.skills);
        setLoadState("ready");
      })
      .catch((caughtError) => {
        if (controller.signal.aborted) return;
        console.error("[ERROR] Failed to load the Agent Skill catalog", caughtError);
        setLoadState("error");
      });
    return () => controller.abort();
  }, []);

  const enabledNames = useMemo(() => new Set(config.enabledSkillNames), [config.enabledSkillNames]);
  const visibleSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return catalog;
    return catalog.filter((skill) => [
      skill.name,
      skill.description,
      skill.category ?? "",
      ...skill.tags,
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
  }, [catalog, query]);

  const groupedSkills = useMemo(() => {
    const groups = new Map<string, DesktopAgentSkillSummary[]>();
    for (const skill of visibleSkills) {
      const category = skill.category ?? "other";
      const entries = groups.get(category) ?? [];
      entries.push(skill);
      groups.set(category, entries);
    }
    return [...groups.entries()];
  }, [visibleSkills]);

  const toggleSkill = (name: string) => {
    persist((current) => ({
      ...current,
      enabledSkillNames: current.enabledSkillNames.includes(name)
        ? current.enabledSkillNames.filter((entry) => entry !== name)
        : [...current.enabledSkillNames, name],
    }));
  };

  const setAllSkills = (enabled: boolean) => {
    persist((current) => ({
      ...current,
      enabledSkillNames: enabled ? catalog.map((skill) => skill.name) : [],
    }));
  };

  return (
    <Box className="settings-page settings-skills-page">
      <Box className="settings-skills-header">
        <Stack className="settings-skills-heading" direction="row" spacing={1.5}>
          <Box className="settings-skills-mark"><ExtensionOutlined fontSize="small" /></Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{t("settings.skillsTitle")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {config.enabled
                ? t("settings.skillsEnabledCount", { enabled: enabledNames.size, total: catalog.length })
                : t("settings.skillsDisabled")}
            </Typography>
          </Box>
        </Stack>
        <Switch
          size="small"
          checked={config.enabled}
          slotProps={{ input: { "aria-label": t("settings.skillsToggle") } }}
          onChange={(event) => persist((current) => ({ ...current, enabled: event.target.checked }))}
        />
      </Box>

      <SettingsDisclosure open={config.enabled}>
        <Box className="settings-skills-controls">
          <FormControlLabel
            className="settings-toggle-row"
            labelPlacement="start"
            control={
              <Switch
                size="small"
                checked={config.autoActivate}
                onChange={(event) => persist((current) => ({ ...current, autoActivate: event.target.checked }))}
              />
            }
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 650 }}>{t("settings.skillsAutoActivate")}</Typography>
                <Typography variant="caption" color="text.secondary">{t("settings.skillsAutoActivateDescription")}</Typography>
              </Box>
            }
          />
          <TextField
            select
            fullWidth
            size="small"
            label={t("settings.skillVisualProfile")}
            value={config.visualProfile}
            onChange={(event) => persist((current) => ({
              ...current,
              visualProfile: event.target.value as VisualProfileName,
            }))}
          >
            {VISUAL_PROFILE_NAMES.map((profile) => (
              <MenuItem key={profile} value={profile}>{t(VISUAL_PROFILE_I18N_KEYS[profile]!)}</MenuItem>
            ))}
          </TextField>
        </Box>

        <Box className="settings-skills-catalog">
          <Box className="settings-skills-toolbar">
            <TextField
              fullWidth
              size="small"
              value={query}
              placeholder={t("settings.skillsSearch")}
              onChange={(event) => setQuery(event.target.value)}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment>,
                },
                htmlInput: { "aria-label": t("settings.skillsSearch") },
              }}
            />
            <Stack direction="row" spacing={0.5} className="settings-skills-actions">
              <Button size="small" onClick={() => setAllSkills(true)}>{t("settings.skillsSelectAll")}</Button>
              <Button size="small" color="inherit" onClick={() => setAllSkills(false)}>{t("settings.skillsClearAll")}</Button>
            </Stack>
          </Box>

          {loadState === "loading" ? (
            <Stack className="settings-skills-state" direction="row" spacing={1}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">{t("settings.skillsLoading")}</Typography>
            </Stack>
          ) : null}
          {loadState === "error" ? (
            <Typography className="settings-skills-state" variant="caption" color="error.main">
              {t("settings.skillsLoadFailed")}
            </Typography>
          ) : null}

          {groupedSkills.map(([category, skills]) => (
            <Box className="settings-skill-group" key={category}>
              <Typography className="settings-skill-group-title" variant="caption">
                {CATEGORY_I18N_KEYS[category] ? t(CATEGORY_I18N_KEYS[category]!) : category}
              </Typography>
              {skills.map((skill) => {
                const checked = enabledNames.has(skill.name);
                return (
                  <Box
                    component="label"
                    className={`settings-skill-row${checked ? " settings-skill-row--enabled" : ""}`}
                    key={skill.name}
                  >
                    <Checkbox
                      size="small"
                      checked={checked}
                      onChange={() => toggleSkill(skill.name)}
                      slotProps={{ input: { "aria-label": skill.name } }}
                    />
                    <Box className="settings-skill-copy">
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                        <Typography variant="body2" sx={{ fontWeight: 650 }}>{displaySkillName(skill.name)}</Typography>
                        {skill.level && skill.level > 1 ? (
                          <Typography className="settings-skill-level" variant="caption">
                            {t("settings.skillLevel", { level: skill.level })}
                          </Typography>
                        ) : null}
                      </Stack>
                      {skill.description ? (
                        <Typography variant="caption" color="text.secondary">{skill.description}</Typography>
                      ) : null}
                    </Box>
                    {config.autoActivate && checked ? (
                      <AutoAwesomeOutlined className="settings-skill-auto-icon" fontSize="small" />
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          ))}
          {!visibleSkills.length ? (
            <Typography className="settings-skills-state" variant="body2" color="text.secondary">
              {t("settings.skillsEmpty")}
            </Typography>
          ) : null}
        </Box>
      </SettingsDisclosure>
    </Box>
  );
}
