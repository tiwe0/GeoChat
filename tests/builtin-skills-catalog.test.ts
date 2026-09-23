import { describe, expect, test } from "bun:test";
import { BUILTIN_AGENT_SKILL_NAMES, DEFAULT_BUSINESS_AGENT_SKILL_NAMES } from "../src/shared/desktop/desktop-config";
import {
  activateAgentSkill,
  filterBusinessReadyAgentSkills,
  formatSkillCatalogPrompt,
  listAvailableAgentSkills,
  searchAvailableAgentSkills
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
      "piecewise-domain-function",
      "dynamic-parameter-exploration",
      "triangle-circle-geometry",
      "dynamic-construction-validation",
      "solid-section",
      "parametric-surface-revolution",
      "pyramid-circumsphere",
      "conic-focus-directrix",
      "parametric-polar-curves",
      "locus-envelope",
      "list-driven-construction",
      "classical-probability",
      "statistical-distribution",
      "regression-model-diagnostics",
      "geometric-theorem-verification",
      "cas-graphics-workflow",
      "spreadsheet-data-workflow",
      "construction-protocol-presentation",
      "interactive-controls-workflow",
      "object-view-layer-management",
      "dynamic-worksheet-authoring",
      "dynamic-text-feedback",
      "visual-style-system",
      "mathematical-animation-design"
    ]) {
      expect(secondLayerNames.has(name)).toBe(true);
    }
    expect(secondLayer.length).toBeGreaterThanOrEqual(15);
    expect(secondLayer.every((skill) => Boolean(skill.parent))).toBe(true);
  });

  test("includes common and expert GeoGebra workflows with explicit safety and validation rules", async () => {
    const piecewise = await activateAgentSkill("piecewise-domain-function", isolatedSkillEnv);
    const dynamic = await activateAgentSkill("dynamic-parameter-exploration", isolatedSkillEnv);
    const dragTest = await activateAgentSkill("dynamic-construction-validation", isolatedSkillEnv);
    const curves = await activateAgentSkill("parametric-polar-curves", isolatedSkillEnv);
    const locus = await activateAgentSkill("locus-envelope", isolatedSkillEnv);
    const lists = await activateAgentSkill("list-driven-construction", isolatedSkillEnv);
    const regression = await activateAgentSkill("regression-model-diagnostics", isolatedSkillEnv);
    const theorem = await activateAgentSkill("geometric-theorem-verification", isolatedSkillEnv);
    const surface = await activateAgentSkill("parametric-surface-revolution", isolatedSkillEnv);

    expect(piecewise.markdown).toContain("Function(f, a, b)");
    expect(piecewise.markdown).toContain("空心/实心端点");
    expect(dynamic.markdown).toContain("预测—观察—解释");
    expect(dynamic.markdown).toContain("不生成任意 JavaScript");
    expect(dragTest.markdown).toContain("欠约束");
    expect(dragTest.markdown).toContain("过约束");
    expect(curves.markdown).toContain("Curve(x(t), y(t), t, a, b)");
    expect(locus.markdown).toContain("额外分支");
    expect(lists.markdown).toContain("不通过 `Execute`");
    expect(regression.markdown).toContain("ResidualPlot");
    expect(theorem.markdown).toContain("`undefined` 只表示系统未能判定");
    expect(surface.markdown).toContain("WebGL");
  });

  test("finds the expanded workflows from natural Chinese task descriptions", async () => {
    const cases = [
      ["画分段函数并检查空心实心端点", "piecewise-domain-function"],
      ["让一个滑块控制完整的动态演示", "dynamic-parameter-exploration"],
      ["拖动顶点验证构造不会变形", "dynamic-construction-validation"],
      ["绘制极坐标参数曲线并求切线", "parametric-polar-curves"],
      ["求动点轨迹和直线族包络", "locus-envelope"],
      ["用 Sequence 和 Zip 批量生成点列", "list-driven-construction"],
      ["比较回归模型的残差与 R 方", "regression-model-diagnostics"],
      ["用符号方法验证共圆命题", "geometric-theorem-verification"],
      ["把母线绕轴旋转生成参数曲面", "parametric-surface-revolution"]
    ] as const;

    for (const [query, expectedName] of cases) {
      const results = await searchAvailableAgentSkills({ query, limit: 5 }, isolatedSkillEnv);
      expect(results.map((result) => result.name)).toContain(expectedName);
    }
  });

  test("includes coordinated GeoGebra software workflows with capability fallbacks", async () => {
    const multiView = await activateAgentSkill("multi-view-coordination", isolatedSkillEnv);
    const cas = await activateAgentSkill("cas-graphics-workflow", isolatedSkillEnv);
    const spreadsheet = await activateAgentSkill("spreadsheet-data-workflow", isolatedSkillEnv);
    const protocol = await activateAgentSkill("construction-protocol-presentation", isolatedSkillEnv);
    const controls = await activateAgentSkill("interactive-controls-workflow", isolatedSkillEnv);
    const layers = await activateAgentSkill("object-view-layer-management", isolatedSkillEnv);
    const worksheet = await activateAgentSkill("dynamic-worksheet-authoring", isolatedSkillEnv);
    const feedback = await activateAgentSkill("dynamic-text-feedback", isolatedSkillEnv);
    const visualStyle = await activateAgentSkill("visual-style-system", isolatedSkillEnv);
    const animation = await activateAgentSkill("mathematical-animation-design", isolatedSkillEnv);

    expect(multiView.category).toBe("geogebra-workflow");
    expect(multiView.markdown).toContain("共享同一构造依赖");
    expect(multiView.markdown).toContain("不声称切换成功");
    expect(cas.markdown).toContain("图形近似不能替代证明");
    expect(spreadsheet.markdown).toContain("自由副本");
    expect(protocol.markdown).toContain("SetConstructionStep");
    expect(controls.markdown).toContain("默认不生成任意 JavaScript");
    expect(layers.markdown).toContain("图层只负责显示与命中顺序");
    expect(worksheet.markdown).toContain("一概念、一主视图、一屏完成");
    expect(worksheet.markdown).toContain("窄窗口");
    expect(feedback.markdown).toContain("FractionText");
    expect(feedback.markdown).toContain("不用红绿颜色作为唯一的正误区分");
    expect(visualStyle.markdown).toContain("颜色只承担一种稳定语义");
    expect(visualStyle.markdown).toContain("#0072B2");
    expect(visualStyle.markdown).toContain("无颜色检查");
    expect(animation.markdown).toContain("默认不自动播放");
    expect(animation.markdown).toContain("一次递增");
    expect(animation.markdown).toContain("暂停、继续和重置");
  });

  test("finds software-use skills from natural Chinese task descriptions", async () => {
    const cases = [
      ["把代数视图表格和两个图形窗口同步起来", "multi-view-coordination"],
      ["在 CAS 推导后同步到图形检查定义域", "cas-graphics-workflow"],
      ["用电子表格相对引用批量生成数据点", "spreadsheet-data-workflow"],
      ["打开构造协议逐步回放尺规作图", "construction-protocol-presentation"],
      ["用输入框复选框和下拉列表制作控制面板", "interactive-controls-workflow"],
      ["把辅助对象分图层并只在图形2显示", "object-view-layer-management"],
      ["把动态课件整理成手机上也能操作的单屏布局", "dynamic-worksheet-authoring"],
      ["用动态公式和文字做不只靠颜色的正误反馈", "dynamic-text-feedback"],
      ["统一几何图的配色线型标签和视觉层级", "visual-style-system"],
      ["制作可以播放暂停重置的单时间轴数学动画", "mathematical-animation-design"]
    ] as const;

    for (const [query, expectedName] of cases) {
      const results = await searchAvailableAgentSkills({ query, limit: 5 }, isolatedSkillEnv);
      expect(results.map((result) => result.name)).toContain(expectedName);
    }
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
