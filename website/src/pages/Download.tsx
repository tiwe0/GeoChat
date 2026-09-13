import { Container } from "../components/Layout";
import { fill, useContent, useLocale } from "../i18n";
import { formatBytes, type Platform } from "../lib/platform";
import { usePlatform } from "../lib/usePlatform";
import { assetsFor, useLatestRelease, type ReleaseAsset } from "../lib/release";
import { ACTIONS_URL, REPO_URL, RELEASES_URL } from "../site";
import { useDocumentMeta } from "../lib/useDocumentMeta";

const KIND_LABEL: Record<ReleaseAsset["kind"], string> = {
  dmg: "DMG",
  exe: "EXE",
  msi: "MSI"
};

export function Download() {
  const t = useContent();
  const locale = useLocale();
  useDocumentMeta("download");

  const detected = usePlatform();
  const state = useLatestRelease();
  const release = state.release;

  // Only the R2 manifest publishes checksums; when the page is running off the
  // GitHub API this section simply is not there, rather than showing blanks.
  const checksummed = (release?.assets ?? []).filter((asset) => asset.sha256);

  const publishedLabel =
    release?.publishedAt &&
    fill(t.download.released, {
      date: new Date(release.publishedAt).toLocaleDateString(
        locale === "zh" ? "zh-CN" : "en-GB",
        { year: "numeric", month: "long", day: "numeric" }
      )
    });

  return (
    <>
      <section className="border-b border-rule py-16 sm:py-20">
        <Container>
          <div className="flex flex-wrap items-start gap-x-8 gap-y-6">
            <img
              src="/media/app-icon.webp"
              width={88}
              height={88}
              alt=""
              className="h-[5.5rem] w-[5.5rem] shrink-0 rounded-[1.1rem]"
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-title font-semibold">{t.download.title}</h1>
              <p className="measure mt-4 text-lede text-ink-soft">
                {t.download.lede}
              </p>

              <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-soft">
                {release ? (
                  <>
                    <span className="font-mono text-ink">
                      {t.download.version} {release.version}
                    </span>
                    {publishedLabel ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{publishedLabel}</span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <span>{t.download.loading}</span>
                )}
              </p>

              {state.status === "error" ? (
                <p className="mt-3 text-[0.8125rem] text-ochre-ink">
                  {t.download.error}{" "}
                  <a
                    href={RELEASES_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline decoration-from-font underline-offset-2 hover:text-ink"
                  >
                    {t.download.errorAction}
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-rule py-16 sm:py-20">
        <Container>
          <div className="max-w-[52rem]">
            <PlatformRow
              platform="macos"
              copy={t.download.platforms.macos}
              assets={release ? assetsFor(release, "macos") : []}
              detected={detected === "macos"}
              loading={state.status === "loading"}
            />
            <PlatformRow
              platform="windows"
              copy={t.download.platforms.windows}
              assets={release ? assetsFor(release, "windows") : []}
              detected={detected === "windows"}
              loading={state.status === "loading"}
            />
            <PlatformRow
              platform="linux"
              copy={t.download.platforms.linux}
              assets={[]}
              detected={detected === "linux"}
              loading={false}
            />
          </div>
        </Container>
      </section>

      {/* Not a footnote: an unsigned installer stops most first-time users dead,
          and telling them what to click is the difference between an install
          and an abandoned download. */}
      <section className="border-b border-rule bg-ochre-wash/60 py-16 sm:py-20">
        <Container>
          <div className="max-w-[52rem]">
            <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em] sm:text-[1.75rem]">
              {t.download.unsigned.title}
            </h2>
            <p className="measure mt-4 text-[0.9375rem] leading-relaxed text-ink">
              {t.download.unsigned.lede}
            </p>

            <div className="mt-9 grid gap-x-12 gap-y-9 sm:grid-cols-2">
              <Steps title={t.download.platforms.macos.name} steps={t.download.unsigned.macos} />
              <Steps
                title={t.download.platforms.windows.name}
                steps={t.download.unsigned.windows}
              />
            </div>

            <p className="mt-9 text-[0.8125rem]">
              <a
                href={ACTIONS_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="text-ochre-ink underline decoration-from-font underline-offset-2 hover:text-ink"
              >
                {t.download.unsigned.why}
              </a>
            </p>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="max-w-[52rem]">
            <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em] sm:text-[1.75rem]">
              {t.download.source.title}
            </h2>
            <p className="measure mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
              {t.download.source.body}
            </p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-7 inline-block rounded-[9px] border border-rule-strong px-6 py-3 text-[0.9375rem] font-medium text-ink transition-colors hover:border-ink hover:bg-paper-sunk"
            >
              {t.download.source.cta}
            </a>

            {checksummed.length > 0 ? (
              <details className="mt-12 border-t border-rule pt-6">
                <summary className="cursor-pointer text-[0.9375rem] font-semibold">
                  {t.download.checksums}
                </summary>
                <p className="measure mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
                  {t.download.checksumsNote}
                </p>
                <dl className="mt-5 flex flex-col gap-3">
                  {checksummed.map((asset) => (
                    <div key={asset.url}>
                      <dt className="font-mono text-[0.75rem] text-ink">{asset.name}</dt>
                      <dd className="mt-0.5 overflow-x-auto font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
                        {asset.sha256}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
          </div>
        </Container>
      </section>
    </>
  );
}

function Steps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div>
      <h3 className="text-[0.9375rem] font-semibold">{title}</h3>
      <ol className="mt-3 flex flex-col gap-2.5">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-[0.9375rem] leading-relaxed text-ink">
            <span
              aria-hidden="true"
              className="mt-[0.15rem] font-mono text-[0.75rem] text-ochre-ink"
            >
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PlatformRow({
  platform,
  copy,
  assets,
  detected,
  loading
}: {
  platform: Platform;
  copy: { name: string; requirement: string; unavailable?: string };
  assets: ReleaseAsset[];
  detected: boolean;
  loading: boolean;
}) {
  const t = useContent();

  return (
    <div className="border-t border-rule py-8 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-[1.25rem] font-semibold tracking-[-0.015em]">
              {copy.name}
            </h2>
            {detected ? (
              <span className="rounded-full bg-result-wash px-2.5 py-0.5 text-[0.75rem] font-medium text-result">
                {fill(t.download.detected, { platform: copy.name })}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-soft">
            {copy.requirement}
          </p>
          {copy.unavailable ? (
            <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-soft">
              {copy.unavailable}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2.5">
          {loading ? (
            <span
              className="h-11 w-32 animate-pulse rounded-[9px] bg-paper-deep"
              aria-label={t.download.loading}
            />
          ) : assets.length > 0 ? (
            assets.map((asset, index) => (
              <a
                key={asset.url}
                href={asset.url}
                className={
                  index === 0 && detected
                    ? "rounded-[9px] bg-result px-5 py-3 text-[0.875rem] font-medium text-paper transition-transform duration-200 ease-quart hover:-translate-y-px"
                    : "rounded-[9px] border border-rule-strong px-5 py-3 text-[0.875rem] font-medium text-ink transition-colors hover:border-ink hover:bg-paper-sunk"
                }
              >
                {t.download.downloadLabel} {KIND_LABEL[asset.kind]}
                {asset.size > 0 ? (
                  <span
                    className={
                      index === 0 && detected
                        ? "ml-2 font-normal opacity-75"
                        : "ml-2 font-normal text-ink-faint"
                    }
                  >
                    {formatBytes(asset.size)}
                  </span>
                ) : null}
              </a>
            ))
          ) : platform === "linux" ? null : (
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-[9px] border border-rule-strong px-5 py-3 text-[0.875rem] font-medium text-ink transition-colors hover:border-ink hover:bg-paper-sunk"
            >
              {t.download.errorAction}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
