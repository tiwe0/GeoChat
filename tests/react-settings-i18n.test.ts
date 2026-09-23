import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { en } from "../src/renderer-react/src/i18n/locales/en";
import { zhCN } from "../src/renderer-react/src/i18n/locales/zh-CN";

/**
 * `t("some.key")` is a plain string to the compiler, so a typo in a key is
 * invisible to typecheck and surfaces as the raw key rendered in the UI.
 * These two checks close that gap for the desktop settings surface.
 */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

function resolve(dictionary: unknown, path: string) {
  return path.split(".").reduce<unknown>((node, part) => {
    if (typeof node !== "object" || node === null) return undefined;
    return (node as Record<string, unknown>)[part];
  }, dictionary);
}

const SOURCES = [
  "src/renderer-react/src/features/desktop/SettingsPanel.tsx",
  "src/renderer-react/src/features/desktop/UpdateSection.tsx",
  "src/renderer-react/src/features/desktop/settings/ModelSettings.tsx",
  "src/renderer-react/src/features/desktop/settings/ProblemBankSettings.tsx",
  "src/renderer-react/src/features/desktop/settings/SkillsSettings.tsx",
  "src/renderer-react/src/features/desktop/settings/ProblemBankCacheSettings.tsx",
  "src/renderer-react/src/features/desktop/settings/GeneralSettings.tsx",
  "src/renderer-react/src/features/desktop/settings/AboutSettings.tsx"
];

/** Keys the panel builds by interpolation, which the literal scan cannot see. */
const INTERPOLATED_KEYS = [
  "settings.tabs.model",
  "settings.tabs.problemBank",
  "settings.tabs.skills",
  "settings.tabs.general",
  "settings.tabs.about",
  "settings.tabDescriptions.model",
  "settings.tabDescriptions.problemBank",
  "settings.tabDescriptions.skills",
  "settings.tabDescriptions.general",
  "settings.tabDescriptions.about",
  "about.geogebraCredit",
  "about.gaokaoCredit",
  "about.conic10kCredit"
];

describe("react desktop settings i18n", () => {
  test("every settings key referenced by the panel exists in both locales", () => {
    const referenced = new Set<string>();
    for (const source of SOURCES) {
      const text = readFileSync(new URL(`../${source}`, import.meta.url), "utf8");
      for (const match of text.matchAll(/"((?:settings|about)\.[A-Za-z.]+)"/g)) referenced.add(match[1]!);
    }
    for (const key of INTERPOLATED_KEYS) referenced.add(key);
    expect(referenced.size).toBeGreaterThan(20);
    for (const key of referenced) {
      expect(typeof resolve(en, key), `${key} missing from en`).toBe("string");
      expect(typeof resolve(zhCN, key), `${key} missing from zh-CN`).toBe("string");
    }
  });

  test("the two locales carry the same settings and about keys", () => {
    expect(keyPaths(zhCN.settings).sort()).toEqual(keyPaths(en.settings).sort());
    expect(keyPaths(zhCN.about).sort()).toEqual(keyPaths(en.about).sort());
  });

  test("settings copy separates concise function hints from visible state", () => {
    expect(zhCN.settings.tabDescriptions).toEqual({
      model: "管理模型与供应商",
      problemBank: "管理题库与下载",
      skills: "管理技能",
      general: "管理应用选项",
      about: "查看版本与许可",
    });
    expect(en.settings.tabDescriptions).toEqual({
      model: "Manage models and providers",
      problemBank: "Manage problem banks and downloads",
      skills: "Manage skills",
      general: "Manage app options",
      about: "View version and licensing",
    });

    expect(zhCN.settings.customModelsDescription).toBe("添加并配置自定义模型");
    expect(en.settings.customModelsDescription).toBe("Add and configure custom models");
    expect(zhCN.settings.loggingDescription).toBe("保存本地运行日志");
    expect(en.settings.loggingDescription).toBe("Save local runtime logs");
    expect(zhCN.settings.tourDescription).toBe("查看主要功能介绍");
    expect(en.settings.tourDescription).toBe("Review the main controls");
    expect(zhCN.settings.mcpDescription).toBe("允许 MCP 客户端连接并操作画板");
    expect(en.settings.mcpDescription).toBe("Allow MCP clients to connect to and control the canvas");

    expect(zhCN.settings.loggingEnabled).toBe("记录中");
    expect(zhCN.settings.loggingDisabled).toBe("已关闭");
    expect(en.settings.loggingEnabled).toBe("Recording");
    expect(en.settings.loggingDisabled).toBe("Off");
    expect(zhCN.settings.keyValid).toBe("API 密钥有效");
    expect(en.settings.keyValid).toBe("API key is valid");
  });

  test("keeps destructive cache details in the confirmation instead of the section hint", () => {
    const source = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/settings/ProblemBankCacheSettings.tsx", import.meta.url),
      "utf8"
    );
    expect(zhCN.settings.problemBankCacheDescription).toBe("管理题库本地缓存");
    expect(en.settings.problemBankCacheDescription).toBe("Manage the local problem-bank cache");
    expect(source).toContain('description={t("settings.problemBankCacheDescription")}');
    expect(source.match(/t\("settings\.problemBankClearCacheDescription"\)/g)?.length).toBe(1);
  });

  test("keeps the empty Skills module between Problems and General", () => {
    const panel = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/SettingsPanel.tsx", import.meta.url),
      "utf8"
    );
    const skills = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/settings/SkillsSettings.tsx", import.meta.url),
      "utf8"
    );
    expect(panel).toContain('const TABS = ["model", "problemBank", "skills", "general", "about"] as const;');
    expect(panel).toContain('<SkillsSettings />');
    expect(skills).toContain('className="settings-page settings-skills-page"');
  });

  test("the acknowledgements include cortexsat", () => {
    const source = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/settings/AboutSettings.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain('{ name: "cortexsat" }');
  });

  test("general settings keeps secondary logging controls behind the enabled state", () => {
    const source = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/settings/GeneralSettings.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain("<SettingsDisclosure open={status.enabled}>");
    expect(source).toContain('className="settings-inline-controls settings-disclosure-controls"');
    expect(source).not.toContain("{status.logDirectory}");
  });

  test("all progressively revealed general settings use the shared disclosure motion", () => {
    const general = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/settings/GeneralSettings.tsx", import.meta.url),
      "utf8"
    );
    const update = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/UpdateSection.tsx", import.meta.url),
      "utf8"
    );
    const disclosure = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/settings/SettingsDisclosure.tsx", import.meta.url),
      "utf8"
    );
    expect(general.match(/<SettingsDisclosure /g)?.length).toBe(3);
    expect(update).toContain("<SettingsDisclosure open={!isLatest || downloading}>");
    expect(disclosure).toContain("<AnimatePresence initial={false}>");
    expect(disclosure).toContain('duration: 0.18');
    expect(disclosure).toContain("useReducedMotion()");
  });

  test("the compact update row checks explicitly instead of exposing the primary install action", () => {
    const source = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/UpdateSection.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain("update.check()");
    expect(source).toContain('t("settings.updateLatest", { version: currentVersion })');
    expect(source).not.toContain("update.runPrimaryAction()");
  });
});
