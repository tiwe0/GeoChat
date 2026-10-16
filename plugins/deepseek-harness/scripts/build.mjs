import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(packageDirectory, "../..");
const canonicalSkillsDirectory = join(repositoryDirectory, "backend/src/agent/builtin-skills");
const defaultOutputDirectory = join(packageDirectory, "dist");

const SUPPORTED_TOOL_NAMES = new Map([
  ["sceneReport", "geochat_sceneReport"],
  ["checkLayout", "geochat_checkLayout"],
  ["captureFrames", "geochat_captureFrames"],
  ["setTextStyle", "geochat_setTextStyle"],
  ["executeGeoGebraCommands", "geochat_executeGeoGebraCommands"],
  ["configureGeoGebraAnimation", "geochat_configureGeoGebraAnimation"],
  ["controlGeoGebraAnimation", "geochat_controlGeoGebraAnimation"],
  ["inspectGeoGebraObjects", "geochat_inspectGeoGebraObjects"],
  ["resetCanvas", "geochat_resetCanvas"],
  ["getCanvasContext", "geochat_getCanvasContext"],
  ["getPNGBase64", "geochat_capture_canvas"],
  ["setPerspective", "geochat_setPerspective"],
  ["getValue", "geochat_getValue"],
  ["getValueString", "geochat_getValueString"],
  ["setValue", "geochat_setValue"],
  ["exists", "geochat_exists"],
  ["getObjectType", "geochat_getObjectType"],
  ["searchGeoGebraCommands", "geochat_search_commands"]
]);

const UNSUPPORTED_TOOL_REPLACEMENTS = new Map([
  ["showTeachingHint", "在 Harness 回复中给出教学提示"],
  ["showSolutionSteps", "在 Harness 回复中给出解题步骤"],
  ["showAnimationGuide", "在 Harness 回复中说明动画操作"],
  ["showSelectedElements", "在 Harness 回复中说明需关注的对象"],
  ["showChoiceAnalysis", "在 Harness 回复中给出选项分析"],
  ["createGeometryPlan", "在 Harness 回复中先列出几何构造计划"]
]);

const ADAPTER_INSTRUCTIONS = `## DeepSeek Harness 适配说明

- 本技能中的 GeoChat 画布工具统一使用 \`geochat_\` 前缀；命令不确定时先调用 \`geochat_search_commands\`。
- 原 GeoChat 教学提示、解题步骤、选项分析、动画指南和选中元素卡片不是 Harness 工具；请直接在 Harness 正常回复中呈现这些内容。
- 画布由 Harness 原生插件中的 GeoGebra Applet 承载，不需要独立 GeoChat 桌面或 MCP。作图前先调用 \`geochat_open_canvas\` 主动打开当前对话右侧画布并等待就绪，重复调用不会清空已有构造。
- 完成构造或批量样式调整后，调用 \`geochat_capture_canvas\` 获取可直接查看的原生图片附件，检查颜色对比、标签重叠、遮挡、网格和布局；无需手动解码或将图片当文本读取。不要未经尝试就声称无法截图；如模型实际无法读取附件，明确说明限制，不能声称完成视觉验收。截图不替代定义、坐标、数值和动画状态验证，单帧也不证明动画连续性。
- 用 \`geochat_sceneReport\` 一次回读视口、样式和插件动画，缺失字段不等于零或通过。文字字号可用 \`geochat_setTextStyle\`（仅命名 text，不含点的普通标签）。\`geochat_checkLayout\` 通过临时探针检查 text/有限列表文字的真实容器框并清理，不覆盖所有标签或 3D 遮挡；检查 coverage，未覆盖不能当作通过。动画用 \`geochat_captureFrames\` 获取多帧图片附件，仍不能证明采样间绝对流畅。
- 不提供 JavaScript / XML 注入接口，拒绝命令目录标记为 \`risk:script-execution\` 的调用。已有对象更新仍可能触发原有脚本，本插件不是脚本沙箱。
- 支持 continuous 连续时间轴，但动画依赖当前浏览器页面存活，并受后台标签调度影响；不是后台常驻服务。画布仅在当前页面内存中保留，不承诺刷新恢复。取消或超时后不要自动重放写操作，应重新连接并检查画布。`;

