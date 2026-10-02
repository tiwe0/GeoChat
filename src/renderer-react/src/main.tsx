import { createRoot } from "react-dom/client";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/noto-sans-sc/wght.css";
import "@fontsource-variable/nunito-sans/wght.css";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import App from "./App";
import "./styles.css";
import { initializeI18n } from "./i18n";
import { copilotTheme } from "./theme";
import { installTauriDesktopBridge, installedDesktopApi } from "../../shared/desktop/tauri-bridge";
import { desktopLogger } from "./features/desktop/desktopLogger";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import { bootstrapRendererStorage } from "./renderer-storage-bootstrap";
import { StartupFailure } from "./components/StartupFailure";
import { LegalAgreementGate } from "./features/legal/LegalAgreementGate";

const logger = createStructuredLogger("renderer.bootstrap");

const emotionCache = createCache({ key: "geochat-web" });

function rootElement() {
  const element = document.getElementById("root");
  if (!element) throw new Error("The renderer root element is unavailable");
  return element;
}

async function bootstrap() {
  await installTauriDesktopBridge();
  const desktopApi = installedDesktopApi();
  if (!desktopApi) throw new Error("The native desktop bridge is unavailable");
  await bootstrapRendererStorage(desktopApi);
  await initializeI18n();
  createRoot(rootElement()).render(
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={copilotTheme}>
        <CssBaseline />
        <MotionConfig reducedMotion="user">
          <LegalAgreementGate onExit={() => import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close())}>
            <App />
          </LegalAgreementGate>
        </MotionConfig>
      </ThemeProvider>
    </CacheProvider>,
  );
  void window.geochatDesktop?.markRendererReady().catch((error) => logger.warn("renderer_ready_signal_failed", "RENDERER_READY_SIGNAL_FAILED", { error }));
}

void bootstrap().catch((error) => {
  desktopLogger.error(error);
  createRoot(rootElement()).render(<StartupFailure error={error} />);
});
