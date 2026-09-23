import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const component = readFileSync(
  new URL("../src/renderer-react/src/features/desktop/settings/SkillsSettings.tsx", import.meta.url),
  "utf8"
);
const route = readFileSync(
  new URL("../backend/src/http/routes/skills.ts", import.meta.url),
  "utf8"
);

describe("skills settings", () => {
  test("loads the live backend catalog with a built-in fallback", () => {
    expect(component).toContain("fetchSkillCatalog(backendOrigin(), backendAuthToken()");
    expect(component).toContain("DEFAULT_BUSINESS_AGENT_SKILL_NAMES.map");
    expect(route).toContain("filterBusinessReadyAgentSkills(await listAvailableAgentSkills())");
    expect(route).not.toContain("path: skill.path");
  });

  test("persists the master switch, automatic matching, visual style, and allowed skills", () => {
    expect(component).toContain("enabled: event.target.checked");
    expect(component).toContain("autoActivate: event.target.checked");
    expect(component).toContain("visualProfile: event.target.value as VisualProfileName");
    expect(component).toContain("enabledSkillNames:");
    expect(component).toContain("persistDesktopConfig({ ...desktopConfig, skills: next })");
  });

  test("keeps the long catalog searchable and grouped", () => {
    expect(component).toContain("settings.skillsSearch");
    expect(component).toContain("const groupedSkills = useMemo");
    expect(component).toContain("settings-skill-group");
    expect(component).toContain("settings.skillsSelectAll");
    expect(component).toContain("settings.skillsClearAll");
  });
});
