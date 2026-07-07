import { render } from "solid-js/web";
import WorkbenchApp from "./WorkbenchApp";
import { installTauriDesktopBridge } from "./tauri-bridge";

void bootstrap();

async function bootstrap() {
  await installTauriDesktopBridge();
  render(() => <WorkbenchApp />, document.getElementById("root")!);
  void window.geochatDesktop?.markRendererReady().catch(() => undefined);
}
