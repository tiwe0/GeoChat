import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { en } from "../src/renderer-react/src/i18n/locales/en";
import { zhCN } from "../src/renderer-react/src/i18n/locales/zh-CN";

const panelSource = readFileSync(
  new URL("../src/renderer-react/src/components/AssistantPanel.tsx", import.meta.url),
  "utf8",
);
const targetSource = [
  panelSource,
  "ChatComposer.tsx",
  "LanguageButton.tsx",
  "ModelMenu.tsx",
].map((source) => source.endsWith(".tsx")
  ? readFileSync(new URL(`../src/renderer-react/src/components/${source}`, import.meta.url), "utf8")
  : source).join("\n");

describe("initial onboarding tour", () => {
  test("covers every current toolbar feature in visual order", () => {
    const targets = [...panelSource.matchAll(/querySelector<HTMLElement>\('\[data-copilot(?:-thinking)?-tour="([^"]+)"\]'/g)]
      .map((match) => match[1]);

    expect(targets).toEqual([
      "history",
      "new-conversation",
      "blackboard",
      "problem-bank",
      "language",
      "settings",
      "model",
      "attachments",
      "thinking",
      "send",
      "minimize",
    ]);

    for (const target of targets.filter((value) => value !== "thinking")) {
      expect(targetSource).toContain(`data-copilot-tour="${target}"`);
    }
    expect(targetSource).toContain('data-copilot-thinking-tour="thinking"');
  });

  test("versions completion so the expanded tutorial is shown once after upgrade", () => {
    expect(panelSource).toContain("const ONBOARDING_TOUR_VERSION = 2;");
    expect(panelSource).toContain("stored[ONBOARDING_TOUR_STORAGE_KEY] !== ONBOARDING_TOUR_VERSION");
    expect(panelSource).toContain("[ONBOARDING_TOUR_STORAGE_KEY]: ONBOARDING_TOUR_VERSION");
  });

  test("localizes every new tour step in both languages", () => {
    const keys = [
      "newConversationTitle",
      "newConversationDescription",
      "problemBankTitle",
      "problemBankDescription",
      "settingsTitle",
      "settingsDescription",
    ] as const;

    for (const key of keys) {
      expect(typeof en.tour[key]).toBe("string");
      expect(typeof zhCN.tour[key]).toBe("string");
      expect(en.tour[key].length).toBeGreaterThan(0);
      expect(zhCN.tour[key].length).toBeGreaterThan(0);
    }
  });

  test("keeps tour descriptions focused on the immediate action", () => {
    expect({
      history: zhCN.tour.historyDescription,
      newConversation: zhCN.tour.newConversationDescription,
      blackboard: zhCN.tour.blackboardDescription,
      problemBank: zhCN.tour.problemBankDescription,
      language: zhCN.tour.languageDescription,
      settings: zhCN.tour.settingsDescription,
      model: zhCN.tour.modelDescription,
      attachments: zhCN.tour.attachmentsDescription,
      thinking: zhCN.tour.thinkingDescription,
      send: zhCN.tour.sendDescription,
      minimize: zhCN.tour.minimizeDescription,
    }).toEqual({
      history: "管理历史对话与画布状态。",
      newConversation: "开始一个新的对话。",
      blackboard: "整理题目条件、构造计划和重要结论。",
      problemBank: "打开题库，浏览题集、题目和解析。",
      language: "切换界面语言。",
      settings: "管理模型、题库和应用选项。",
      model: "切换当前对话使用的 AI 模型。",
      attachments: "添加图片或文件作为对话上下文。",
      thinking: "调整思考模式和强度。",
      send: "发送当前消息。",
      minimize: "收起助手面板。",
    });
    expect({
      history: en.tour.historyDescription,
      newConversation: en.tour.newConversationDescription,
      blackboard: en.tour.blackboardDescription,
      problemBank: en.tour.problemBankDescription,
      language: en.tour.languageDescription,
      settings: en.tour.settingsDescription,
      model: en.tour.modelDescription,
      attachments: en.tour.attachmentsDescription,
      thinking: en.tour.thinkingDescription,
      send: en.tour.sendDescription,
      minimize: en.tour.minimizeDescription,
    }).toEqual({
      history: "Manage conversation history and canvas state.",
      newConversation: "Start a new conversation.",
      blackboard: "Organize problem conditions, construction plans, and key conclusions.",
      problemBank: "Open the problem bank to browse sets, problems, and solutions.",
      language: "Switch the interface language.",
      settings: "Manage models, problem banks, and app options.",
      model: "Switch the AI model for the current conversation.",
      attachments: "Add images or files as conversation context.",
      thinking: "Adjust thinking mode and effort.",
      send: "Send the current message.",
      minimize: "Collapse the assistant panel.",
    });
  });
});
