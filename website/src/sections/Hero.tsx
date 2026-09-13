import { Link } from "react-router";
import { ConstructionFigure } from "../components/figures/ConstructionFigure";
import { circumcircle } from "../components/figures/figures";
import { Container } from "../components/Layout";
import { fill, localePath, useContent, useLocale } from "../i18n";
import { usePlatform } from "../lib/usePlatform";

export function Hero() {
  const t = useContent();
  const locale = useLocale();
  const platform = usePlatform();

  const platformName =
    platform === "macos"
      ? t.download.platforms.macos.name
      : platform === "windows"
        ? t.download.platforms.windows.name
        : null;

  const downloadLabel = platformName
    ? fill(t.hero.ctaDownloadFor, { platform: platformName })
    : t.hero.ctaDownload;

  return (
    <section className="relative overflow-hidden border-b border-rule">
      <Container className="grid items-center gap-x-14 gap-y-12 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:py-20">
        <div>
          <h1 className="text-display font-semibold">
            <span className="block text-ink">{t.hero.given}</span>
            <span className="block text-construct">{t.hero.construct}</span>
            <span className="block text-result">{t.hero.conclude}</span>
          </h1>

          <p className="measure mt-7 text-lede text-ink-soft">{t.hero.lede}</p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to={localePath(locale, "/download")}
              className="rounded-[9px] bg-ink px-6 py-3 text-[0.9375rem] font-medium text-paper transition-transform duration-200 ease-quart hover:-translate-y-px hover:shadow-[0_6px_18px_-6px_oklch(0.22_0.012_250/0.35)]"
            >
              {downloadLabel}
            </Link>
            <a
              href="#demo"
              className="rounded-[9px] border border-rule-strong px-6 py-3 text-[0.9375rem] font-medium text-ink transition-colors hover:border-ink hover:bg-paper-sunk"
            >
              {t.hero.ctaDemo}
            </a>
          </div>

          <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-faint">
            <span>{t.hero.metaPlatforms}</span>
            <span aria-hidden="true">·</span>
            <span>{t.hero.metaLicense}</span>
            <span aria-hidden="true">·</span>
            <span>{t.hero.metaLocal}</span>
          </p>
        </div>

        <figure className="lg:justify-self-end">
          <ConstructionFigure
            figure={circumcircle}
            title={t.hero.figureAlt}
            className="w-full max-w-[30rem]"
            delay={0.3}
            strokeWidth={1.9}
            animate={false}
          />
          <figcaption className="mt-7 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.75rem] text-ink-soft">
            <LegendSwatch color="var(--color-ink)" label={t.legend.ink} />
            <LegendSwatch color="var(--color-construct)" label={t.legend.construct} />
            <LegendSwatch color="var(--color-result)" label={t.legend.result} />
          </figcaption>
        </figure>
      </Container>
    </section>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="h-[2px] w-4 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
