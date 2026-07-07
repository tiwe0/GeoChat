import { describe, expect, test } from "bun:test";
import {
  FUNCTION_CALL_GROUPS,
  getFunctionCallGroupForTool,
  getFunctionCallGroups,
  getFunctionCallToolNames
} from "../packages/app/src";

describe("function-call review groups", () => {
  test("classify every function-call tool exactly once", () => {
    const groupedToolNames = getFunctionCallGroups().flatMap((group) => group.toolNames);
    const uniqueGroupedToolNames = new Set(groupedToolNames);

    expect([...uniqueGroupedToolNames].sort()).toEqual(getFunctionCallToolNames().sort());
    expect(groupedToolNames).toHaveLength(uniqueGroupedToolNames.size);
  });

  test("keep high-risk tool families in their expected review groups", () => {
    expect(FUNCTION_CALL_GROUPS.geogebraExecution.toolNames).toContain("executeGeoGebraCommands");
    expect(FUNCTION_CALL_GROUPS.advancedDrawing.toolNames).toContain("executeAdvancedDrawingCommand");
    expect(FUNCTION_CALL_GROUPS.blackboardMemory.toolNames).toEqual(["readBlackboard", "patchBlackboard"]);
    expect(FUNCTION_CALL_GROUPS.choiceAnalysis.toolNames).toContain("showChoiceAnalysis");
    expect(getFunctionCallGroupForTool("setFinished")?.id).toBe("runnerControl");
  });
});
