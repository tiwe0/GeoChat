import {
  findForbiddenTwoDimensionalStyleCommands,
  twoDimensionalStylePolicyMessage
} from "@geochat-ai/app";
import type { Locale } from "../../../../shared/desktop/locale";
import { getFrontendGeoGebraController } from "../../geogebra/runtime";

/**
 * Draw one multiple-choice option onto the canvas, and be able to take it back.
 *
 * A choice-analysis card proposes a construction per option. Seeing them one
 * at a time is the point — drawn together they overlap into noise — but each
 * replay has to start from the same construction, or option B is drawn on top
 * of whatever A left behind.
 *
 * So the construction as it stood when the card was first opened is captured
 * once per card and replayed before every option, including the return to
 * "all", which is simply a replay with no commands.
 */
export type ChoiceScenarioPreviewInput = {
  cardKey: string;
  label: string;
  commands: string[];
};

export type ChoiceScenarioPreviewResult = {
  ok: boolean;
  error?: string | null;
};

/**
 * Keyed by card, not by message: the same card re-renders as a run streams,
 * and a key that moved with it would reset the baseline on every token.
 */
const baseXmlByCard = new Map<string, string>();

export function resetChoiceScenarioBaselines() {
  baseXmlByCard.clear();
}

export async function previewChoiceScenario(
  input: ChoiceScenarioPreviewInput,
  locale: Locale
): Promise<ChoiceScenarioPreviewResult> {
  const controller = getFrontendGeoGebraController();
  if (!controller?.ready) return { ok: false, error: null };

  const commands = input.commands.map((command) => command.trim()).filter(Boolean);
  const baseXml = baseXmlByCard.get(input.cardKey) ?? controller.getCanvasXml();
  if (baseXml && !baseXmlByCard.has(input.cardKey)) baseXmlByCard.set(input.cardKey, baseXml);
  // "All" has no commands: it is a restore, not an empty batch. Routing it
  // through the command tool would be rejected for having nothing to run.
  if (!commands.length) {
    if (!baseXml) return { ok: true };
    return { ok: controller.restoreCanvasXml(baseXml), error: null };
  }

  // The same style policy the agent is held to. These commands came from the
  // model, so they are checked here too rather than trusted for having
  // arrived inside a card.
  const violations = findForbiddenTwoDimensionalStyleCommands({ commands });
  if (violations.length) {
    return { ok: false, error: twoDimensionalStylePolicyMessage(violations, locale) };
  }

  try {
    const result = await controller.executeTool("executeGeoGebraCommands", {
      commands,
      restoreBeforeXml: baseXml,
      restoreOnError: true,
      normalizeFreeParameters: true
    }) as { ok?: boolean; error?: string | null };
    return { ok: result.ok !== false, error: result.error ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Identify a card by what it says, not by where it sits. Tool results are
 * re-rendered as a run streams, and an index-based key would hand a card its
 * neighbour's baseline.
 */
export function choiceScenarioCardKey(card: {
  title?: string;
  summary?: string;
  choices?: readonly { label?: string; statement?: string }[];
}) {
  return [
    card.title ?? "",
    card.summary ?? "",
    (card.choices ?? []).map((choice) => `${choice.label ?? ""}:${choice.statement ?? ""}`).join("|")
  ].join("::");
}
