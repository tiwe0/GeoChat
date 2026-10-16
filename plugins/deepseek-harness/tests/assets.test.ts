import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { loadBundledSkills } from "../src/assets.ts";
import { buildAssets } from "../scripts/build.mjs";

const unsupportedCardTools = [
  "showTeachingHint",
  "showSolutionSteps",
  "showAnimationGuide",
  "showSelectedElements",
  "showChoiceAnalysis",
  "createGeometryPlan"
];

let outputDirectory = "";

before(async () => {
  outputDirectory = await mkdtemp(join(tmpdir(), "dsh-geochat-assets-"));
  await buildAssets(outputDirectory);
});

after(async () => {
  if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
});

test("builds all business-ready GeoChat skills with namespaced identities", async () => {
  const files = await readdir(join(outputDirectory, "skills"));
  assert.equal(files.length, 55);
  assert.ok(files.every((fileName) => /^geochat-[a-z0-9-]+\.md$/.test(fileName)));

  const skills = loadBundledSkills({ skillsDirectory: join(outputDirectory, "skills") });
  assert.equal(skills.length, 55);
  assert.equal(new Set(skills.map((skill) => skill.name)).size, 55);
  assert.ok(skills.every((skill) => skill.name.startsWith("geochat-")));
  assert.ok(skills.every((skill) => skill.source === "bundled"));
  assert.ok(skills.every((skill) => !skill.content.startsWith("---")));
});

test("rewrites supported canvas tools and omits unavailable teaching-card tools", async () => {
  const filePath = join(outputDirectory, "skills", "geochat-native-expression-modeling.md");
  const markdown = await readFile(filePath, "utf8");
  const frontmatterEnd = markdown.indexOf("\n---", 4);
  const frontmatter = markdown.slice(0, frontmatterEnd);

  assert.match(frontmatter, /^name: geochat-native-expression-modeling$/m);
  assert.match(frontmatter, /geochat_getCanvasContext/);
  assert.match(frontmatter, /geochat_search_commands/);
  assert.match(frontmatter, /geochat_executeGeoGebraCommands/);
  assert.match(frontmatter, /geochat_inspectGeoGebraObjects/);
  for (const toolName of unsupportedCardTools) assert.doesNotMatch(frontmatter, new RegExp(toolName));

  assert.match(markdown, /# 原生表达式与条件建模/);
  assert.match(markdown, /Harness 正常回复中呈现这些内容/);
  assert.match(markdown, /geochat-piecewise-domain-function/);
  assert.doesNotMatch(markdown, /(?<!geochat_)\bgetCanvasContext\b/);
  assert.doesNotMatch(markdown, /(?<!geochat_)\bsearchGeoGebraCommands\b/);

  const files = await readdir(join(outputDirectory, "skills"));
  for (const fileName of files) {
    const generated = await readFile(join(outputDirectory, "skills", fileName), "utf8");
    const generatedFrontmatterEnd = generated.indexOf("\n---", 4);
    const generatedFrontmatter = generated.slice(0, generatedFrontmatterEnd);
    for (const toolName of unsupportedCardTools) {
      assert.doesNotMatch(generatedFrontmatter, new RegExp(toolName), `${fileName} exposes ${toolName}`);
      assert.doesNotMatch(generated, new RegExp(toolName), `${fileName} references unavailable ${toolName}`);
    }
  }
});

test("loads skills in deterministic order with runtime registration metadata", () => {
  const skills = loadBundledSkills({ skillsDirectory: join(outputDirectory, "skills") });
  const names = skills.map((skill) => skill.name);
  assert.deepEqual(names, [...names].sort());
  assert.ok(skills.every((skill) => skill.metadata.provider === "dsh-geochat-plugin"));
  assert.ok(skills.every((skill) => skill.invocation.modelInvocable));
  assert.ok(skills.every((skill) => skill.invocation.userInvocable));
});

test("all generated skills teach capture timing and distinguish visual checks from numerical proof", async () => {
  const skills = loadBundledSkills({ skillsDirectory: join(outputDirectory, "skills") });
  for (const skill of skills) {
    assert.match(skill.content, /geochat_capture_canvas/, skill.name);
    assert.match(skill.content, /图片附件/, skill.name);
    assert.match(skill.content, /样式调整/, skill.name);
    assert.match(skill.content, /不替代.*数值/, skill.name);
    assert.doesNotMatch(skill.content, /geochat_getPNGBase64/, skill.name);
    for (const tool of [
      "geochat_sceneReport",
      "geochat_checkLayout",
      "geochat_setTextStyle",
      "geochat_captureFrames"
    ]) {
      assert.ok(skill.content.includes(tool), `${skill.name}: ${tool}`);
    }
    assert.match(skill.content, /coverage.*未覆盖不能当作通过/, skill.name);
  }
});

test("preserves native continuous animation guidance without bridge workarounds", async () => {
  const animation = await readFile(join(outputDirectory, "skills", "geochat-mathematical-animation-design.md"), "utf8");
  assert.match(animation, /continuous/);
  assert.match(animation, /mode: "continuous"/);
  assert.match(animation, /每 20 秒/);
  assert.doesNotMatch(animation, /当前桥接没有无限增长模式|这只是一个周期的有限预览/);
  assert.match(animation, /不承诺刷新恢复/);
});
