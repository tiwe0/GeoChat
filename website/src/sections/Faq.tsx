import { Link } from "react-router";
import { Container } from "../components/Layout";
import { localePath, useContent, useLocale } from "../i18n";
import { REPO_URL } from "../site";

export function Faq() {
  const t = useContent();

  return (
    <section className="border-b border-rule py-20 sm:py-24">
      <Container>
        <h2 className="text-title font-semibold">{t.faq.title}</h2>

        <dl className="mt-12 max-w-[52rem]">
          {t.faq.items.map((item) => (
            <div key={item.q} className="border-t border-rule py-7">
              <dt className="text-[1.0625rem] font-semibold">{item.q}</dt>
              <dd className="measure mt-2.5 text-[0.9375rem] leading-relaxed text-ink-soft">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

export function Closing() {
  const t = useContent();
  const locale = useLocale();

  return (
    <section className="py-24 sm:py-32">
      <Container className="text-center">
        <h2 className="text-title mx-auto max-w-[34rem] font-semibold">
          {t.closing.title}
        </h2>
        <p className="mx-auto mt-5 max-w-[38rem] text-lede text-ink-soft">
          {t.closing.lede}
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            to={localePath(locale, "/download")}
            className="rounded-[9px] bg-ink px-7 py-3.5 text-[0.9375rem] font-medium text-paper transition-transform duration-200 ease-quart hover:-translate-y-px hover:shadow-[0_6px_18px_-6px_oklch(0.22_0.012_250/0.35)]"
          >
            {t.closing.cta}
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-[9px] border border-rule-strong px-7 py-3.5 text-[0.9375rem] font-medium text-ink transition-colors hover:border-ink hover:bg-paper-sunk"
          >
            {t.closing.secondary}
          </a>
        </div>
      </Container>
    </section>
  );
}
