export type DesktopAgentSkillSummary = {
  name: string;
  description: string;
  source: "built-in" | "local" | "remote";
  maturity: "draft" | "validated" | "default";
  category?: string;
  parent?: string;
  level?: number;
  tags: string[];
};

export type DesktopAgentSkillCatalog = {
  skills: DesktopAgentSkillSummary[];
  count: number;
};
