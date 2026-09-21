import { useState } from "react";
import { Box, Button, Link, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { APP_VERSION } from "../../../../../shared/desktop/platform";

/**
 * Who made this, under what licence, and standing on whose shoulders.
 *
 * Carried over from the SolidJS renderer rather than reinvented: these are
 * real people and real projects, and the acknowledgement list is the one part
 * of a settings screen that must not be approximated.
 */
const OPEN_SOURCE_CREDITS = [
  { name: "GeoGebra", href: "https://github.com/geogebra/geogebra", key: "geogebra" },
  { name: "OpenLMLab/GAOKAO-Bench", href: "https://github.com/OpenLMLab/GAOKAO-Bench", key: "gaokao" },
  { name: "whyNLP/Conic10K", href: "https://github.com/whyNLP/Conic10K", key: "conic10k" }
] as const;

const PEOPLE_CREDITS = [
  { name: "Neal", note: "普渡大学统计博士" },
  { name: "张羽豪老师", note: "南京五中教师" },
  { name: "张志勇老师" },
  { name: "桢桢老师" },
  { name: "Zgy 老师" },
  { name: "喵喵", note: "爱猫" },
  { name: "fzm 老师" }
] as const;

const WECHAT_ID = "I0v0ry";

export function AboutSettings() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyWechat = async () => {
    try {
      await navigator.clipboard.writeText(WECHAT_ID);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (caughtError) {
      console.error("[ERROR] Caught exception at src/renderer-react/src/features/desktop/settings/AboutSettings.tsx:40", caughtError);
      // Clipboard access can be refused; the id is on screen either way.
    }
  };

  return (
    <Stack className="settings-page" spacing={2.5}>
      <Box
        component="img"
        src="/images/geochat-about-banner.png"
        alt={t("about.bannerAlt")}
        sx={{
          display: "block",
          width: "100%",
          maxHeight: 150,
          aspectRatio: "1400 / 560",
          objectFit: "cover",
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      />
      <Box className="settings-about-grid">
        <Stack className="settings-about-section settings-about-wide" spacing={0.75}>
          <Typography variant="subtitle1" sx={{ fontWeight: 750 }}>
            {t("common.appName")} <Typography component="span" variant="caption" color="text.secondary">v{APP_VERSION}</Typography>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>{t("about.projectBody")}</Typography>
        </Stack>

        <Stack className="settings-about-section" spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("about.author")}</Typography>
          <Stack className="settings-about-author" direction="row" spacing={1.5}>
            <Box
              component="img"
              src="/images/thanks/author.jpg"
              alt={t("about.authorImageAlt")}
              sx={{ width: 64, height: 64, borderRadius: 2, objectFit: "cover", flexShrink: 0, border: "1px solid", borderColor: "divider" }}
            />
            <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>{t("about.authorBody")}</Typography>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                <Link href="https://space.bilibili.com/266909334" target="_blank" rel="noreferrer" variant="body2">{t("about.bilibili")}</Link>
                <Link href="https://github.com/tiwe0" target="_blank" rel="noreferrer" variant="body2">GitHub</Link>
                <Button size="small" variant="text" sx={{ p: 0, minWidth: 0, minHeight: 0, lineHeight: 1.5 }} onClick={() => void copyWechat()}>
                  {copied ? t("about.copied") : `${t("about.wechat")} · ${WECHAT_ID}`}
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </Stack>

        <Stack className="settings-about-section" spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("about.credits")}</Typography>
          {OPEN_SOURCE_CREDITS.map((credit) => (
            <Box key={credit.name}>
              <Link href={credit.href} target="_blank" rel="noreferrer" variant="body2" sx={{ fontWeight: 600 }}>{credit.name}</Link>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.5 }}>{t(`about.${credit.key}Credit`)}</Typography>
            </Box>
          ))}
        </Stack>

        <Stack className="settings-about-section settings-about-wide" spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("about.peopleCredits")}</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {PEOPLE_CREDITS.map((person) => (
              <Box key={person.name} sx={{ px: 1.25, py: 0.75, borderRadius: 1.5, backgroundColor: "primary.light" }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {person.name}{"note" in person && person.note ? ` · ${person.note}` : ""}
                </Typography>
              </Box>
            ))}
          </Box>
        </Stack>

        {/* Pro is described, not sold, and deliberately has no key field. */}
        <Stack className="settings-about-section" spacing={0.75}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("about.proTitle")}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>{t("about.proBody")}</Typography>
        </Stack>

        <Stack className="settings-about-section" spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("about.sponsorTitle")}</Typography>
          <Box
            component="img"
            src="/images/thanks/wechat.png"
            alt={t("about.sponsorImageAlt")}
            sx={{ display: "block", width: "min(100%, 200px)", height: "auto", borderRadius: 2, border: "1px solid", borderColor: "divider" }}
          />
        </Stack>

        <Stack className="settings-about-section settings-about-wide" spacing={0.5}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("about.licence")}</Typography>
          {/* Verbatim from NOTICE. The vendored GeoGebra runtime is not ours and carries its own terms. */}
          <Typography variant="caption" color="text.secondary">{t("about.copyright")}</Typography>
          <Typography variant="caption" color="text.secondary">{t("about.licenceBody")}</Typography>
          <Typography variant="caption" color="text.secondary">{t("about.thirdParty")}</Typography>
        </Stack>
      </Box>
    </Stack>
  );
}
