import { describe, expect, test } from "bun:test";
import { buildCommandReferencePacketForRun } from "../backend/src/agent/command-searcher";

const emptySelection = {
  status: "not_needed",
  curriculumNodes: [],
  selectedSkills: [],
  enabledAdvancedTools: []
} as const;

describe("GeoGebra command preflight tag intents", () => {
  test.each([
    ["创建一个点和圆", "capability:create", "Point"],
    ["查询当前构造步骤", "capability:query", "ConstructionStep"],
    ["测量圆的面积和周长", "capability:measure", "Area"],
    ["验证两条直线是否平行", "capability:relation", "AreParallel"],
    ["对图形应用矩阵变换", "capability:transform", "ApplyMatrix"]
  ] as const)("maps %s to %s", (prompt, expectedTag, expectedCommand) => {
    const packet = buildCommandReferencePacketForRun({
      prompt,
      locale: "zh-CN",
      skillSelection: emptySelection
    });

    expect(packet.status).toBe("selected");
    expect(packet.queryIntents.some((intent) =>
      intent.tagMatch === "all" && intent.tags.includes(expectedTag)
    )).toBe(true);
    expect(packet.references.map((entry) => entry.command)).toContain(expectedCommand);
  });

  test("查询构造步骤不会误触发创建意图", () => {
    const packet = buildCommandReferencePacketForRun({
      prompt: "查询当前构造步骤",
      locale: "zh-CN",
      skillSelection: emptySelection
    });
    const tags = packet.queryIntents.flatMap((intent) => intent.tags);

    expect(tags).toContain("capability:query");
    expect(tags).not.toContain("capability:create");
  });

  test("合并相同标签选择的关系意图", () => {
    const packet = buildCommandReferencePacketForRun({
      prompt: "验证两条直线是否平行",
      locale: "zh-CN",
      skillSelection: emptySelection
    });
    const relationIntents = packet.queryIntents.filter((intent) =>
      intent.tagMatch === "all" && intent.tags.includes("capability:relation")
    );

    expect(relationIntents).toHaveLength(1);
    expect(relationIntents[0]?.commands).toEqual(expect.arrayContaining(["AreParallel", "ArePerpendicular", "Relation"]));
  });

  test("将垂线构造与关系验证分开", () => {
    const packet = buildCommandReferencePacketForRun({
      prompt: "过点 A 画一条垂直于直线 BC 的垂线",
      locale: "zh-CN",
      skillSelection: emptySelection
    });

    expect(packet.queryIntents.some((intent) => intent.tags.includes("capability:create"))).toBe(true);
    expect(packet.queryIntents.some((intent) => intent.tags.includes("capability:relation"))).toBe(false);
    expect(packet.references.map((entry) => entry.command)).toContain("PerpendicularLine");
  });

  test("混合意图公平预加载各类命令且不误触发动画", () => {
    const packet = buildCommandReferencePacketForRun({
      prompt: "创建一个三角形，旋转后测量面积，并验证两条直线是否垂直",
      locale: "zh-CN",
      skillSelection: emptySelection
    });
    const tags = packet.queryIntents.flatMap((intent) => intent.tags);
    const commands = packet.references.map((entry) => entry.command);

    expect(tags).toEqual(expect.arrayContaining([
      "capability:create",
      "capability:transform",
      "capability:measure",
      "capability:relation"
    ]));
    expect(tags).not.toContain("capability:animation");
    expect(commands).toEqual(expect.arrayContaining(["Rotate", "Area", "ArePerpendicular"]));
  });
});
