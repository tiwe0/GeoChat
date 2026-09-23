import { useId } from "react";
import PsychologyAltRounded from "@mui/icons-material/PsychologyAltRounded";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { ThinkingEffort } from "../../../components/ModelMenu";

type ThinkingChainSettingsProps = {
  enabled: boolean;
  supported: boolean;
  effort: ThinkingEffort;
  modelLabel: string;
};

type DiagramMode = ThinkingEffort | "off" | "unsupported";

export function ThinkingChainSettings({ enabled, supported, effort, modelLabel }: ThinkingChainSettingsProps) {
  const { t } = useTranslation();
  const rawId = useId();
  const markerId = `thinking-arrow-${rawId.replace(/:/g, "")}`;
  const mode: DiagramMode = !supported ? "unsupported" : enabled ? effort : "off";
  const directAnswer = mode === "off" || mode === "unsupported";
  const light = mode === "light";
  const completeChain = mode === "standard" || mode === "extended";
  const extended = mode === "extended";
  const modeLabel = t(`settings.thinkingModes.${mode}`);

  const nodeClass = (active: boolean) => `thinking-chain-node${active ? " thinking-chain-node--active" : ""}`;
  const pathClass = (active: boolean, loop = false) => [
    "thinking-chain-path",
    active ? "thinking-chain-path--active" : "",
    loop ? "thinking-chain-path--loop" : "",
  ].filter(Boolean).join(" ");

  return (
    <Box className="settings-page settings-thinking-page">
      <Box component="section" className="settings-thinking-card">
        <Stack direction="row" className="settings-thinking-header">
          <Stack direction="row" spacing={1.5} className="settings-thinking-heading">
            <Box className="settings-thinking-mark" aria-hidden="true">
              <PsychologyAltRounded fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6">{t("settings.thinkingTitle")}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap title={modelLabel}>
                {modelLabel || t("settings.thinkingModelUnknown")}
              </Typography>
            </Box>
          </Stack>
          <Chip
            className={`settings-thinking-mode settings-thinking-mode--${mode}`}
            size="small"
            label={modeLabel}
          />
        </Stack>

        <Box className="settings-thinking-diagram-wrap">
          <svg
            className={`settings-thinking-diagram settings-thinking-diagram--${mode}`}
            viewBox="0 0 700 220"
            role="img"
            aria-labelledby={`${markerId}-title ${markerId}-description`}
          >
            <title id={`${markerId}-title`}>{t("settings.thinkingDiagramTitle", { mode: modeLabel })}</title>
            <desc id={`${markerId}-description`}>{t("settings.thinkingDiagramDescription")}</desc>
            <defs>
              <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>

            <g className="thinking-chain-paths" markerEnd={`url(#${markerId})`}>
              <path className={pathClass(light || completeChain)} d="M 116 110 L 164 110" />
              <path className={pathClass(completeChain)} d="M 256 110 L 304 110" />
              <path className={pathClass(completeChain)} d="M 396 110 L 444 110" />
              <path className={pathClass(completeChain)} d="M 536 110 L 584 110" />
              <path className={pathClass(directAnswer)} d="M 116 90 C 230 22, 470 22, 584 90" />
              <path className={pathClass(light)} d="M 256 92 C 350 36, 490 36, 584 92" />
              <path className={pathClass(extended, true)} d="M 505 142 C 470 198, 260 198, 225 142" />
            </g>

            <g className={nodeClass(true)} transform="translate(70 110)">
              <circle r="45" />
              <text textAnchor="middle" dominantBaseline="middle">{t("settings.thinkingNodes.input")}</text>
            </g>
            <g className={nodeClass(light || completeChain)} transform="translate(210 110)">
              <circle r="45" />
              <text textAnchor="middle" dominantBaseline="middle">{t("settings.thinkingNodes.analyze")}</text>
            </g>
            <g className={nodeClass(completeChain)} transform="translate(350 110)">
              <circle r="45" />
              <text textAnchor="middle" dominantBaseline="middle">{t("settings.thinkingNodes.tools")}</text>
            </g>
            <g className={nodeClass(completeChain)} transform="translate(490 110)">
              <circle r="45" />
              <text textAnchor="middle" dominantBaseline="middle">{t("settings.thinkingNodes.verify")}</text>
            </g>
            <g className={nodeClass(true)} transform="translate(630 110)">
              <circle r="45" />
              <text textAnchor="middle" dominantBaseline="middle">{t("settings.thinkingNodes.answer")}</text>
            </g>
          </svg>
        </Box>

        <Stack direction="row" className="settings-thinking-footer">
          <Box className="settings-thinking-legend-dot" aria-hidden="true" />
          <Typography variant="caption" color="text.secondary">
            {t("settings.thinkingCurrentPath", { mode: modeLabel })}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
