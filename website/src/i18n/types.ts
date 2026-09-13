/**
 * The shape every locale must satisfy. Defining it explicitly (rather than
 * inferring from the Chinese file) means a missing English key is a type
 * error, not a blank space discovered in production.
 */

export type Locale = "zh" | "en";

export type SellingPoint = {
  id: string;
  /** Which notation color frames this point's figure. */
  role: "ink" | "construct" | "result";
  title: string;
  body: string;
  /** Optional literal shown in mono — a real command, path, or file name. */
  literal?: string;
};

export type PipelineStep = {
  label: string;
  caption: string;
  /** Real GeoGebra syntax, as emitted by packages/app/src/geogebra-compiler.ts */
  code?: string[];
};

export type FaqItem = { q: string; a: string };

export type LegalSection = { heading: string; paragraphs: string[] };

export type PlatformCopy = {
  name: string;
  requirement: string;
  /** Shown when no build exists for this platform. */
  unavailable?: string;
};

export type Content = {
  htmlLang: string;
  /** Used for <html lang> and to pick CJK line-height rules. */
  isCJK: boolean;

  nav: {
    skipToContent: string;
    features: string;
    how: string;
    download: string;
    source: string;
    switchTo: string;
    switchToLabel: string;
  };

  hero: {
    /** Three words, one per notation color. They are the headline and the key. */
    given: string;
    construct: string;
    conclude: string;
    lede: string;
    ctaDownload: string;
    /** `{platform}` is replaced at runtime. */
    ctaDownloadFor: string;
    ctaDemo: string;
    metaLicense: string;
    metaLocal: string;
    metaPlatforms: string;
    figureAlt: string;
  };

  legend: {
    title: string;
    ink: string;
    construct: string;
    result: string;
  };

  selling: {
    title: string;
    lede: string;
    items: SellingPoint[];
  };

  pipeline: {
    title: string;
    lede: string;
    problem: string;
    steps: PipelineStep[];
    scrollHint: string;
  };

  demo: {
    title: string;
    lede: string;
    play: string;
    posterAlt: string;
    fallback: string;
  };

  shots: {
    title: string;
    lede: string;
    alt: string;
  };

  closing: {
    title: string;
    lede: string;
    cta: string;
    secondary: string;
  };

  faq: {
    title: string;
    items: FaqItem[];
  };

  download: {
    title: string;
    lede: string;
    version: string;
    versionUnknown: string;
    released: string;
    detected: string;
    otherPlatforms: string;
    platforms: {
      macos: PlatformCopy;
      windows: PlatformCopy;
      linux: PlatformCopy;
    };
    downloadLabel: string;
    sizeLabel: string;
    checksums: string;
    checksumsNote: string;
    loading: string;
    error: string;
    errorAction: string;
    unsigned: {
      title: string;
      lede: string;
      macos: string[];
      windows: string[];
      why: string;
    };
    source: {
      title: string;
      body: string;
      cta: string;
    };
  };

  footer: {
    tagline: string;
    product: string;
    legal: string;
    privacy: string;
    terms: string;
    source: string;
    license: string;
    author: string;
    copyright: string;
    noTracking: string;
  };

  privacy: {
    title: string;
    updated: string;
    lede: string;
    sections: LegalSection[];
  };

  terms: {
    title: string;
    updated: string;
    lede: string;
    sections: LegalSection[];
  };

  notFound: {
    title: string;
    body: string;
    cta: string;
  };
};
