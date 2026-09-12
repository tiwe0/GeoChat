const ZH_SKILL_POLICY_MARKER = "【Agent Skill 策略】";
const EN_SKILL_POLICY_MARKER = "[Agent Skill policy]";
const ZH_BLACKBOARD_MARKER = "GeoChat 工作记忆黑板";
const EN_BLACKBOARD_MARKER = "GeoChat working memory blackboard";
const ZH_CONVERSATION_CONTEXT_MARKER = "【GeoChat 历史对话上下文";
const EN_CONVERSATION_CONTEXT_MARKER = "[GeoChat conversation history";
const ZH_CURRENT_USER_MARKER = "【GeoChat 本轮用户消息】";
const EN_CURRENT_USER_MARKER = "[GeoChat current user message]";

const SKILL_POLICY_MARKERS = [ZH_SKILL_POLICY_MARKER, EN_SKILL_POLICY_MARKER] as const;
const BLACKBOARD_MARKERS = [ZH_BLACKBOARD_MARKER, EN_BLACKBOARD_MARKER] as const;
const CONVERSATION_CONTEXT_MARKERS = [ZH_CONVERSATION_CONTEXT_MARKER, EN_CONVERSATION_CONTEXT_MARKER] as const;
const CURRENT_USER_MARKERS = [ZH_CURRENT_USER_MARKER, EN_CURRENT_USER_MARKER] as const;

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
  const contextIndex = firstMarkerIndex(withoutPolicy, CONVERSATION_CONTEXT_MARKERS, 0);
  if (contextIndex >= 0) {
    const currentIndex = firstMarkerIndex(withoutPolicy, CURRENT_USER_MARKERS, contextIndex);
    if (currentIndex >= 0) {
      const currentMarker = CURRENT_USER_MARKERS.find((marker) => withoutPolicy.toLowerCase().indexOf(marker.toLowerCase(), currentIndex) === currentIndex) ?? "";
      const end = blackboardIndex > currentIndex ? blackboardIndex : withoutPolicy.length;
      return withoutPolicy.slice(currentIndex + currentMarker.length, end).trim();
    }
  }
  const boundary = [blackboardIndex, contextIndex].filter((index) => index >= 0).sort((left, right) => left - right)[0];
  return (boundary === undefined ? withoutPolicy : withoutPolicy.slice(0, boundary)).trim();
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
