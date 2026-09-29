import {
  findForbiddenTwoDimensionalStyleCommands,
  twoDimensionalStylePolicyMessage
} from "@geochat-ai/app/geogebra-style-policy";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import type { Locale } from "../../../../shared/desktop/locale";
import { getFrontendGeoGebraController } from "../../geogebra/runtime";
import { runRendererCanvasTransaction } from "../agent-run/toolWorker";

const logger = createStructuredLogger("geogebra.choice-scenario");

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

  // The same style policy the agent is held to. These commands came from the
  // model, so they are checked here too rather than trusted for having
  // arrived inside a card.
  const violations = findForbiddenTwoDimensionalStyleCommands({ commands });
  if (violations.length) {
    return { ok: false, error: twoDimensionalStylePolicyMessage(violations, locale) };
  }

  try {
    return await runRendererCanvasTransaction({
      label: `choice-preview:${input.cardKey}:${input.label}`,
      supersedeKey: "choice-preview",
    }, async (execute) => {
      const baseXml = baseXmlByCard.get(input.cardKey) ?? controller.getCanvasXml();
      if (baseXml && !baseXmlByCard.has(input.cardKey)) baseXmlByCard.set(input.cardKey, baseXml);
      if (!baseXml) return { ok: commands.length === 0, error: null };

      // "All" has no commands: it is a restore, not an empty batch. Routing
      // it through the public command tool would reject an empty batch.
      if (!commands.length) {
        const restored = await execute("__restoreCanvasXml", { xml: baseXml });
        if (!restored.ok) throw new Error(restored.error ?? "GeoGebra baseline restore failed.");
        return { ok: true, error: null };
      }

      const result = await execute("executeGeoGebraCommands", {
        commands,
        restoreBeforeXml: baseXml,
        restoreOnError: false,
        normalizeFreeParameters: true
      });
      if (!result.ok) throw new Error(result.error ?? "GeoGebra choice preview failed.");
      return { ok: true, error: null };
    });
  } catch (error) {
    logger.warn("choice_render_failed", "GEOGEBRA_CHOICE_RENDER_FAILED", { error });
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
