import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BUSINESS_AGENT_SKILL_NAMES,
  createDefaultDesktopConfig,
  DEFAULT_VISUAL_PROFILE,
  normalizeDesktopConfig,
  promptWithSkillPolicy
} from "../src/renderer/src/desktop-config";

describe("desktop Agent Skill configuration", () => {
  test("defaults older configs to enabled built-in skills", () => {
    const config = normalizeDesktopConfig({}, "zh-CN");

    expect(config.skills.enabled).toBe(true);
    expect(config.skills.autoActivate).toBe(true);
    expect(config.skills.enabledSkillNames).toEqual([...DEFAULT_BUSINESS_AGENT_SKILL_NAMES]);
    expect(config.skills.visualProfile).toBe(DEFAULT_VISUAL_PROFILE);
  });

  test("injects an authoritative disabled policy into the run prompt", () => {
    const config = {
      ...createDefaultDesktopConfig("en-US"),
      skills: {
        enabled: false,
        autoActivate: true,
        enabledSkillNames: ["plane-geometry"],
        visualProfile: "choice-comparison"
      }
    };

    const prompt = promptWithSkillPolicy("Draw a triangle.", config, "en-US");

    expect(prompt).toContain("[Agent Skill policy]");
    expect(prompt).toContain("Agent Skills are disabled for this run");
    expect(prompt).toContain("Do not call listSkills, searchSkills, loadSkill, or activateSkill");
  });

  test("injects the allowed skill list and auto-loading mode", () => {
    const config = {
      ...createDefaultDesktopConfig("zh-CN"),
      skills: {
        enabled: true,
        autoActivate: true,
        enabledSkillNames: ["solid-geometry", "sphere"],
        visualProfile: "spatial-3d"
      }
    };

    const prompt = promptWithSkillPolicy("画一个四面体外接球。", config, "zh-CN");

    expect(prompt).toContain("允许使用的技能：solid-geometry、sphere");
    expect(prompt).toContain("自动加载：开启");
    expect(prompt).toContain("可视化表达策略：spatial-3d");
    expect(prompt).toContain("Recipe 只用于题型策略");
    expect(prompt).toContain("临时选择器会在主 agent 运行前评估 listSkills、searchSkills 和 loadSkill");
    expect(prompt).toContain("主 agent 应优先使用该 packet");
  });
});
