import { Route, Routes, useLocation } from "react-router";
import { useEffect } from "react";
import { LocaleProvider } from "./i18n";
import type { Locale } from "./i18n/types";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Download } from "./pages/Download";
import { NotFound, Privacy, Terms } from "./pages/Legal";
import "./styles/app.css";

/** Restores top-of-page on route change; anchors within a page still work. */
function ScrollReset() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function LocaleBranch({ locale }: { locale: Locale }) {
  return (
    <LocaleProvider value={locale}>
      <Layout>
        <Routes>
          <Route index element={<Home />} />
          <Route path="download" element={<Download />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </LocaleProvider>
  );
}

export function App() {
  return (
    <>
      <ScrollReset />
      <Routes>
        <Route path="/en/*" element={<LocaleBranch locale="en" />} />
        <Route path="/*" element={<LocaleBranch locale="zh" />} />
      </Routes>
    </>
  );
}
