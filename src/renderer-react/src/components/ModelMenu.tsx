import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import KeyboardArrowDownRounded from "@mui/icons-material/KeyboardArrowDownRounded";
import ModelTrainingRounded from "@mui/icons-material/ModelTrainingRounded";
import { Box, ButtonBase, Divider, ListItemIcon, ListItemText, MenuItem, MenuList, Paper, Popper, Switch, Typography } from "@mui/material";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AGENT_PROVIDER_REGISTRY } from "@geochat-ai/app/model-registry";
import type { RuntimeModelOption } from "../features/models/modelCatalog";

const MotionPaper = motion.create(Paper);

const providerLabels = new Map<string, string>(AGENT_PROVIDER_REGISTRY.map((provider) => [provider.id, provider.label]));
const compactProviderLabels: Record<string, string> = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  anthropic: "Claude",
  google: "Gemini",
  openrouter: "OpenRouter",
  qwen: "Qwen",
};

function providerLabel(provider: string) {
  return compactProviderLabels[provider] ?? providerLabels.get(provider) ?? provider.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function modelIdLabel(option: RuntimeModelOption) {
  // Provider grouping makes the prefix redundant, leaving more room for the
  // model identifier while preserving the complete id in the item tooltip.
  const prefix = `${option.provider}/`;
  return option.id.startsWith(prefix) ? option.id.slice(prefix.length) : option.id;
}

export type ThinkingEffort = "light" | "standard" | "extended";

type ModelMenuProps = {
  value: string;
  models: readonly RuntimeModelOption[];
  disabled: boolean;
  thinkingEnabled: boolean;
  thinkingEffort: ThinkingEffort;
  portalContainer: () => Element | null;
  onChange: (value: string) => void;
  onThinkingEnabledChange: (value: boolean) => void;
  onThinkingEffortChange: (value: ThinkingEffort) => void;
  tourId?: string;
};

export function ModelMenu({ value, models, disabled, thinkingEnabled, thinkingEffort, portalContainer, onChange, onThinkingEnabledChange, onThinkingEffortChange, tourId }: ModelMenuProps) {
  const { t } = useTranslation();
  const [anchorElement, setAnchorElement] = useState<HTMLButtonElement | null>(null);
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [providerView, setProviderView] = useState<string | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const selectedModel = models.find((option) => option.id === value);
  const modelGroups = models.reduce<Array<{ provider: string; options: RuntimeModelOption[] }>>((groups, option) => {
    const group = groups.find((entry) => entry.provider === option.provider);
    if (group) group.options.push(option);
    else groups.push({ provider: option.provider, options: [option] });
    return groups;
  }, []);
  const open = menuOpen && Boolean(anchorElement);
  const modeLabel = thinkingEnabled ? t("model.thinkingEnabled") : t("model.thinkingDisabled");

  useEffect(() => {
    if (menuOpen || !menuMounted) return;
    const timer = window.setTimeout(() => {
      setMenuMounted(false);
      setAnchorElement(null);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [menuMounted, menuOpen]);

  useEffect(() => {
    if (!anchorElement) return;
    const ownerDocument = anchorElement.ownerDocument;
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const eventPath = event.composedPath();
      if (eventPath.includes(anchorElement) || (menuRef.current && eventPath.includes(menuRef.current))) return;
      setMenuOpen(false);
    };
    const closeOnWindowBlur = () => setMenuOpen(false);

    ownerDocument.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    ownerDocument.defaultView?.addEventListener("blur", closeOnWindowBlur);
    return () => {
      ownerDocument.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      ownerDocument.defaultView?.removeEventListener("blur", closeOnWindowBlur);
    };
  }, [anchorElement]);

  function selectModel(modelId: string) {
    onChange(modelId);
    setMenuOpen(false);
  }

  function toggleMenu(button: HTMLButtonElement) {
    if (menuMounted) {
      setMenuOpen(false);
      return;
    }
    setAnchorElement(button);
    setProviderView(null);
    setMenuMounted(true);
    window.requestAnimationFrame(() => setMenuOpen(true));
  }

  return (
    <>
      <ButtonBase
        id="geogebra-copilot-model-button"
        type="button"
        disabled={disabled}
        aria-label={t("model.selectCurrent", { model: selectedModel?.label ?? value })}
        aria-controls={open ? "geogebra-copilot-model-menu" : undefined}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : undefined}
        title={t("model.selectTitle", { model: selectedModel?.label ?? value })}
        data-copilot-tour={tourId}
        data-copilot-thinking-tour="thinking"
        onClick={(event) => toggleMenu(event.currentTarget)}
        sx={{
          minWidth: 0,
          maxWidth: 180,
          px: 0.75,
          py: 0.5,
          gap: 0.35,
          borderRadius: 1,
          color: "text.secondary",
          bgcolor: open ? "action.selected" : "transparent",
          "&:hover": { bgcolor: "action.hover" },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
        }}
      >
        <ModelTrainingRounded fontSize="small" />
        <Typography variant="caption" noWrap sx={{ maxWidth: 118, fontWeight: 600 }}>
          {selectedModel?.label ?? value} · {modeLabel}
        </Typography>
        <KeyboardArrowDownRounded sx={{ fontSize: 17, transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }} />
      </ButtonBase>
      <Popper
        id="geogebra-copilot-model-menu"
        anchorEl={anchorElement}
        open={menuMounted}
        container={portalContainer}
        placement="top-end"
        modifiers={[
          { name: "offset", options: { offset: [0, 4] } },
          { name: "preventOverflow", options: { padding: 8 } },
        ]}
        sx={{ zIndex: (theme) => theme.zIndex.tooltip }}
      >
        <MotionPaper
          elevation={6}
          initial={{ opacity: 0, y: 4, scale: 0.96 }}
          animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 4, scale: 0.96 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          onContextMenu={(event) => event.preventDefault()}
          sx={{ width: 320, maxWidth: "calc(100vw - 24px)", border: 1, borderColor: "divider", overflow: "hidden" }}
        >
          <MenuList
            ref={menuRef}
            data-copilot-no-drag
            dense
            autoFocusItem={open}
            aria-labelledby="geogebra-copilot-model-button"
            sx={{ maxHeight: "min(480px, 66vh)", overflowY: "auto", px: 0.5, py: 0.5, scrollbarWidth: "thin" }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              setMenuOpen(false);
              anchorElement?.focus();
            }}
          >
            <ListItemText sx={{ px: 1.5, py: 0.5 }} primary={<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t("model.responseMode")}</Typography>} />
            <MenuItem
              onClick={() => onThinkingEnabledChange(!thinkingEnabled)}
              sx={{ minHeight: 48, px: 1.25, borderRadius: 0.75 }}
            >
              <ListItemText
                primary={t("model.thinkingEnabled")}
              />
              <Switch
                edge="end"
                size="small"
                checked={thinkingEnabled}
                onChange={(event) => onThinkingEnabledChange(event.target.checked)}
                onClick={(event) => event.stopPropagation()}
                slotProps={{ input: { "aria-label": t("model.thinkingEnabled") } }}
              />
            </MenuItem>
            {thinkingEnabled && selectedModel?.provider === "openai" && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <ListItemText sx={{ px: 1.5, py: 0.5 }} primary={<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t("model.thinkingEffort")}</Typography>} />
                {(["light", "standard", "extended"] as const).map((effort) => (
                  <MenuItem key={effort} selected={thinkingEffort === effort} onClick={() => onThinkingEffortChange(effort)}>
                    <ListItemText primary={t(`model.effort.${effort}`)} />
                    <ListItemIcon sx={{ minWidth: 28, justifyContent: "flex-end" }}>{thinkingEffort === effort && <CheckRounded fontSize="small" color="primary" />}</ListItemIcon>
                  </MenuItem>
                ))}
              </>
            )}
            <Divider sx={{ my: 0.5 }} />
            <ListItemText
              sx={{ px: 1.5, py: 0.5 }}
              primary={<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t("model.models")}</Typography>}
            />
            {providerView === null ? (
              <>
                {modelGroups.map(({ provider, options }) => {
                  const current = options.find((option) => option.id === value);
                  return (
                    <MenuItem key={provider} onClick={() => setProviderView(provider)} sx={{ minHeight: 44, px: 1.25, borderRadius: 0.75 }}>
                      <Box sx={{ width: 8, height: 8, mr: 1, borderRadius: "50%", bgcolor: "primary.main", opacity: 0.75 }} />
                      <ListItemText
                        primary={providerLabel(provider)}
                        secondary={current ? current.label : t("model.modelCount", { count: options.length })}
                        slotProps={{
                          primary: { noWrap: true, sx: { fontSize: "0.82rem", fontWeight: 700 } },
                          secondary: { noWrap: true, sx: { fontSize: "0.68rem", color: "text.disabled" } },
                        }}
                        sx={{ minWidth: 0, my: 0 }}
                      />
                      <ChevronRightRounded fontSize="small" color="disabled" />
                    </MenuItem>
                  );
                })}
              </>
            ) : (
              (() => {
                const group = modelGroups.find((entry) => entry.provider === providerView);
                if (!group) return null;
                return (
                  <>
                    <MenuItem onClick={() => setProviderView(null)} sx={{ minHeight: 34, px: 1, color: "text.secondary" }}>
                      <ArrowBackRounded sx={{ mr: 0.75, fontSize: 17 }} />
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>{providerLabel(providerView)}</Typography>
                    </MenuItem>
                    {group.options.map((option) => {
                      const selected = option.id === value;
                      const idLabel = modelIdLabel(option);
                      return (
                        <MenuItem
                          key={option.id}
                          selected={selected}
                          onClick={() => selectModel(option.id)}
                          title={`${option.label} · ${option.id}`}
                          sx={{ minHeight: 40, px: 1.25, borderRadius: 0.75, alignItems: "center" }}
                        >
                          <ListItemText
                            primary={option.label}
                            secondary={idLabel}
                            slotProps={{
                              primary: { noWrap: true, sx: { fontSize: "0.82rem", fontWeight: selected ? 700 : 600 } },
                              secondary: { noWrap: true, sx: { fontSize: "0.66rem", lineHeight: 1.1, color: "text.disabled" } },
                            }}
                            sx={{ minWidth: 0, my: 0 }}
                          />
                          <ListItemIcon sx={{ minWidth: 24, justifyContent: "flex-end" }}>{selected && <CheckRounded fontSize="small" color="primary" />}</ListItemIcon>
                        </MenuItem>
                      );
                    })}
                  </>
                );
              })()
            )}
          </MenuList>
        </MotionPaper>
      </Popper>
    </>
  );
}
