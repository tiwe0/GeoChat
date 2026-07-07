import { describe, expect, test } from "bun:test";
import { BUILTIN_AGENT_SKILL_NAMES, DEFAULT_BUSINESS_AGENT_SKILL_NAMES } from "../src/renderer/src/desktop-config";
import {
  activateAgentSkill,
  filterBusinessReadyAgentSkills,
  formatSkillCatalogPrompt,
  listAvailableAgentSkills
} from "../backend/src/agent/skills";

const isolatedSkillEnv = {
  ...process.env,
  GEOCHAT_SKILLS_DIR: "",
  GEOCHAT_SKILLS_DIRS: "",
  GEOCHAT_REMOTE_SKILL_MANIFEST_URLS: "",
  GEOCHAT_REMOTE_SKILLS_MANIFEST_URLS: "",
  GEOCHAT_REMOTE_SKILLS_CACHE_DIR: "",
  GEOCHAT_REMOTE_SKILLS_CACHE_DIRS: "",
  GEOCHAT_BUNDLED_SKILLS_DIRS: "",
  GEOCHAT_DESKTOP_RESOURCE_ROOT: ""
};

describe("built-in Agent Skill catalog", () => {
  test("keeps renderer defaults aligned with backend built-ins", async () => {
    const builtIns = await listAvailableAgentSkills(isolatedSkillEnv);
    const backendNames = builtIns
      .filter((skill) => skill.source === "built-in")
      .map((skill) => skill.name)
      .sort();

    expect([...BUILTIN_AGENT_SKILL_NAMES].sort()).toEqual(backendNames);
  });

  test("keeps default business skills aligned with mature backend skills", async () => {
    const builtIns = await listAvailableAgentSkills(isolatedSkillEnv);
    const businessReadyNames = filterBusinessReadyAgentSkills(builtIns)
      .filter((skill) => skill.source === "built-in")
      .map((skill) => skill.name)
      .sort();

    expect([...DEFAULT_BUSINESS_AGENT_SKILL_NAMES].sort()).toEqual(businessReadyNames);
    expect(builtIns.filter((skill) => skill.maturity === "draft").map((skill) => skill.name).sort()).toEqual([
      "camera-framing",
      "viewport-scale-composition",
      "visual-post-processing"
    ]);
  });

  test("loads built-in skills from folder SKILL.md sources", async () => {
    const builtIns = await listAvailableAgentSkills(isolatedSkillEnv);

    expect(builtIns.length).toBeGreaterThan(0);
    expect(builtIns.every((skill) => skill.source === "built-in")).toBe(true);
    expect(builtIns.every((skill) => skill.path.includes("/builtin-skills/"))).toBe(true);
    for (const skill of builtIns) {
      const activated = await activateAgentSkill(skill.name, isolatedSkillEnv);
      expect(activated.resources.every((resource) => !resource.path.endsWith("SKILL.md"))).toBe(true);
      expect(activated.markdown).toContain("---");
      expect(activated.markdown).toContain(`name: ${skill.name}`);
    }
  });

  test("covers middle and high school first-layer math domains", async () => {
    const builtIns = await listAvailableAgentSkills(isolatedSkillEnv);
    const categories = new Set(builtIns.map((skill) => skill.category));

    for (const category of [
      "middle-school-number-algebra",
      "middle-high-school-algebra",
      "middle-high-school-functions",
      "middle-school-geometry",
      "high-school-plane-geometry",
      "high-school-solid-geometry",
      "high-school-functions",
      "high-school-analytic-geometry",
      "high-school-calculus",
      "middle-high-school-statistics-probability"
    ]) {
      expect(categories.has(category)).toBe(true);
    }
  });

  test("includes second-layer skills with parent links", async () => {
    const builtIns = await listAvailableAgentSkills(isolatedSkillEnv);
    const secondLayer = builtIns.filter((skill) => skill.level === 2);
    const secondLayerNames = new Set(secondLayer.map((skill) => skill.name));

    for (const name of [
      "factorization-formulas",
      "quadratic-equation",
      "inequality-interval",
      "quadratic-function",
      "triangle-circle-geometry",
      "solid-section",
      "pyramid-circumsphere",
      "conic-focus-directrix",
      "classical-probability",
      "statistical-distribution"
    ]) {
      expect(secondLayerNames.has(name)).toBe(true);
    }
    expect(secondLayer.length).toBeGreaterThanOrEqual(15);
    expect(secondLayer.every((skill) => Boolean(skill.parent))).toBe(true);
  });

  test("attaches third-layer task recipes to every built-in skill without enabling draft macros by default", async () => {
    const builtIns = await listAvailableAgentSkills(isolatedSkillEnv);

    expect(builtIns.every((skill) => skill.recipes.length > 0)).toBe(true);
    expect(builtIns.find((skill) => skill.name === "pyramid-circumsphere")?.recipes).toEqual([
      "base-circumcenter-axis",
      "equal-distance-center-solve",
      "radius-right-triangle"
    ]);
    expect(builtIns.every((skill) => skill.advancedTools.length === 0)).toBe(true);
  });

  test("warns 3D section skills to verify actual GeoGebra labels before styling", async () => {
    const prism = await activateAgentSkill("prism", isolatedSkillEnv);
    const solidSection = await activateAgentSkill("solid-section", isolatedSkillEnv);
    const solidGeometry = await activateAgentSkill("solid-geometry", isolatedSkillEnv);

    expect(solidGeometry?.markdown).toContain("3D 图必须按教材图标准组织");
    expect(solidGeometry?.markdown).toContain("#0072B2");
    expect(prism?.markdown).toContain("三棱柱/棱柱图的最低视觉标准");
    expect(prism?.markdown).toContain("先画 9 条骨架棱线，再画半透明面体");
    expect(prism?.markdown).toContain("截面高亮");
    expect(prism?.markdown).toContain("避免渐变色");
    expect(prism?.markdown).toContain("确认实际 polygon3d/point3d label 后再高亮");
    expect(solidSection?.markdown).toContain("GeoGebra 可能生成 section_{1}");
    expect(solidSection?.markdown).toContain("不要直接样式化左侧赋值名");
  });

  test("keeps unit-circle skills explicit about counterclockwise angle order", async () => {
    const trigonometricFunction = await activateAgentSkill("trigonometric-function", isolatedSkillEnv);
    const unitCircle = await activateAgentSkill("trigonometric-unit-circle", isolatedSkillEnv);

    expect(trigonometricFunction?.markdown).toContain("Angle(XaxisRef, O, Pθ)");
    expect(trigonometricFunction?.markdown).toContain("逆时针顺序");
    expect(trigonometricFunction?.markdown).toContain("#0072B2");
    expect(unitCircle?.markdown).toContain("Angle(XaxisRef, O, Pθ)");
    expect(unitCircle?.markdown).toContain("不要用无限延伸直线");
    expect(unitCircle?.markdown).toContain("推荐语义配色");
  });

  test("includes post-processing skills for camera and viewport adjustments", async () => {
    const builtIns = await listAvailableAgentSkills(isolatedSkillEnv);
    const postProcessing = builtIns.filter((skill) => skill.category === "visual-post-processing");
    const names = new Set(postProcessing.map((skill) => skill.name));
    const visualPost = await activateAgentSkill("visual-post-processing", isolatedSkillEnv);
    const camera = await activateAgentSkill("camera-framing", isolatedSkillEnv);
    const viewport = await activateAgentSkill("viewport-scale-composition", isolatedSkillEnv);

    expect(names).toEqual(new Set(["camera-framing", "viewport-scale-composition", "visual-post-processing"]));
    expect(builtIns.find((skill) => skill.name === "camera-framing")?.parent).toBe("visual-post-processing");
    expect(builtIns.find((skill) => skill.name === "viewport-scale-composition")?.parent).toBe("visual-post-processing");
    expect(visualPost.markdown).toContain("主体数学构造完成后");
    expect(camera.markdown).toContain("斜视角");
    expect(camera.markdown).toContain("SetAxesRatio");
    expect(viewport.markdown).toContain("CenterView");
    expect(viewport.markdown).toContain("2D 函数图像");
    expect(viewport.markdown).toContain("SetAxesRatio(1, 1, 1)");
  });

  test("describes the list/search/load skill workflow", async () => {
    const builtIns = await listAvailableAgentSkills(isolatedSkillEnv);
    const prompt = formatSkillCatalogPrompt(builtIns, "zh-CN");
    const promptEn = formatSkillCatalogPrompt(builtIns, "en-US");

    expect(prompt).toContain("recipes=");
    expect(prompt).toContain("maturity=");
    expect(prompt).toContain("draft 技能及其高级绘图命令仍是实验内容");
    expect(prompt).toContain("Skill 表示数学能力，Recipe 表示题型策略，Visual Profile 表示呈现策略");
    expect(prompt).toContain("先调用 listSkills 或 searchSkills");
    expect(prompt).toContain("调用 loadSkill");
    expect(prompt).toContain("判断不需要技能也是允许的");
    expect(promptEn).toContain("recipes=");
    expect(promptEn).toContain("maturity=");
    expect(promptEn).toContain("draft skills and their advanced drawing commands are experimental");
    expect(promptEn).toContain("skills describe math capability, recipes describe task-type strategy");
    expect(promptEn).toContain("call listSkills or searchSkills");
    expect(promptEn).toContain("call loadSkill");
    expect(promptEn).toContain("no skill is needed");
  });
});