function parseFrontmatter(markdown, fileName) {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "---") throw new Error(`Skill is missing frontmatter: ${fileName}`);
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingIndex < 0) throw new Error(`Skill has unterminated frontmatter: ${fileName}`);

  const fields = new Map();
  for (const line of lines.slice(1, closingIndex)) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (match) fields.set(match[1], unquoteScalar(match[2].trim()));
  }
  return {
    lines,
    closingIndex,
    fields,
    body: lines
      .slice(closingIndex + 1)
      .join("\n")
      .trim()
  };
}

function unquoteScalar(value) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  return (first === '"' && last === '"') || (first === "'" && last === "'") ? value.slice(1, -1) : value;
}

function parseInlineList(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((entry) => unquoteScalar(entry.trim()))
    .filter(Boolean);
}

function replaceNamespacedReferences(value, skillNames) {
  let result = value;
  for (const skillName of skillNames) {
    const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\\`${escaped}\\\``, "g"), `\`geochat-${skillName}\``);
  }
  for (const [sourceName, targetName] of SUPPORTED_TOOL_NAMES) {
    const escaped = sourceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "g"), targetName);
  }
  for (const [sourceName, replacement] of UNSUPPORTED_TOOL_REPLACEMENTS) {
    const escaped = sourceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\\`${escaped}\\\``, "g"), replacement);
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "g"), replacement);
  }
  return result;
}

