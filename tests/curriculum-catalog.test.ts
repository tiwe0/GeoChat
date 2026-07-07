import { describe, expect, test } from "bun:test";
import {
  listCurriculumCatalogs,
  listCurriculumNodes,
  searchCurriculum,
  validateCurriculumCatalogReferences
} from "../backend/src/agent/curriculum";
import { listAvailableAgentSkills } from "../backend/src/agent/skills";
import { VISUAL_PROFILE_NAMES } from "../src/renderer/src/desktop-config";

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

describe("curriculum catalog", () => {
  test("covers PEP junior and senior A math books", () => {
    const catalogs = listCurriculumCatalogs();

    expect(catalogs).toContainEqual(expect.objectContaining({
      source: "pep",
      stage: "junior",
      edition: "人教版",
      books: ["七年级上册", "七年级下册", "八年级上册", "八年级下册", "九年级上册", "九年级下册"]
    }));
    expect(catalogs).toContainEqual(expect.objectContaining({
      source: "pep",
      stage: "senior",
      edition: "人教A版",
      books: ["必修第一册", "必修第二册", "选择性必修第一册", "选择性必修第二册", "选择性必修第三册"]
    }));
  });

  test("keeps every node searchable and mapped to known skill references", async () => {
    const nodes = listCurriculumNodes();
    const visualProfiles = new Set<string>(VISUAL_PROFILE_NAMES);
    const skills = await listAvailableAgentSkills(isolatedSkillEnv);

    expect(nodes.length).toBeGreaterThanOrEqual(40);
    expect(nodes.every((node) => node.keywords.length > 0)).toBe(true);
    expect(nodes.every((node) => node.aliases.length > 0)).toBe(true);
    expect(nodes.every((node) => node.skillIds.length > 0)).toBe(true);
    expect(nodes.every((node) => node.visualProfiles.every((profile) => visualProfiles.has(profile)))).toBe(true);
    expect(validateCurriculumCatalogReferences(skills)).toEqual([]);
  });

  test("routes common student prompts to useful curriculum nodes", () => {
    expect(searchCurriculum({ query: "Draw a triangular pyramid tetrahedron and its circumscribed sphere" })[0]).toMatchObject({
      id: "pep-senior-a-compulsory-2-solid",
      chapter: "立体几何初步"
    });
    expect(searchCurriculum({ query: "二次函数顶点和对称轴怎么画" })[0]).toMatchObject({
      id: "pep-junior-9a-quadratic-function",
      chapter: "二次函数"
    });
    expect(searchCurriculum({ query: "样本空间 古典概型 列表法" })[0]).toMatchObject({
      id: "pep-senior-a-compulsory-2-probability",
      chapter: "概率"
    });
    expect(searchCurriculum({ query: "圆锥曲线焦点准线和离心率" })[0]).toMatchObject({
      id: "pep-senior-a-selective-1-conic",
      chapter: "圆锥曲线的方程"
    });
  });
});
