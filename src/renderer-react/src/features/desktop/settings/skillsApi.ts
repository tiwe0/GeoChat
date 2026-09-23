import type { DesktopAgentSkillCatalog } from "../../../../../shared/skill-catalog";

export async function fetchSkillCatalog(
  origin: string,
  token: string | null,
  options: { signal?: AbortSignal } = {},
) {
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${origin}/v1/skills`, {
    method: "GET",
    headers,
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`Skill catalog request failed (${response.status}).`);
  }
  return await response.json() as DesktopAgentSkillCatalog;
}
