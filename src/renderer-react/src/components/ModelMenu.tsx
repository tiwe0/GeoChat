import CheckRounded from "@mui/icons-material/CheckRounded";
import KeyboardArrowDownRounded from "@mui/icons-material/KeyboardArrowDownRounded";
import ModelTrainingRounded from "@mui/icons-material/ModelTrainingRounded";
import { ButtonBase, Divider, ListItemIcon, ListItemText, MenuItem, MenuList, Paper, Popper, Typography } from "@mui/material";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RuntimeModelOption } from "../features/models/modelCatalog";

const MotionPaper = motion.create(Paper);

export type ReasoningMode = "auto" | "instant" | "thinking";
export type ThinkingEffort = "light" | "standard" | "extended";

type ModelMenuProps = {
  value: string;
  models: readonly RuntimeModelOption[];
  disabled: boolean;
  reasoningMode: ReasoningMode;
  thinkingEffort: ThinkingEffort;
  portalContainer: () => Element | null;
  onChange: (value: string) => void;
  onReasoningModeChange: (value: ReasoningMode) => void;
  onThinkingEffortChange: (value: ThinkingEffort) => void;
  tourId?: string;
};

export function ModelMenu({ value, models, disabled, reasoningMode, thinkingEffort, portalContainer, onChange, onReasoningModeChange, onThinkingEffortChange, tourId }: ModelMenuProps) {
  const { t } = useTranslation();
  const [anchorElement, setAnchorElement] = useState<HTMLButtonElement | null>(null);
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLUListElement>(null);
  const selectedModel = models.find((option) => option.id === value);
  const open = menuOpen && Boolean(anchorElement);
  const modeLabel = t(`model.mode.${reasoningMode}`);

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
          sx={{ minWidth: 250, maxWidth: 300, border: 1, borderColor: "divider" }}
        >
          <MenuList
            ref={menuRef}
            data-copilot-no-drag
            dense
            autoFocusItem={open}
            aria-labelledby="geogebra-copilot-model-button"
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              setMenuOpen(false);
              anchorElement?.focus();
            }}
          >
            <ListItemText sx={{ px: 1.5, py: 0.5 }} primary={<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t("model.responseMode")}</Typography>} />
            {(["auto", "instant", "thinking"] as const).map((mode) => (
              <MenuItem key={mode} selected={reasoningMode === mode} onClick={() => onReasoningModeChange(mode)}>
                <ListItemText primary={t(`model.mode.${mode}`)} secondary={t(`model.modeDescription.${mode}`)} />
                <ListItemIcon sx={{ minWidth: 28, justifyContent: "flex-end" }}>{reasoningMode === mode && <CheckRounded fontSize="small" color="primary" />}</ListItemIcon>
              </MenuItem>
            ))}
            {reasoningMode === "thinking" && selectedModel?.provider === "openai" && (
              <>
                <Divider sx={{ my: 0.5 }} />
                <ListItemText sx={{ px: 1.5, py: 0.5 }} primary={<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t("model.thinkingEffort")}</Typography>} />
                {(["light", "standard", "extended"] as const).map((effort) => (
                  <MenuItem key={effort} selected={thinkingEffort === effort} onClick={() => onThinkingEffortChange(effort)}>
                    <ListItemText primary={t(`model.effort.${effort}`)} secondary={t(`model.effortDescription.${effort}`)} />
                    <ListItemIcon sx={{ minWidth: 28, justifyContent: "flex-end" }}>{thinkingEffort === effort && <CheckRounded fontSize="small" color="primary" />}</ListItemIcon>
                  </MenuItem>
                ))}
              </>
            )}
            <Divider sx={{ my: 0.5 }} />
            <ListItemText sx={{ px: 1.5, py: 0.5 }} primary={<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t("model.models")}</Typography>} />
            {models.map((option) => {
              const selected = option.id === value;
              return (
                <MenuItem key={option.id} selected={selected} onClick={() => selectModel(option.id)}>
                  <ListItemText primary={option.label} secondary={option.id} />
                  <ListItemIcon sx={{ minWidth: 28, justifyContent: "flex-end" }}>{selected && <CheckRounded fontSize="small" color="primary" />}</ListItemIcon>
                </MenuItem>
              );
            })}
          </MenuList>
        </MotionPaper>
      </Popper>
    </>
  );
}
