import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const settingsSource = readFileSync(
  "src/renderer-react/src/features/desktop/settings/ProblemBankSettings.tsx",
  "utf8",
);
const generalSource = readFileSync(
  "src/renderer-react/src/features/desktop/settings/GeneralSettings.tsx",
  "utf8",
);
const cacheSettingsSource = readFileSync(
  "src/renderer-react/src/features/desktop/settings/ProblemBankCacheSettings.tsx",
  "utf8",
);

describe("problem-bank settings", () => {
  test("keeps cache storage controls on the general page", () => {
    expect(generalSource).toContain("<ProblemBankCacheSettings />");
    expect(cacheSettingsSource).toContain("cacheState.cacheDirectory");
    expect(cacheSettingsSource).toContain("api.openProblemBankCacheDirectory()");
    expect(cacheSettingsSource).toContain("api.clearProblemBankCache()");
    expect(settingsSource).not.toContain("settings.problemBankCacheTitle");
  });

  test("loads and manages the cached cloud catalog on the settings page", () => {
    expect(settingsSource).toContain("api.getProblemBankCatalog()");
    expect(settingsSource).toContain("api.syncProblemBankMetadata()");
    expect(settingsSource).toContain("<CloudProblemSetRow");
  });

  test("offers a right-aligned resumable download action for each cloud problem bank", () => {
    expect(settingsSource).toContain("api.getProblemBankDownloadStates()");
    expect(settingsSource).toContain("api.downloadProblemBank(bankSlug)");
    expect(settingsSource).toContain("api.onProblemBankDownloadState");
    expect(settingsSource).toContain('className="settings-problem-set-actions"');
    expect(settingsSource).toContain('t("settings.problemBankResumeDownload")');
  });

  test("requires confirmation before clearing cached problem-bank data", () => {
    expect(cacheSettingsSource).toContain("setClearDialogOpen(true)");
    expect(cacheSettingsSource).toContain("<Dialog open={clearDialogOpen}");
    expect(cacheSettingsSource).toContain('t("settings.problemBankClearCacheDescription")');
  });
});
