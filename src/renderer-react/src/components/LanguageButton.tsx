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
      animate={{ rotate: rotation }}
      transition={{ rotate: { duration: 0.28, ease: "easeInOut" }, scale: { duration: 0.12 } }}
    >
      <TranslateRounded fontSize="small" />
    </MotionIconButton>
  );
}
