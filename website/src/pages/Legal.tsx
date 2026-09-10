import { Link } from "react-router";
import { Container } from "../components/Layout";
import { localePath, useContent, useLocale } from "../i18n";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import type { LegalSection } from "../i18n/types";
import type { RouteKey } from "../routes-meta";

/**
 * Shared shell for the two legal pages. Long prose, one column, generous
 * measure — these exist to be read, not skimmed past.
 */
function LegalPage({
  routeKey,
  title,
  updated,
  lede,
  sections
}: {
  routeKey: RouteKey;
  title: string;
  updated: string;
  lede: string;
  sections: LegalSection[];
}) {
  useDocumentMeta(routeKey);

  return (
    <article className="py-16 sm:py-20">
      <Container>
        <header className="max-w-[46rem]">
          <h1 className="text-title font-semibold">{title}</h1>
          <p className="mt-3 font-mono text-[0.8125rem] text-ink-faint">{updated}</p>
          <p className="measure mt-6 font-serif text-[1.1875rem] leading-relaxed text-ink">
            {lede}
          </p>
        </header>

        <div className="mt-14 max-w-[46rem]">
          {sections.map((section) => (
            <section key={section.heading} className="border-t border-rule py-9">
              <h2 className="text-[1.1875rem] font-semibold tracking-[-0.01em]">
                {section.heading}
              </h2>
              <div className="mt-4 flex flex-col gap-4">
                {section.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph.slice(0, 40)}
                    className="measure text-[0.9375rem] leading-relaxed text-ink-soft"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Container>
    </article>
  );
}

export function Privacy() {
  const t = useContent();
  return <LegalPage routeKey="privacy" {...t.privacy} />;
}

export function Terms() {
  const t = useContent();
  return <LegalPage routeKey="terms" {...t.terms} />;
}

export function NotFound() {
  const t = useContent();
  const locale = useLocale();

  return (
    <section className="py-28 sm:py-36">
      <Container className="text-center">
        <h1 className="text-title font-semibold">{t.notFound.title}</h1>
        <p className="mx-auto mt-5 max-w-[32rem] text-lede text-ink-soft">
          {t.notFound.body}
        </p>
        <Link
          to={localePath(locale)}
          className="mt-9 inline-block rounded-[9px] bg-ink px-6 py-3 text-[0.9375rem] font-medium text-paper transition-colors hover:bg-construct"
        >
          {t.notFound.cta}
        </Link>
      </Container>
    </section>
  );
}
