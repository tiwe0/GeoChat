import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const settingsSourcePath = resolve(
  projectRoot,
  "src/renderer-react/src/features/desktop/settings/AboutSettings.tsx",
);

describe("settings production assets", () => {
  test("bundles settings images instead of addressing the application root", () => {
    const source = readFileSync(settingsSourcePath, "utf8");
    expect(source).not.toContain('src="/images/');
    expect(source).toContain('from "../../../assets/settings/geochat-about-banner.png"');
    expect(source).toContain('from "../../../assets/settings/thanks/author.jpg"');
    expect(source).toContain('from "../../../assets/settings/thanks/wechat.png"');

    for (const relativePath of [
      "src/renderer-react/src/assets/settings/geochat-about-banner.png",
      "src/renderer-react/src/assets/settings/thanks/author.jpg",
      "src/renderer-react/src/assets/settings/thanks/wechat.png",
    ]) {
      expect(existsSync(resolve(projectRoot, relativePath))).toBe(true);
    }
  });
});
