import type { AgentRunLedgerRecord } from "./run-ledger";

export function isChoiceAnalysisPrompt(text: string): boolean {
  const source = text.trim();
  if (!source) return false;
  const hasChoiceIntent =
    /选择题|多选|单选|选项|判断下列|判断以下|下列说法|下列结论|which\s+(?:of\s+the\s+following\s+)?(?:statement|statements|option|options)|multiple[-\s]?choice|single[-\s]?choice|options?/i.test(
      source
    );
  if (!hasChoiceIntent) return false;
  const labels = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-DＡ-Ｄ])\s*[.．、:：)]/);
    if (!match) continue;
    labels.add(normalizeChoiceLabel(match[1]));
  }
  return labels.size >= 2;
}

export function agentRunRequiresChoiceAnalysis(input: Pick<AgentRunLedgerRecord, "prompt" | "tools">): boolean {
  if (!isChoiceAnalysisPrompt(input.prompt)) return false;
  return !input.tools.some((toolRecord) => toolRecord.toolName === "showChoiceAnalysis" && toolRecord.status === "succeeded");
}

function normalizeChoiceLabel(label: string) {
  return label.replace(/[Ａ-Ｄ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).toUpperCase();
}
