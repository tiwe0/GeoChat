import type {
  BundledLanguage,
  CodeHighlighterPlugin,
  ThemeInput,
} from "streamdown";

type HighlightResult = Exclude<ReturnType<CodeHighlighterPlugin["highlight"]>, null>;

const SUPPORTED_LANGUAGES = [
  "javascript",
  "jsx",
  "typescript",
  "tsx",
  "json",
  "python",
  "shellscript",
  "markdown",
  "html",
  "css",
  "latex",
] as const satisfies readonly BundledLanguage[];

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_ALIASES: Readonly<Record<string, SupportedLanguage>> = {
  bash: "shellscript",
  htm: "html",
  js: "javascript",
  md: "markdown",
  py: "python",
  sh: "shellscript",
  tex: "latex",
  ts: "typescript",
  zsh: "shellscript",
};

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGES);
const DEFAULT_THEMES: [ThemeInput, ThemeInput] = ["github-light", "github-dark"];
const resultCache = new Map<string, HighlightResult>();
const pendingCallbacks = new Map<string, Set<(result: HighlightResult) => void>>();
const inFlightHighlights = new Set<string>();

function normalizeLanguage(language: string): SupportedLanguage | null {
  const normalized = language.trim().toLowerCase();
  const resolved = LANGUAGE_ALIASES[normalized] ?? normalized;
  return SUPPORTED_LANGUAGE_SET.has(resolved) ? (resolved as SupportedLanguage) : null;
}

function themeName(theme: ThemeInput): string {
  return typeof theme === "string" ? theme : (theme.name ?? "custom");
}

function cacheKey(code: string, language: SupportedLanguage, themes: [ThemeInput, ThemeInput]): string {
  const prefix = code.slice(0, 100);
  const suffix = code.length > 100 ? code.slice(-100) : "";
  return `${language}:${themeName(themes[0])}:${themeName(themes[1])}:${code.length}:${prefix}:${suffix}`;
}

async function loadHighlighter() {
  const [
    { createHighlighterCore },
    { createJavaScriptRegexEngine },
    javascript,
    jsx,
    typescript,
    tsx,
    json,
    python,
    shellscript,
    markdown,
    html,
    css,
    latex,
    githubLight,
    githubDark,
  ] = await Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("shiki/langs/javascript.mjs"),
    import("shiki/langs/jsx.mjs"),
    import("shiki/langs/typescript.mjs"),
    import("shiki/langs/tsx.mjs"),
    import("shiki/langs/json.mjs"),
    import("shiki/langs/python.mjs"),
    import("shiki/langs/shellscript.mjs"),
    import("shiki/langs/markdown.mjs"),
    import("shiki/langs/html.mjs"),
    import("shiki/langs/css.mjs"),
    import("shiki/langs/latex.mjs"),
    import("shiki/themes/github-light.mjs"),
    import("shiki/themes/github-dark.mjs"),
  ]);

  return createHighlighterCore({
    engine: createJavaScriptRegexEngine({ forgiving: true }),
    langs: [
      ...javascript.default,
      ...jsx.default,
      ...typescript.default,
      ...tsx.default,
      ...json.default,
      ...python.default,
      ...shellscript.default,
      ...markdown.default,
      ...html.default,
      ...css.default,
      ...latex.default,
    ],
    themes: [githubLight.default, githubDark.default],
  });
}

let highlighterPromise: ReturnType<typeof loadHighlighter> | undefined;

function getHighlighter() {
  highlighterPromise ??= loadHighlighter();
  return highlighterPromise;
}

export const curatedCodeHighlighter: CodeHighlighterPlugin = {
  name: "shiki",
  type: "code-highlighter",
  getSupportedLanguages: () => [...SUPPORTED_LANGUAGES],
  getThemes: () => DEFAULT_THEMES,
  supportsLanguage: (language) => normalizeLanguage(language) !== null,
  highlight({ code, language, themes }, callback) {
    const normalizedLanguage = normalizeLanguage(language);
    if (!normalizedLanguage) {
      return null;
    }

    const key = cacheKey(code, normalizedLanguage, themes);
    const cached = resultCache.get(key);
    if (cached) {
      return cached;
    }

    if (callback) {
      const callbacks = pendingCallbacks.get(key) ?? new Set();
      callbacks.add(callback);
      pendingCallbacks.set(key, callbacks);
    }

    if (!inFlightHighlights.has(key)) {
      inFlightHighlights.add(key);
      void getHighlighter()
        .then((highlighter) =>
          highlighter.codeToTokens(code, {
            lang: normalizedLanguage,
            themes: {
              light: themeName(themes[0]),
              dark: themeName(themes[1]),
            },
          }),
        )
        .then((result) => {
          resultCache.set(key, result);
          pendingCallbacks.get(key)?.forEach((notify) => notify(result));
          pendingCallbacks.delete(key);
          inFlightHighlights.delete(key);
        })
        .catch((error: unknown) => {
          console.error("[Streamdown Code] Failed to highlight code:", error);
          pendingCallbacks.delete(key);
          inFlightHighlights.delete(key);
        });
    }

    return null;
  },
};
