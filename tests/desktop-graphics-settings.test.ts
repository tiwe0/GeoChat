import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("desktop graphics settings", () => {
  const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../src-tauri/src/settings.rs", import.meta.url), "utf8");
  const general = readFileSync(
    new URL("../src/renderer-react/src/features/desktop/settings/GeneralSettings.tsx", import.meta.url),
    "utf8"
  );

  test("hardware acceleration defaults to enabled and is applied before showing the window", () => {
    expect(settings).toContain("hardware_acceleration: true");
    expect(main).toContain("apply_linux_hardware_acceleration(&window, hardware_acceleration_enabled)?");
    expect(main.indexOf("apply_linux_hardware_acceleration(&window, hardware_acceleration_enabled)?"))
      .toBeLessThan(main.indexOf("show_main_window(app);"));
  });

  test("Windows disables GPU only when the persisted preference is off", () => {
    expect(main).toContain("if hardware_acceleration_enabled");
    expect(main).toContain("--disable-gpu --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
  });

  test("the General page exposes the native preference without pretending managed platforms are configurable", () => {
    expect(general).toContain("<GraphicsSection />");
    expect(general).toContain("!status.configurable");
    expect(general).toContain('t("settings.hardwareAccelerationRestart")');
  });

  test("places problem bank cache and hardware acceleration at the bottom", () => {
    expect(general.indexOf("<McpSection mcp={mcp} />"))
      .toBeLessThan(general.indexOf("<ProblemBankCacheSettings />"));
    expect(general.indexOf("<ProblemBankCacheSettings />"))
      .toBeLessThan(general.indexOf("<GraphicsSection />"));
  });
});
