import type { ExecuteGeoGebraCommandsArgs, FunctionCallLocale } from "../functioncalls";
import { ADVANCED_DRAWING_TOOL_METADATA } from "./definitions";
import type { AdvancedDrawingCompilation, AdvancedDrawingToolName } from "./types";

export function advancedCompilation(
  name: AdvancedDrawingToolName,
  locale: FunctionCallLocale | null | undefined,
  options: {
    titleZh: string;
    titleEn: string;
    commands: string[];
    perspective: ExecuteGeoGebraCommandsArgs["perspective"];
    expectedObjects: string[];
    outcomeZh: string;
    outcomeEn: string;
    hintsZh: string[];
    hintsEn: string[];
  }
): AdvancedDrawingCompilation {
  const isEnglish = locale === "en-US";
  const definition = ADVANCED_DRAWING_TOOL_METADATA[name];
  return {
    name,
    title: isEnglish ? options.titleEn : options.titleZh,
    executeArgs: {
      commands: options.commands,
      perspective: options.perspective,
      reason: isEnglish ? `Run the compiled high-level construction: ${options.titleEn}.` : `执行已编译的高级构造：${options.titleZh}。`,
      intendedOutcome: isEnglish ? options.outcomeEn : options.outcomeZh,
      nextExpectedAction: "getCanvasContext"
    },
    expectedObjects: options.expectedObjects,
    assumptions: [...definition.assumptions],
    invariants: [...definition.invariants],
    readbackHints: isEnglish ? options.hintsEn : options.hintsZh
  };
}
