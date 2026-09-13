import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { localePath, parsePath, useContent, useLocale } from "../i18n";
import { REPO_URL } from "../site";

export function Container({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[76rem] px-5 sm:px-8 ${className}`}>
      {children}
    </div>
  );
}

/** The mark: a point, and the circle it determines. Drawn, not imported. */
function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg
        viewBox="0 0 24 24"
        className="h-[1.35rem] w-[1.35rem] shrink-0"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="var(--color-construct)"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="12" r="1.9" fill="var(--color-result)" />
        <path d="M12 12 L21 12" stroke="var(--color-ink)" strokeWidth="1.5" />
      </svg>
      <span className="text-[1.0625rem] font-semibold tracking-[-0.02em]">
        GeoChat
      </span>
    </span>
  );
}

function Nav() {
  const t = useContent();
  const locale = useLocale();
  const { pathname } = useLocation();
  const { rest } = parsePath(pathname);
  const other = locale === "zh" ? "en" : "zh";

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/92 backdrop-blur-[2px]">
      <Container className="flex h-14 items-center justify-between gap-4">
        <Link
          to={localePath(locale)}
          className="rounded-sm text-ink transition-opacity hover:opacity-70"
        >
          <Wordmark />
        </Link>

        <nav className="flex items-center gap-1 text-[0.875rem]">
          <a
            href={`${localePath(locale)}#what`}
            className="hidden rounded-sm px-2.5 py-1.5 text-ink-soft transition-colors hover:text-ink sm:block"
          >
            {t.nav.features}
          </a>
          <a
            href={`${localePath(locale)}#how`}
            className="hidden rounded-sm px-2.5 py-1.5 text-ink-soft transition-colors hover:text-ink sm:block"
          >
            {t.nav.how}
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="hidden rounded-sm px-2.5 py-1.5 text-ink-soft transition-colors hover:text-ink sm:block"
          >
            {t.nav.source}
          </a>

          <Link
            to={localePath(other, rest)}
            lang={other === "en" ? "en" : "zh-Hans"}
            aria-label={t.nav.switchToLabel}
            className="ml-1 rounded-sm px-2.5 py-1.5 text-ink-soft transition-colors hover:text-ink"
          >
            {t.nav.switchTo}
          </Link>

          <Link
            to={localePath(locale, "/download")}
            className="ml-1.5 rounded-[7px] bg-ink px-3.5 py-2 font-medium text-paper transition-colors hover:bg-construct"
          >
            {t.nav.download}
          </Link>
        </nav>
      </Container>
    </header>
  );
}

function Footer() {
  const t = useContent();
  const locale = useLocale();

  return (
    <footer className="mt-auto border-t border-rule bg-paper-sunk">
      <Container className="py-12">
        <div className="flex flex-wrap items-start justify-between gap-x-12 gap-y-9">
          <div className="max-w-[24rem]">
            <Wordmark />
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
              {t.footer.tagline}
            </p>
          </div>

          <div className="flex flex-wrap gap-x-14 gap-y-8 text-[0.9375rem]">
            <FooterColumn title={t.footer.product}>
              <FooterLink to={localePath(locale, "/download")}>
                {t.nav.download}
              </FooterLink>
              <FooterLink href={REPO_URL}>{t.footer.source}</FooterLink>
            </FooterColumn>

            <FooterColumn title={t.footer.legal}>
              <FooterLink to={localePath(locale, "/privacy")}>
                {t.footer.privacy}
              </FooterLink>
              <FooterLink to={localePath(locale, "/terms")}>
                {t.footer.terms}
              </FooterLink>
            </FooterColumn>
          </div>
        </div>

        <div className="mt-11 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-rule pt-6 text-[0.8125rem] text-ink-soft">
          <p>
            {t.footer.copyright} · {t.footer.license}
          </p>
          <p>{t.footer.noTracking}</p>
        </div>
      </Container>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-[0.8125rem] font-semibold text-ink">{title}</h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function FooterLink({
  to,
  href,
  children
}: {
  to?: string;
  href?: string;
  children: ReactNode;
}) {
  const className = "text-ink-soft transition-colors hover:text-ink";
  return (
    <li>
      {to ? (
        <Link to={to} className={className}>
          {children}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
          {children}
        </a>
      )}
    </li>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const t = useContent();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-40 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        {t.nav.skipToContent}
      </a>
      <Nav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
