import type { DesktopAgentSkillCatalog } from "../../../../src/shared/skill-catalog";
import {
  filterBusinessReadyAgentSkills,
  listAvailableAgentSkills,
} from "../../agent/skills";
import { json } from "../response";

export async function handleSkillCatalogRoute(request: Request, url: URL) {
  if (request.method !== "GET" || url.pathname !== "/v1/skills") return undefined;

  const skills = filterBusinessReadyAgentSkills(await listAvailableAgentSkills()).map((skill) => ({
    name: skill.name,
    description: skill.description,
    source: skill.source,
    maturity: skill.maturity,
    ...(skill.category ? { category: skill.category } : {}),
    ...(skill.parent ? { parent: skill.parent } : {}),
    ...(skill.level ? { level: skill.level } : {}),
    tags: skill.tags,
  }));
  const response: DesktopAgentSkillCatalog = { skills, count: skills.length };
  return json(response);
}
