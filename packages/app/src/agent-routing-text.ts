const ZH_SKILL_POLICY_MARKER = "【Agent Skill 策略】";
const EN_SKILL_POLICY_MARKER = "[Agent Skill policy]";
const ZH_BLACKBOARD_MARKER = "GeoChat 工作记忆黑板";
const EN_BLACKBOARD_MARKER = "GeoChat working memory blackboard";

const SKILL_POLICY_MARKERS = [ZH_SKILL_POLICY_MARKER, EN_SKILL_POLICY_MARKER] as const;
const BLACKBOARD_MARKERS = [ZH_BLACKBOARD_MARKER, EN_BLACKBOARD_MARKER] as const;

export function stripAgentSkillPolicyBlock(prompt: string) {
  let text = prompt;
  for (;;) {
    const start = firstMarkerIndex(text, SKILL_POLICY_MARKERS, 0);
    if (start < 0) break;
    const nextBlackboard = firstMarkerIndex(text, BLACKBOARD_MARKERS, start + 1);
    text = nextBlackboard >= 0
      ? `${text.slice(0, start).trimEnd()}\n\n${text.slice(nextBlackboard).trimStart()}`
      : text.slice(0, start).trimEnd();
  }
  return text.trim();
}

export function currentUserPromptBeforeBlackboard(prompt: string) {
  const withoutPolicy = stripAgentSkillPolicyBlock(prompt);
  const blackboardIndex = firstMarkerIndex(withoutPolicy, BLACKBOARD_MARKERS, 0);
  return (blackboardIndex >= 0 ? withoutPolicy.slice(0, blackboardIndex) : withoutPolicy).trim();
}

export function agentRoutingPrompt(prompt: string) {
  return stripAgentSkillPolicyBlock(prompt) || prompt.trim();
}

function firstMarkerIndex(text: string, markers: readonly string[], fromIndex: number) {
  const haystack = text.toLowerCase();
  let first = -1;
  for (const marker of markers) {
    const index = haystack.indexOf(marker.toLowerCase(), fromIndex);
    if (index >= 0 && (first < 0 || index < first)) first = index;
  }
  return first;
}
