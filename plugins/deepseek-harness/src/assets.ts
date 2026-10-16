import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTMATTER_DELIMITER = "---";
const MAX_BUNDLED_SKILL_BYTES = 96_000;

export type BundledGeoChatSkill = {
  name: string;
  description: string;
  source: "bundled";
  content: string;
  path: string;
  metadata: Readonly<{
    maturity: "validated" | "default";
    provider: "dsh-geochat-plugin";
  }>;
  invocation: Readonly<{
    modelInvocable: true;
    userInvocable: true;
  }>;
};

export type LoadBundledSkillsOptions = {
  skillsDirectory?: string | URL;
};

type ParsedSkill = {
  frontmatter: Map<string, string>;
  body: string;
};

function parseSkillMarkdown(markdown: string, fileName: string): ParsedSkill {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    throw new Error(`Bundled skill is missing frontmatter: ${fileName}`);
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === FRONTMATTER_DELIMITER);
  if (closingIndex < 0) {
    throw new Error(`Bundled skill has unterminated frontmatter: ${fileName}`);
  }

  const frontmatter = new Map<string, string>();
  for (const line of lines.slice(1, closingIndex)) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (!key || value === undefined) continue;
    frontmatter.set(key, unquoteScalar(value.trim()));
  }

  return {
    frontmatter,
    body: lines
      .slice(closingIndex + 1)
      .join("\n")
      .trim()
  };
}

function unquoteScalar(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function resolveSkillsDirectory(directory: string | URL | undefined): string {
  if (directory instanceof URL) return fileURLToPath(directory);
  if (directory) return directory;
  return fileURLToPath(new URL("./skills/", import.meta.url));
}

export function loadBundledSkills(options: LoadBundledSkillsOptions = {}): BundledGeoChatSkill[] {
  const skillsDirectory = resolveSkillsDirectory(options.skillsDirectory);
  const entries = readdirSync(skillsDirectory, { withFileTypes: true });
  const skillFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
  const seenNames = new Set<string>();
  const skills: BundledGeoChatSkill[] = [];

  for (const fileName of skillFiles) {
    const filePath = join(skillsDirectory, fileName);
    const markdown = readFileSync(filePath, "utf8");
    if (Buffer.byteLength(markdown, "utf8") > MAX_BUNDLED_SKILL_BYTES) {
      throw new Error(`Bundled skill exceeds ${MAX_BUNDLED_SKILL_BYTES} bytes: ${fileName}`);
    }

    const { frontmatter, body } = parseSkillMarkdown(markdown, fileName);
    const name = frontmatter.get("name")?.trim() ?? "";
    const description = frontmatter.get("description")?.trim() ?? "";
    const maturity = frontmatter.get("maturity")?.trim();
    if (!/^geochat-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      throw new Error(`Bundled skill has an invalid namespaced name: ${fileName}`);
    }
    if (!description) throw new Error(`Bundled skill is missing a description: ${fileName}`);
    if (maturity !== "validated" && maturity !== "default") {
      throw new Error(`Bundled skill is not business ready: ${fileName}`);
    }
    if (!body) throw new Error(`Bundled skill has no content: ${fileName}`);
    if (seenNames.has(name)) throw new Error(`Duplicate bundled skill name: ${name}`);
    seenNames.add(name);

    skills.push({
      name,
      description,
      source: "bundled",
      content: body,
      path: filePath,
      metadata: {
        maturity,
        provider: "dsh-geochat-plugin"
      },
      invocation: {
        modelInvocable: true,
        userInvocable: true
      }
    });
  }

  return skills.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}
