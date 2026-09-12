import TranslateRounded from "@mui/icons-material/TranslateRounded";
import { IconButton } from "@mui/material";
import { motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { changeAppLanguage, resolveAppLanguage } from "../i18n";

const MotionIconButton = motion.create(IconButton);

export function LanguageButton({ tourId }: { tourId?: string } = {}) {
  const { t, i18n } = useTranslation();
  const [rotation, setRotation] = useState(0);
  const language = resolveAppLanguage(i18n.resolvedLanguage ?? i18n.language);
  const nextLanguage = language === "zh-CN" ? "en" : "zh-CN";
  const label = nextLanguage === "zh-CN"
    ? t("language.switchToChinese")
    : t("language.switchToEnglish");

  return (
    <MotionIconButton
      type="button"
      size="small"
      aria-label={label}
      title={label}
      data-copilot-tour={tourId}
      onClick={() => {
        setRotation((value) => value + 360);
        void changeAppLanguage(nextLanguage);
      }}
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
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <TranslateRounded fontSize="small" />
      </motion.span>
    </MotionIconButton>
  );
}
