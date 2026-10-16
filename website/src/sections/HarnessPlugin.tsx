import { useState } from "react";
import { Container } from "../components/Layout";
import { useContent } from "../i18n";
import {
  DSH_PLUGIN_DOCS_URL,
  DSH_PLUGIN_INSTALL,
  DSH_PLUGIN_RELEASE_URL,
  DSH_PLUGIN_TARBALL_URL,
  DSH_PLUGIN_VERSION
} from "../site";

export function HarnessPlugin() {
  const { plugin: t } = useContent();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copyInstall() {
    try {
      await navigator.clipboard.writeText(DSH_PLUGIN_INSTALL);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <section id="dsh-plugin" aria-labelledby="dsh-plugin-title" className="scroll-mt-14 border-b border-rule bg-paper-sunk py-20 sm:py-24">
      <Container>
        <header className="max-w-[52rem]">
          <h2 id="dsh-plugin-title" className="text-title font-semibold">{t.title}</h2>
          <p className="measure mt-5 text-lede text-ink-soft">{t.lede}</p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <a href={DSH_PLUGIN_TARBALL_URL} className="rounded-[9px] bg-ink px-6 py-3 text-[0.9375rem] font-medium text-paper transition-colors hover:bg-construct">
              {t.download} v{DSH_PLUGIN_VERSION}
            </a>
            <a href={DSH_PLUGIN_DOCS_URL} className="text-[0.9375rem] font-medium text-construct underline underline-offset-4">{t.docs}</a>
          </div>
        </header>

        <figure className="mt-10">
          <img src="/media/dsh-plugin-1600.webp" srcSet="/media/dsh-plugin-960.webp 960w, /media/dsh-plugin-1600.webp 1600w" sizes="(min-width: 1200px) 1152px, 100vw" width={1600} height={1072} alt={t.imageAlt} loading="lazy" decoding="async" className="w-full rounded-xl bg-ink" />
          <figcaption className="mt-3 text-[0.875rem] text-ink-soft">{t.caption}</figcaption>
        </figure>

        <div className="mt-12 grid gap-12 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="text-2xl font-semibold">{t.capabilities}</h3>
            <dl className="mt-6 divide-y divide-rule">
              {t.items.map((item) => (
                <div key={item.title} className="py-5 first:pt-0">
                  <dt className="font-semibold">{item.title}</dt>
                  <dd className="mt-2 leading-relaxed text-ink-soft">{item.body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="min-w-0">
            <h3 className="text-2xl font-semibold">{t.install}</h3>
            <p className="mt-4 text-[0.9375rem] text-ink-soft">{t.requirements}</p>
            <div className="mt-5 rounded-xl border border-rule-strong bg-paper p-5">
              <button type="button" onClick={() => void copyInstall()} className="mb-4 rounded-sm text-[0.875rem] font-medium text-construct underline underline-offset-4 hover:text-ink">
                {copyStatus === "copied" ? t.copied : t.copy}
              </button>
              <pre className="whitespace-pre-wrap break-all font-mono text-[0.8125rem] leading-relaxed"><code>{DSH_PLUGIN_INSTALL}</code></pre>
              <p role="status" className="mt-2 text-[0.875rem] text-ink-soft">{copyStatus === "failed" ? t.copyFailed : copyStatus === "copied" ? t.copied : ""}</p>
            </div>
            <p className="mt-5 leading-relaxed text-ink-soft">{t.restart}</p>
            <p className="mt-4 leading-relaxed">{t.prompt}</p>
            <a href={DSH_PLUGIN_RELEASE_URL} className="mt-5 inline-block text-[0.875rem] text-construct underline underline-offset-4">{t.checksums}</a>
          </div>
        </div>
        <div className="mt-8 border-t border-rule pt-6 text-[0.875rem] leading-relaxed text-ink-soft">
          <p>{t.memory}</p>
          <p className="mt-3">{t.license} <a href="https://www.geogebra.org/license" className="text-construct underline underline-offset-4">{t.licenseLink}</a></p>
        </div>
      </Container>
    </section>
  );
}
