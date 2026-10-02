import { LanguagesIcon } from "lucide-react";
import { IconButton, Tooltip, type TooltipProps } from "@mui/material";
import { motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { changeAppLanguage, resolveAppLanguage } from "../i18n";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";

const logger = createStructuredLogger("renderer.language-button");

const MotionIconButton = motion.create(IconButton);

type LanguageChangeTransition = (changeLanguage: () => Promise<void>) => Promise<void>;

export function LanguageButton({
  tourId,
  transitionLanguage,
  tooltipPlacement = "bottom",
}: {
  tourId?: string;
  transitionLanguage?: LanguageChangeTransition;
  tooltipPlacement?: TooltipProps["placement"];
} = {}) {
  const { t, i18n } = useTranslation();
  const [rotation, setRotation] = useState(0);
  const [switching, setSwitching] = useState(false);
  const language = resolveAppLanguage(i18n.resolvedLanguage ?? i18n.language);
  const nextLanguage = language === "zh-CN" ? "en" : "zh-CN";
  const label = nextLanguage === "zh-CN"
    ? t("language.switchToChinese")
    : t("language.switchToEnglish");

  async function switchLanguage() {
    if (switching) return;
    setSwitching(true);
    setRotation((value) => value + 360);
    try {
      const change = () => changeAppLanguage(nextLanguage);
      if (transitionLanguage) await transitionLanguage(change);
      else await change();
    } catch (caughtError) {
      logger.warn("language_switch_failed", "LANGUAGE_SWITCH_FAILED", { error: caughtError, language: nextLanguage });
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Tooltip title={label} placement={tooltipPlacement} arrow>
      <span style={{ display: "inline-flex" }}>
    <MotionIconButton
      type="button"
      size="small"
      aria-label={label}
      aria-busy={switching}
      disabled={switching}
      data-copilot-tour={tourId}
      onClick={() => void switchLanguage()}
      whileTap={{ scale: 0.86 }}
      transition={{ duration: 0.12 }}
    >
      {/* The turn lives on its own element. Sharing one with the tap scale put
          both on the same transform, and the press releasing mid-turn cut the
          rotation short of a full circle. Separated, neither can clip the
          other. Longer and ease-out, so the end of the turn is still legible
          rather than crawling to a stop the eye reads as unfinished. */}
      <motion.span
        style={{ display: "grid", placeItems: "center" }}
        animate={{ rotate: rotation }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <LanguagesIcon size={18} />
      </motion.span>
    </MotionIconButton>
      </span>
    </Tooltip>
  );
}