async function readCanonicalSkills() {
  const directories = (await readdir(canonicalSkillsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const parsed = [];

  for (const directory of directories) {
    const fileName = join(canonicalSkillsDirectory, directory, "SKILL.md");
    const markdown = await readFile(fileName, "utf8");
    const skill = parseFrontmatter(markdown, fileName);
    const name = skill.fields.get("name")?.trim() ?? "";
    const description = skill.fields.get("description")?.trim() ?? "";
    const maturity = skill.fields.get("maturity")?.trim() ?? "default";
    if (!name || !description) throw new Error(`Skill requires name and description: ${fileName}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      throw new Error(`Skill has an invalid canonical name: ${fileName}`);
    }
    if (maturity !== "draft" && maturity !== "validated" && maturity !== "default") {
      throw new Error(`Skill has an invalid maturity: ${fileName}`);
    }
    parsed.push({ ...skill, name, description, maturity, fileName });
  }

  const names = new Set();
  for (const skill of parsed) {
    if (names.has(skill.name)) throw new Error(`Duplicate canonical skill name: ${skill.name}`);
    names.add(skill.name);
  }
  return parsed.filter((skill) => skill.maturity === "validated" || skill.maturity === "default");
}

function renderSkill(skill, skillNames) {
  const header = skill.lines.slice(1, skill.closingIndex).map((line) => {
    if (/^name:\s*/.test(line)) return `name: geochat-${skill.name}`;
    if (/^parent:\s*/.test(line)) {
      const parent = unquoteScalar(line.replace(/^parent:\s*/, "").trim());
      return parent ? `parent: geochat-${parent}` : line;
    }
    if (/^tools:\s*/.test(line)) {
      const tools = parseInlineList(line.replace(/^tools:\s*/, ""));
      const mapped = tools.map((tool) => SUPPORTED_TOOL_NAMES.get(tool)).filter(Boolean);
      return `tools: [${[...new Set(mapped)].join(", ")}]`;
    }
    return line;
  });
  if (!header.some((line) => /^maturity:\s*/.test(line))) {
    header.push(`maturity: ${skill.maturity}`);
  }
  const body = replaceNamespacedReferences(skill.body, skillNames);
  return `---\n${header.join("\n")}\n---\n\n${ADAPTER_INSTRUCTIONS}\n\n${body}\n`;
}

export async function buildAssets(outputDirectory = defaultOutputDirectory) {
  const skills = await readCanonicalSkills();
  const skillNames = skills.map((skill) => skill.name).sort((left, right) => right.length - left.length);
  const skillsOutputDirectory = join(outputDirectory, "skills");
  await rm(skillsOutputDirectory, { recursive: true, force: true });
  await mkdir(skillsOutputDirectory, { recursive: true });

  await Promise.all(
    skills.map((skill) =>
      writeFile(join(skillsOutputDirectory, `geochat-${skill.name}.md`), renderSkill(skill, skillNames), "utf8")
    )
  );
  return skills.map((skill) => `geochat-${skill.name}`);
}

export async function buildPlugin(outputDirectory = defaultOutputDirectory) {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const { build: esbuild } = await import("esbuild");

  await Promise.all([
    esbuild({
      entryPoints: [join(packageDirectory, "src/index.ts")],
      outfile: join(outputDirectory, "index.js"),
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      legalComments: "eof",
      external: [
        "@deepseek-ai/cordis",
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-attachment",
        "@deepseek-ai/dsh-skill",
        "@deepseek-ai/dsh-tools",
        "@deepseek-ai/schemastery",
        "@deepseek-ai/dsh-typert-protocol",
        "@deepseek-ai/dsh-typert-registry",
        "@deepseek-ai/dsh-host-webserver"
      ]
    }),
    esbuild({
      entryPoints: [join(packageDirectory, "client/index.tsx")],
      outfile: join(outputDirectory, "client.js"),
      bundle: true,
      platform: "browser",
      format: "cjs",
      target: "es2022",
      jsx: "automatic",
      define: { "import.meta.env.DEV": "false" },
      alias: {
        "@geochat-ai/app/functioncalls": join(
          repositoryDirectory,
          "packages/app/src/geogebra-command-normalization.ts"
        ),
        "@geochat-ai/app/structured-logger": join(repositoryDirectory, "packages/app/src/structured-logger.ts")
      },
      external: ["react", "react/jsx-runtime"],
      banner: {
        js: 'window.__ModuleLoader__.load({ id: "dsh-geochat-plugin", factory: (require) => { var module = {exports: {}}; var exports = module.exports;'
      },
      footer: { js: "return module.exports; }});" }
    }),
    buildAssets(outputDirectory),
    cp(join(repositoryDirectory, "src-tauri/icons/128x128.png"), join(outputDirectory, "icon.png")),
    cp(join(packageDirectory, "src/index.d.ts"), join(outputDirectory, "index.d.ts")),
    cp(join(repositoryDirectory, "LICENSE"), join(outputDirectory, "LICENSE")),
    cp(join(repositoryDirectory, "NOTICE"), join(outputDirectory, "NOTICE")),
    cp(join(repositoryDirectory, "THIRD_PARTY_NOTICES.md"), join(outputDirectory, "THIRD_PARTY_NOTICES.md")),
    bundleGeoGebra(outputDirectory)
  ]);
}

async function bundleGeoGebra(outputDirectory) {
  const source = join(outputDirectory, "geogebra");
  await cp(join(repositoryDirectory, "vendor/geogebra"), source, { recursive: true });
  const { build } = await import("esbuild");
  await build({
    entryPoints: [join(packageDirectory, "client/canvas-runtime.ts")],
    outfile: join(source, "geochat-runtime.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "GeoChatCanvasRuntime",
    target: "es2022",
    legalComments: "eof",
    define: { "import.meta.env.DEV": "false" },
    alias: {
      "@geochat-ai/app/functioncalls": join(repositoryDirectory, "packages/app/src/geogebra-command-normalization.ts"),
      "@geochat-ai/app/structured-logger": join(repositoryDirectory, "packages/app/src/structured-logger.ts")
    }
  });
  const manifest = {};
  async function visit(relative = "") {
    const entries = await readdir(join(source, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const data = await readFile(join(source, path));
        manifest[path] = { size: data.length, sha256: createHash("sha256").update(data).digest("hex") };
      } else throw new Error(`Unsupported GeoGebra asset: ${path}`);
    }
  }
  await visit();
  await writeFile(join(outputDirectory, "geogebra-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  await buildPlugin();
}
