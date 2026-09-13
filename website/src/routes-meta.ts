import type { Locale } from "./i18n/types";

export type RouteKey = "home" | "download" | "privacy" | "terms";

/** Pages that have a URL, plus the 404 shell, which has metadata but no route. */
export type MetaKey = RouteKey | "notFound";

export type RouteMeta = {
  title: string;
  description: string;
};

/** Locale-independent path segment for each page. */
export const ROUTE_PATHS: Record<RouteKey, string> = {
  home: "/",
  download: "/download",
  privacy: "/privacy",
  terms: "/terms"
};

/**
 * Page titles and descriptions. These are read both by the running app (to set
 * document.title on client navigation) and by scripts/prerender.mjs (to write
 * real <title>/<meta> tags into the static HTML), so a share card and the
 * browser tab can never disagree.
 */
export const SEO: Record<Locale, Record<MetaKey, RouteMeta>> = {
  zh: {
    home: {
      title: "GeoChat — 本地优先的 AI 数学作图工作台",
      description:
        "输入一道数学题，GeoChat 生成构造步骤、写进内嵌的 GeoGebra 画板并讲清每一步。数据留在本机，用你自己的模型密钥，开源免费。"
    },
    download: {
      title: "下载 GeoChat 桌面版 — macOS 与 Windows",
      description:
        "免费下载 GeoChat 桌面版，支持 macOS 与 Windows。开源、无需注册，安装后填入你自己的模型 API key 即可使用。"
    },
    privacy: {
      title: "隐私政策 — GeoChat",
      description:
        "本站不使用 Cookie，不加载任何追踪脚本。GeoChat 桌面版把你的对话与画板数据保存在你自己的电脑上。"
    },
    terms: {
      title: "使用条款 — GeoChat",
      description:
        "GeoChat 采用 Apache-2.0 许可证。使用条款涵盖第三方组件、模型服务费用、AI 输出准确性与免责声明。"
    },
    notFound: {
      title: "页面不存在 — GeoChat",
      description: "你要找的页面不存在，或者已经移动到了别处。"
    }
  },
  en: {
    home: {
      title: "GeoChat — A local-first AI workbench for mathematics",
      description:
        "Describe a problem and GeoChat plans the construction, writes real commands into an embedded GeoGebra canvas, and explains each step. Local-first, bring your own model key, open source."
    },
    download: {
      title: "Download GeoChat Desktop — macOS and Windows",
      description:
        "Download GeoChat Desktop free for macOS and Windows. Open source, no account needed — add your own model API key after installing."
    },
    privacy: {
      title: "Privacy — GeoChat",
      description:
        "This site sets no cookies and loads no tracking scripts. GeoChat Desktop keeps your conversations and canvases on your own computer."
    },
    terms: {
      title: "Terms of Use — GeoChat",
      description:
        "GeoChat is licensed under Apache-2.0. These terms cover third-party components, model service costs, the accuracy of AI output, and warranty disclaimers."
    },
    notFound: {
      title: "Page not found — GeoChat",
      description: "The page you are looking for does not exist, or has moved elsewhere."
    }
  }
};

/** Every (locale, page) pair the prerenderer must emit. */
export function allRoutes(): Array<{ locale: Locale; key: RouteKey; url: string }> {
  const out: Array<{ locale: Locale; key: RouteKey; url: string }> = [];
  for (const locale of ["zh", "en"] as Locale[]) {
    for (const key of Object.keys(ROUTE_PATHS) as RouteKey[]) {
      const path = ROUTE_PATHS[key];
      const url =
        locale === "zh" ? path : path === "/" ? "/en" : `/en${path}`;
      out.push({ locale, key, url });
    }
  }
  return out;
}
