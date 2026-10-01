import { describe, expect, test } from "bun:test";
import {
  getFunctionCallGroupForTool,
  getFunctionCallGroups,
  getFunctionCallToolNames
} from "@geochat-ai/app/functioncalls";

describe("function-call review groups", () => {
  test("classify every function-call tool exactly once", () => {
    const groupedToolNames = getFunctionCallGroups().flatMap((group) => group.toolNames);
    const uniqueGroupedToolNames = new Set(groupedToolNames);

    expect([...uniqueGroupedToolNames].sort()).toEqual(getFunctionCallToolNames().sort());
    expect(groupedToolNames).toHaveLength(uniqueGroupedToolNames.size);
  });

  test("keep high-risk tool families in their expected review groups", () => {
    const groups = Object.fromEntries(getFunctionCallGroups().map((group) => [group.id, group]));
    expect(groups.geogebraExecution?.toolNames).toContain("executeGeoGebraCommands");
    expect(groups.advancedDrawing?.toolNames).toContain("executeAdvancedDrawingCommand");
    expect(groups.blackboardMemory?.toolNames).toEqual(["readBlackboard", "patchBlackboard"]);
    expect(groups.choiceAnalysis?.toolNames).toContain("showChoiceAnalysis");
    expect(getFunctionCallGroupForTool("setFinished")?.id).toBe("agentControl");
  });
});
