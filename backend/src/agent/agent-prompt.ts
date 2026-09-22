import {
  GEOCHAT_REPAIR_SYSTEM_PROMPT_EN,
  GEOCHAT_REPAIR_SYSTEM_PROMPT,
  GEOCHAT_SYSTEM_PROMPT_EN,
  GEOCHAT_SYSTEM_PROMPT,
  type AgentRunLedgerRecord,
} from "@geochat-ai/app";
import {
  formatCommandReferencePacketPrompt,
  type AgentCommandReferencePacket,
} from "./command-searcher";
import {
  formatSkillSelectionPacketPrompt,
  type AgentSkillSelectionPacket,
} from "./skill-selector";

export async function systemPromptForRun(
  run: AgentRunLedgerRecord,
  repairing: boolean,
  skillSelection: AgentSkillSelectionPacket,
  commandReferencePacket: AgentCommandReferencePacket,
) {
  const basePrompt = run.locale === "en-US"
    ? repairing
      ? GEOCHAT_REPAIR_SYSTEM_PROMPT_EN
      : GEOCHAT_SYSTEM_PROMPT_EN
    : repairing
      ? GEOCHAT_REPAIR_SYSTEM_PROMPT
      : GEOCHAT_SYSTEM_PROMPT;
  return `${basePrompt}\n\n${formatSkillSelectionPacketPrompt(skillSelection, run.locale)}\n\n${formatCommandReferencePacketPrompt(commandReferencePacket, run.locale)}`;
}
