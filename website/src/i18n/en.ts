import type { Content } from "./types";

export const en: Content = {
  htmlLang: "en",
  isCJK: false,

  nav: {
    skipToContent: "Skip to content",
    features: "What it does",
    how: "How it works",
    download: "Download",
    source: "Source",
    switchTo: "中文",
    switchToLabel: "切换到中文"
  },

  hero: {
    given: "Given",
    construct: "Construct",
    conclude: "Conclude",
    lede: "GeoChat puts an AI assistant and GeoGebra in one desktop math tool. Enter a problem and it plans the construction, writes GeoGebra commands into the canvas, and explains the reasoning behind each step.",
    ctaDownload: "Download for desktop",
    ctaDownloadFor: "Download for {platform}",
    ctaDemo: "Watch it run",
    metaLicense: "Apache-2.0, open source",
    metaLocal: "Your data stays local",
    metaPlatforms: "macOS and Windows",
    figureAlt:
      "Animated straightedge-and-compass construction: points A, B and C are placed in black, blue perpendicular bisectors sweep out and meet at circumcenter O, and a red circumcircle closes."
  },

  legend: {
    title: "Legend",
    ink: "What is given or stated",
    construct: "The construction in progress",
    result: "What is concluded"
  },

  selling: {
    title: "What GeoChat does",
    lede: "These are the features currently supported in the desktop app.",
    items: [
      {
        id: "local",
        role: "ink",
        title: "Your data stays on your machine",
        body: "Conversations, canvas state and run history are saved to a SQLite file on your own disk. No account and no cloud sync.",
        literal: "./data/geochat-desktop.sqlite"
      },
      {
        id: "byok",
        role: "ink",
        title: "Bring your own model key",
        body: "Add your model provider's API key in settings. Requests go directly from your machine to that provider, without passing through GeoChat.",
        literal: "OpenAI · Anthropic · Google · DeepSeek · Alibaba · OpenRouter"
      },
      {
        id: "real-construction",
        role: "construct",
        title: "Write commands into GeoGebra",
        body: "GeoChat writes real commands into the embedded GeoGebra canvas. The resulting figure can be dragged, measured, and edited further.",
        literal: "O = Intersect(m_1, m_2)"
      },
      {
        id: "canvas",
        role: "construct",
        title: "Plane and space, one canvas",
        body: "The GeoGebra runtime ships inside the app. Plane geometry, coordinate geometry, function graphs and solid geometry all use the same workspace."
      },
      {
        id: "reasoning",
        role: "result",
        title: "See every step",
        body: "The construction plan, tool calls and reasoning are shown in order so you can check them one by one."
      },
      {
        id: "export",
        role: "result",
        title: "Problem bank and export",
        body: "Import a local problem bank to work through sets in bulk, and export any canvas as a .ggb file that a student or colleague can open in their own GeoGebra.",
        literal: "*.ggb"
      }
    ]
  },

  pipeline: {
    title: "How a problem is completed on the canvas",
    lede: "Read, plan, write commands, explain. The desktop app handles all four stages; only model inference needs the network.",
    problem: "Given triangle ABC, construct its circumcircle.",
    scrollHint: "Keep scrolling",
    steps: [
      {
        label: "Read",
        caption: "Identify the given conditions, constraints and goal."
      },
      {
        label: "Plan",
        caption: "Choose the construction order and the geometric objects needed at each step."
      },
      {
        label: "Compile",
        caption: "Convert the construction plan into GeoGebra commands and write them into the canvas one by one.",
        code: [
          "A = (-3, -1)",
          "B = (3, -1)",
          "C = (1, 3)",
          "m_1 = PerpendicularBisector(A, B)",
          "m_2 = PerpendicularBisector(B, C)",
          "O = Intersect(m_1, m_2)",
          "k = Circle(O, A)",
          'SetCaption(O, "Circumcenter")'
        ]
      },
      {
        label: "Explain",
        caption: "Explain why these objects produce the requested result."
      }
    ]
  },

  demo: {
    title: "Full demo",
    lede: "From typed problem to finished figure, shown at real speed.",
    play: "Play the demo",
    posterAlt: "Cover frame of the GeoChat Desktop demo video",
    fallback: "Your browser cannot play this video."
  },

  shots: {
    title: "The desktop app",
    lede: "The canvas is the main view. The chat panel can be collapsed or moved, and model settings live in the app's local settings page.",
    alt: "GeoChat Desktop interface: a GeoGebra canvas on the left, a floating AI chat panel on the right."
  },

  closing: {
    title: "Install it, give it a problem",
    lede: "Open source, free, no sign-up. All you need to bring is an API key from a model provider.",
    cta: "Download for desktop",
    secondary: "Read the source on GitHub"
  },

  faq: {
    title: "Questions",
    items: [
      {
        q: "Does it need an internet connection?",
        a: "The canvas, database and other local features work offline. Only model inference needs the network; requests go directly from your machine to the provider you configured."
      },
      {
        q: "Does it cost anything?",
        a: "The app is free and open source under Apache-2.0. You pay your model provider for your own usage; that billing sits entirely with them, and we neither see it nor take a cut."
      },
      {
        q: "Do my problems get uploaded to you?",
        a: "No. We do not run a server that could receive them. Your problem is sent as a prompt to the model provider you configured, and that data is governed by their privacy policy."
      },
      {
        q: "Which model providers are supported?",
        a: "OpenAI, Anthropic, Google, DeepSeek, Alibaba Cloud and OpenRouter are configured out of the box, and you can add compatible custom providers and models in settings."
      },
      {
        q: "Is there a Linux build?",
        a: "The packaging pipeline currently produces macOS and Windows installers only. Linux works from source, and the repository has full build instructions."
      },
      {
        q: "Why does it say the developer cannot be verified?",
        a: "The installers are not code-signed. Signing means paying Apple and a certificate authority every year, which is hard to justify for a solo open-source project right now. The download page has the steps for both platforms."
      }
    ]
  },

  download: {
    title: "Download GeoChat Desktop",
    lede: "Free and open source, no account required. After installing, add your own model API key in settings and you are ready to go.",
    version: "Latest version",
    versionUnknown: "Latest version",
    released: "Released {date}",
    detected: "Looks like you are on {platform}",
    otherPlatforms: "Other platforms",
    platforms: {
      macos: {
        name: "macOS",
        requirement: "macOS 11 Big Sur or later · Apple silicon and Intel"
      },
      windows: {
        name: "Windows",
        requirement: "Windows 10 or later · requires the WebView2 runtime"
      },
      linux: {
        name: "Linux",
        requirement: "Needs WebKitGTK and the other Tauri dependencies",
        unavailable: "No prebuilt installer yet — build from source."
      }
    },
    downloadLabel: "Download",
    sizeLabel: "about {size}",
    checksums: "Checksums (SHA-256)",
    checksumsNote: "The installers are not code-signed, so a checksum is the only integrity check available. Use shasum -a 256 <file> on macOS, or certutil -hashfile <file> SHA256 on Windows.",
    loading: "Fetching the latest release…",
    error: "Could not load release information — GitHub may be rate-limiting.",
    errorAction: "Open GitHub Releases",
    unsigned: {
      title: "The first launch takes one extra step",
      lede: "The installers are not code-signed, so your system will stop and ask. That is not a sign anything is wrong with the file — you can confirm on GitHub Actions that it was built from this repository's source.",
      macos: [
        "Drag GeoChat into your Applications folder.",
        "In Applications, right-click GeoChat and choose Open — it must be Open from the context menu; a plain double-click will not work.",
        "Click Open again in the dialog that appears. From then on it launches normally."
      ],
      windows: [
        "Run the installer. If a blue “Windows protected your PC” dialog appears, click More info.",
        "Click the Run anyway button that appears.",
        "Follow the installer through to the end."
      ],
      why: "Why is it not signed?"
    },
    source: {
      title: "Build from source",
      body: "You will need Bun 1.3.11, a stable Rust toolchain, and the Tauri build dependencies for your platform. This is currently the route for Linux.",
      cta: "Read the build instructions"
    }
  },

  footer: {
    tagline: "A local-first AI workbench for visualizing mathematics.",
    product: "Product",
    legal: "Legal",
    privacy: "Privacy",
    terms: "Terms",
    source: "Source on GitHub",
    license: "Apache-2.0",
    author: "Built by Ivory",
    copyright: "© 2026 Ivory",
    noTracking: "This site sets no cookies and loads no tracking scripts."
  },

  privacy: {
    title: "Privacy",
    updated: "Last updated: 10 September 2026",
    lede: "Short version: this website collects nothing about you, and the desktop app keeps your data on your own computer. The details follow.",
    sections: [
      {
        heading: "This website",
        paragraphs: [
          "This site is a set of static pages. It sets no cookies, does not use localStorage to identify you, and loads no Google Analytics, no Baidu Tongji, and no other third-party tracking script or social tracking pixel.",
          "We run no backend for this site, so there is no database anywhere receiving, storing or analysing your personal information.",
          "The site is hosted on Cloudflare Pages. As with any web host, Cloudflare processes ordinary request information such as IP address and timestamp for security and service operation. That processing is governed by Cloudflare's own privacy policy; we neither access nor export it.",
          "The download page asks GitHub's public API for the latest release details. That request goes from your browser directly to GitHub and is governed by GitHub's privacy policy."
        ]
      },
      {
        heading: "The desktop app: where data lives",
        paragraphs: [
          "GeoChat Desktop is local-first. Your conversations, canvas state and run history are stored in a SQLite database file on your own computer, in the app's local data directory by default. None of it is uploaded to us — we have no server to upload it to.",
          "The model provider API keys you configure are stored in local desktop configuration on that machine, and are used only to make requests from your machine directly to that provider.",
          "The app has no account system. There is nothing to register, nothing to log into, and no cross-device sync."
        ]
      },
      {
        heading: "The desktop app: when it uses the network",
        paragraphs: [
          "Model requests. When you ask the assistant something, your problem, the conversation context and the canvas state needed to answer are sent as a prompt from your machine directly to the model provider you configured — OpenAI, Anthropic, Google, DeepSeek, Alibaba Cloud or OpenRouter, for example. That data is governed by that provider's privacy policy and your agreement with them. Please read their terms before entering an API key.",
          "Update checks. The app may contact GitHub to look for a newer version.",
          "Optional developer-configured endpoints. If you, as a developer, point the app at your own problem-bank, model-registry or debug endpoint through environment variables, it will contact the address you specified. This repository configures no such endpoint by default.",
          "Beyond the cases above, the app does not send data anywhere."
        ]
      },
      {
        heading: "What we do not do",
        paragraphs: [
          "We collect no usage statistics and no telemetry. We build no user profiles. We serve no advertising. We sell and share your information with nobody, for the simple reason that we do not have it.",
          "If any form of data reporting is ever added, it must be off by default, require you to switch it on deliberately, and state plainly what it would send. That is a product design principle, not just a promise in this document."
        ]
      },
      {
        heading: "Children's privacy",
        paragraphs: [
          "This product is for anyone learning or teaching mathematics. We collect no personal information from any user, and therefore do not knowingly collect personal information from children."
        ]
      },
      {
        heading: "Changes and contact",
        paragraphs: [
          "If this policy changes materially, the date at the top of this page will be updated. Because we hold no contact details for you, we cannot notify you individually — please check this page when you update the app.",
          "For any privacy question, email contact@ivory.cafe or open an issue on the GitHub repository."
        ]
      }
    ]
  },

  terms: {
    title: "Terms of Use",
    updated: "Last updated: 10 September 2026",
    lede: "GeoChat is an open-source project. By downloading or using it, you agree to the terms below.",
    sections: [
      {
        heading: "License and open source",
        paragraphs: [
          "GeoChat's own source code and documentation are licensed under the Apache License 2.0. The full terms are in the LICENSE and NOTICE files in the repository, and those files govern your rights and obligations.",
          "Subject to Apache-2.0, you are free to use, modify and distribute this software, including commercially."
        ]
      },
      {
        heading: "Third-party components",
        paragraphs: [
          "This software includes third-party components under their own licenses. The GeoGebra runtime deserves particular attention: it is not, and cannot be, relicensed as part of GeoChat's Apache-2.0 code, and it remains subject to GeoGebra's own license terms.",
          "If you intend to redistribute a build that contains the GeoGebra runtime, read THIRD_PARTY_NOTICES.md in the repository along with GeoGebra's official licensing terms, and satisfy yourself that your intended use is permitted. That is not a determination we can make on your behalf."
        ]
      },
      {
        heading: "Model services are yours to arrange",
        paragraphs: [
          "GeoChat provides no AI model service and resells no model capacity. You register with a model provider, obtain your own API key, and pay for your own usage.",
          "Your relationship with that provider is governed by your agreement with them. You are responsible for complying with their terms of use and for all requests made with your API key.",
          "Keep your API key safe. It is stored on your own device; we cannot read it, and we cannot revoke it or compensate you if it leaks."
        ]
      },
      {
        heading: "About the accuracy of AI output",
        paragraphs: [
          "This deserves its own section: AI-generated constructions, figures and explanations can be wrong. Mathematics is especially prone to reasoning that looks rigorous and does not hold.",
          "Do not use this software's output unchecked for teaching, examinations, marking, engineering calculations, or any other consequential purpose. The app shows you the construction steps and the tool calls precisely so that you can check them — please use that.",
          "We accept no liability for any consequence of relying on AI output."
        ]
      },
      {
        heading: "No warranty",
        paragraphs: [
          "This software is provided “as is”, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and non-infringement.",
          "To the maximum extent permitted by applicable law, the authors and copyright holders are not liable for any claim, damages or other liability, whether in an action of contract, tort or otherwise, arising from, out of or in connection with the software or its use. The complete disclaimer is in sections 7 and 8 of the Apache-2.0 license."
        ]
      },
      {
        heading: "Installers and code signing",
        paragraphs: [
          "The installers offered here are built automatically by GitHub Actions from the public repository source, and the build logs are public. They are not currently code-signed, which is why macOS and Windows show a security prompt on first launch.",
          "Please obtain installers only from this download page or the project's GitHub Releases page. We cannot vouch for builds distributed through any other channel."
        ]
      },
      {
        heading: "Changes and contact",
        paragraphs: [
          "These terms may be updated, and the date at the top of this page will change when they are. Continued use of the software constitutes acceptance of the updated terms.",
          "For any question, email contact@ivory.cafe or open an issue on the GitHub repository."
        ]
      }
    ]
  },

  notFound: {
    title: "No intersection on this path",
    body: "The page you are looking for does not exist, or has moved elsewhere.",
    cta: "Back to the start"
  }
};
