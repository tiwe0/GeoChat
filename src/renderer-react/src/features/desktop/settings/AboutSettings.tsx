import { useState } from "react";
import { Box, Button, Divider, Link, Stack, Typography } from "@mui/material";
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
  { name: "宇豪", note: "南京五中教师" },
  { name: "志勇老师" },
  { name: "桢桢老师" },
  { name: "Zgy 老师" },
  { name: "馅儿", note: "爱犬" },
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
    } catch {
      // Clipboard access can be refused; the id is on screen either way.
    }
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.75}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {t("common.appName")} <Typography component="span" variant="caption" color="text.secondary">v{APP_VERSION}</Typography>
        </Typography>
        <Typography variant="body2" color="text.secondary">{t("about.projectBody")}</Typography>
      </Stack>

      <Divider flexItem />

      <Stack spacing={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("about.author")}</Typography>
        <Typography variant="body2" color="text.secondary">{t("about.authorBody")}</Typography>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
          <Link href="https://space.bilibili.com/266909334" target="_blank" rel="noreferrer" variant="body2">
            {t("about.bilibili")}
          </Link>
          <Link href="https://github.com/tiwe0" target="_blank" rel="noreferrer" variant="body2">
            GitHub
          </Link>
          <Button size="small" variant="text" sx={{ p: 0, minWidth: 0 }} onClick={() => void copyWechat()}>
            {copied ? t("about.copied") : `${t("about.wechat")} · ${WECHAT_ID}`}
          </Button>
        </Stack>
      </Stack>

      <Divider flexItem />

      <Stack spacing={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("about.credits")}</Typography>
        <Stack spacing={0.75}>
          {OPEN_SOURCE_CREDITS.map((credit) => (
            <Box key={credit.name}>
              <Link href={credit.href} target="_blank" rel="noreferrer" variant="body2" sx={{ fontWeight: 600 }}>
                {credit.name}
              </Link>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {t(`about.${credit.key}Credit`)}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Stack>

      <Stack spacing={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("about.peopleCredits")}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 1 }}>
          {PEOPLE_CREDITS.map((person) => (
            <Box key={person.name}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{person.name}</Typography>
              {"note" in person && person.note ? (
                <Typography variant="caption" color="text.secondary">{person.note}</Typography>
              ) : null}
            </Box>
          ))}
        </Box>
      </Stack>

      <Divider flexItem />

      {/* Pro is described, not sold, and deliberately has no key field. There
          is no Pro service behind this build, and an input that accepts a code
          and does nothing is the same defect as a toggle that changes nothing. */}
      <Stack spacing={0.75}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("about.proTitle")}</Typography>
        <Typography variant="body2" color="text.secondary">{t("about.proBody")}</Typography>
        <Typography variant="caption" color="text.secondary">{t("about.proStatus")}</Typography>
      </Stack>

      <Stack spacing={0.25}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("about.sponsorTitle")}</Typography>
        <Typography variant="caption" color="text.secondary">{t("about.sponsorStatus")}</Typography>
      </Stack>

      <Divider flexItem />

      <Stack spacing={0.5}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t("about.licence")}</Typography>
        {/* Verbatim from NOTICE. The vendored GeoGebra runtime is not ours and
            carries its own terms, which is exactly what a reader needs to know. */}
        <Typography variant="caption" color="text.secondary">{t("about.copyright")}</Typography>
        <Typography variant="caption" color="text.secondary">{t("about.licenceBody")}</Typography>
        <Typography variant="caption" color="text.secondary">{t("about.thirdParty")}</Typography>
      </Stack>
    </Stack>
  );
}
