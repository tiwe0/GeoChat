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
import { installWebPlatform } from "./platform-web";
import { installTauriDesktopBridge } from "../../shared/desktop/tauri-bridge";
import { loadDesktopRuntime } from "./features/desktop/runtime";
import { desktopLogger, installDesktopLogging } from "./features/desktop/desktopLogger";

installWebPlatform();
const emotionCache = createCache({ key: "geochat-web" });

async function bootstrap() {
  await installTauriDesktopBridge();
  installDesktopLogging();
  // Must precede the first render so the native chat transport receives the
  // backend URL selected by the desktop shell.
  await loadDesktopRuntime();
  await initializeI18n();
  createRoot(document.getElementById("root")!).render(
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={copilotTheme}>
        <CssBaseline />
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </ThemeProvider>
    </CacheProvider>,
  );
  // Tells the shell the renderer painted, which releases its splash state.
  void window.geochatDesktop?.markRendererReady().catch((error) => console.error("[ERROR] Failed to mark the renderer ready", error));
}

void bootstrap().catch((error) => {
  desktopLogger.error(error);
  document.getElementById("root")!.textContent = error instanceof Error ? error.message : String(error);
});
