import { geogebraCanvasVisualGuidance } from "./canvas-visual-guidance";
import type { FunctionCallLocale, FunctionCallSpec, FunctionCallToolName } from "./functioncall-types";

const executeGeoGebraCommandsDescriptionZh = [
  "让前端 GeoGebra applet 按 GeoGebra 5 兼容性执行一组绘图命令。不要使用只在 GeoGebra 6 或记忆中存在的命令/参数形态。不要用 Delete(...) 清理旧画布；开始新题、用户要求清空或旧画布无关时必须先调用 resetCanvas。移除辅助对象默认应隐藏，不要删除依赖对象。",
  "复杂构造要分阶段执行并验证；单批命令优先控制在 100 条以内。多对象返回命令必须先验证实际 label，再做样式或标注后处理。",
  "角度标注必须注意点序，具体方向约定由当前题型 skill 决定。隐藏辅助对象优先使用 SetConditionToShowObject(object, false)。",
  "如果本轮已创建滑块、动点或轨迹参数，且动态播放能帮助观察变化关系，可以用 StartAnimation(参数或动点, true) 打开动画；静态图形不要强行播放。",
  geogebraCanvasVisualGuidance("zh-CN")
].join(" ");

const executeGeoGebraCommandsDescriptionEn = [
  "Run a list of drawing commands in the frontend GeoGebra applet under GeoGebra 5 compatibility. Do not use command names or argument shapes that exist only in GeoGebra 6 or in memory. Do not use Delete(...) to clear stale canvas objects; call resetCanvas first when starting a new problem, when the user asks to clear the canvas, or when the existing canvas is unrelated. Removing auxiliary objects should hide them by default, not delete dependency objects.",
  "Stage complex constructions and verify each stage; prefer at most 100 commands per batch. For multi-object commands, verify actual labels before styling or labeling.",
  "Angle labels are order-sensitive; direction conventions belong to the active task skill. Prefer SetConditionToShowObject(object, false) when hiding helper objects.",
  "When this run creates a slider, moving point, or locus parameter and playback clarifies the changing relationship, use StartAnimation(parameter or moving point, true) to start animation; do not force playback for static diagrams.",
  geogebraCanvasVisualGuidance("en-US")
].join(" ");

export const FUNCTION_CALL_REGISTRY = {
  searchGeoGebraCommands: {
    name: "searchGeoGebraCommands",
    label: "搜索 GeoGebra 构造参考",
    description: "按必填 scope 查询 GeoGebra 命令参考、命令名称、参数顺序和示例；即使全局检索也必须传 global。",
    executor: "backend",
    sideEffectLevel: "read",
    timeoutMs: 30_000,
    rollbackPolicy: "none",
    display: {
      label: "查询构造方法",
      running: "查询中",
      done: "已找到参考",
      error: "查询失败",
      metric: "参考",
      detailsLabel: "查看参考"
    }
  },
  readBlackboard: {
    name: "readBlackboard",
    label: "读取工作记忆黑板",
    description: "读取当前会话的结构化工作记忆。只用于查看长期关键状态，例如原始题目、已知条件、当前目标、构造计划、失败尝试和教学要点；不要把普通聊天摘要写进黑板。",
    executor: "backend",
    sideEffectLevel: "read",
    timeoutMs: 10_000,
    rollbackPolicy: "none",
    display: {
      label: "读取黑板",
      running: "读取中",
      done: "读取完成",
      error: "读取失败",
      metric: "记忆",
      detailsLabel: "查看黑板条目"
    }
  },
  patchBlackboard: {
    name: "patchBlackboard",
    label: "更新工作记忆黑板",
    description: "对当前会话的工作记忆黑板做受控更新。只保存后续解题/绘图真正需要的关键事实：原始题目、已知条件、目标、数学分析、构造计划、假设、未解决问题、失败尝试和教学要点。只能 upsert 或 archive，不能硬删除；canvas_state 由系统和画板读取结果维护，不要手写。",
    executor: "backend",
    sideEffectLevel: "write",
    timeoutMs: 10_000,
    rollbackPolicy: "none",
    display: {
      label: "更新黑板",
      running: "更新中",
      done: "更新完成",
      error: "更新失败",
      metric: "记忆",
      detailsLabel: "查看黑板变更"
    }
  },
  listSkills: {
    name: "listSkills",
    label: "列出可用技能",
    description: "列出当前可用的 Agent Skills 摘要，用于在解题前评估是否有匹配技能。即使最后不加载技能，也可以先调用本工具留下技能评估依据。",
    executor: "backend",
    sideEffectLevel: "read",
    timeoutMs: 10_000,
    rollbackPolicy: "none",
    display: {
      label: "读取技能目录",
      running: "读取中",
      done: "读取完成",
      error: "读取失败",
      metric: "技能",
      detailsLabel: "查看技能目录"
    }
  },
  searchSkills: {
    name: "searchSkills",
    label: "搜索技能",
    description: "按题目关键词、数学领域、标签或技能描述检索可用 Agent Skills。先搜索再决定是否加载最相关的技能；没有匹配技能时继续常规解题。",
    executor: "backend",
    sideEffectLevel: "read",
    timeoutMs: 10_000,
    rollbackPolicy: "none",
    display: {
      label: "检索技能",
      running: "检索中",
      done: "检索完成",
      error: "检索失败",
      metric: "技能",
      detailsLabel: "查看技能检索"
    }
  },
  loadSkill: {
    name: "loadSkill",
    label: "加载技能说明",
    description: "按技能名称读取一个可用 Agent Skill 的完整 SKILL.md 指令。只在 listSkills/searchSkills 评估后，确认技能能改善本题策略、构造或解释时加载；不要臆造技能名。",
    executor: "backend",
    sideEffectLevel: "read",
    timeoutMs: 10_000,
    rollbackPolicy: "none",
    display: {
      label: "加载技能",
      running: "加载中",
      done: "加载完成",
      error: "加载失败",
      metric: "技能",
      detailsLabel: "查看技能说明"
    }
  },
  activateSkill: {
    name: "activateSkill",
    label: "激活技能说明",
    description: "兼容旧模型输出的技能加载工具，等价于 loadSkill。新调用优先使用 listSkills、searchSkills、loadSkill 三步。",
    executor: "backend",
    sideEffectLevel: "read",
    timeoutMs: 10_000,
    rollbackPolicy: "none",
    display: {
      label: "读取技能",
      running: "读取中",
      done: "读取完成",
      error: "读取失败",
      metric: "技能",
      detailsLabel: "查看技能说明"
    }
  },
  createGeometryPlan: {
    name: "createGeometryPlan",
    label: "生成几何构造计划",
    description: "根据已知题意选择构造 recipe，生成结构化几何计划，并编译出可执行的 GeoGebra 命令草案。",
    executor: "backend",
    sideEffectLevel: "read",
    timeoutMs: 30_000,
    rollbackPolicy: "none",
    display: {
      label: "生成构造计划",
      running: "规划中",
      done: "计划完成",
      error: "规划失败",
      metric: "步骤",
      detailsLabel: "查看构造计划"
    }
  },
  executeAdvancedDrawingCommand: {
    name: "executeAdvancedDrawingCommand",
    label: "调用高级绘图命令",
    description: "调用由已加载 Agent Skill 解锁的高级绘图命令。高级命令会先在后端校验权限并编译成普通 GeoGebra 命令；只有本轮 skill packet 中列出的命令可以调用。",
    executor: "backend",
    sideEffectLevel: "read",
    timeoutMs: 30_000,
    rollbackPolicy: "none",
    display: {
      label: "编译高级构图",
      running: "编译中",
      done: "编译完成",
      error: "编译失败",
      metric: "高级命令",
      detailsLabel: "查看高级命令"
    }
  },
  executeGeoGebraCommands: {
    name: "executeGeoGebraCommands",
    label: "执行 GeoGebra 画布操作",
    description: executeGeoGebraCommandsDescriptionZh,
    executor: "frontend",
    sideEffectLevel: "write",
    timeoutMs: 30_000,
    rollbackPolicy: "rollback_on_error",
    display: {
      label: "构造画布",
      running: "构造中",
      done: "构造完成",
      error: "构造失败",
      metric: "构造",
      detailsLabel: "查看构造命令"
    }
  },
  resetCanvas: {
    name: "resetCanvas",
    label: "重置 GeoGebra 画布",
    description: "清空当前 GeoGebra 画布并恢复默认视图。用于开始新的独立题目、用户明确要求清空，或当前画布与本题无关时；调用后应继续读取或构造画布。",
    executor: "frontend",
    sideEffectLevel: "destructive",
    timeoutMs: 30_000,
    rollbackPolicy: "none",
    display: {
      label: "重置画布",
      running: "重置中",
      done: "重置完成",
      error: "重置失败",
      metric: "画布",
      detailsLabel: "查看重置参数"
    }
  },
  getCanvasContext: {
    name: "getCanvasContext",
    label: "读取 GeoGebra 画布上下文",
    description: "读取当前 GeoGebra 画布对象、表达式和选中对象摘要。",
    executor: "frontend",
    sideEffectLevel: "read",
    timeoutMs: 30_000,
    rollbackPolicy: "none",
    display: {
      label: "读取画布",
      running: "读取中",
      done: "读取完成",
      error: "读取失败",
      metric: "对象",
      detailsLabel: "查看画布信息"
    }
  },
  getPNGBase64: {
    name: "getPNGBase64",
    label: "导出 GeoGebra 当前视图 PNG",
    description: "导出当前 GeoGebra 视图 PNG base64，用于视觉检查。",
    executor: "frontend",
    sideEffectLevel: "read",
    timeoutMs: 30_000,
    rollbackPolicy: "none",
    display: {
      label: "检查图形",
      running: "检查中",
      done: "检查完成",
      error: "检查失败",
      metric: "图像",
      detailsLabel: "查看图像检查参数"
    }
  },
  showSolutionSteps: {
    name: "showSolutionSteps",
    label: "展示解题步骤卡片",
    description: "生成解题步骤卡片，不会修改 GeoGebra 画布。作图完成后必须包含辅助元素审查结论，说明已隐藏哪些辅助对象或为什么无需隐藏。",
    executor: "backend",
    sideEffectLevel: "write",
    timeoutMs: 30_000,
    rollbackPolicy: "none",
    display: {
      label: "整理解题步骤",
      running: "整理中",
      done: "已整理",
      error: "整理失败",
      metric: "步骤",
      detailsLabel: "查看步骤卡片"
    }
  },
  showTeachingHint: {
    name: "showTeachingHint",
    label: "展示教学提示卡片",
    description: "生成学习提示卡片，不会修改 GeoGebra 画布。作图完成后必须包含辅助元素审查结论，说明已隐藏哪些辅助对象或为什么无需隐藏。",
    executor: "backend",
    sideEffectLevel: "write",
    timeoutMs: 30_000,
    rollbackPolicy: "none",
    display: {
      label: "整理学习提示",
      running: "整理中",
      done: "已整理",
      error: "整理失败",
      metric: "提示",
      detailsLabel: "查看提示卡片"
    }
  },
  showAnimationGuide: {
    name: "showAnimationGuide",
    label: "展示动画引导卡片",
    description: "生成动态观察引导卡片，不会修改 GeoGebra 画布。作图完成后必须包含辅助元素审查结论，说明已隐藏哪些辅助对象或为什么无需隐藏。",
    executor: "backend",
    sideEffectLevel: "write",
    timeoutMs: 30_000,
    rollbackPolicy: "none",
    display: {
      label: "整理动态观察",
      running: "整理中",
      done: "已整理",
      error: "整理失败",
      metric: "观察",
      detailsLabel: "查看动态引导"
    }
  },
  showChoiceAnalysis: {
    name: "showChoiceAnalysis",
    label: "展示选项场景分析卡片",
    description: "用于选择题或多选题中“题干给出公共条件、A/B/C/D 选项给出不同待判断结论”的场景。先说明公共题干条件，再分别给出每个选项的结论、正误判断、理由和对应构造重点；每个选项必须提供 constructionFocus 和非空 commands。commands 会在用户点击该选项时从公共底图恢复后执行，只能包含该选项专属构造。参数类选项优先用参数域截面、等值线、特殊值/反例线、极值截面或验证对象来支撑判断，不要把所有选项的辅助构造混成一个不可区分的画布说明。作图完成后必须包含辅助元素审查结论，说明已隐藏哪些辅助对象或为什么无需隐藏。",
    executor: "backend",
    sideEffectLevel: "write",
    timeoutMs: 30_000,
    rollbackPolicy: "none",
    display: {
      label: "整理选项分析",
      running: "整理中",
      done: "已整理",
      error: "整理失败",
      metric: "选项",
      detailsLabel: "查看选项分析"
    }
  },
  showSelectedElements: {
    name: "showSelectedElements",
    label: "展示选中元素卡片",
    description: "展示用户当前在 GeoGebra 画板中选中的对象，帮助用户确认后续追问中的“这个点/这条线/它们”具体指向哪些对象。只用于说明选中对象，不修改画布。",
    executor: "backend",
    sideEffectLevel: "write",
    timeoutMs: 30_000,
    rollbackPolicy: "none",
    display: {
      label: "整理选中元素",
      running: "整理中",
      done: "已整理",
      error: "整理失败",
      metric: "选中",
      detailsLabel: "查看选中元素"
    }
  },
  setFinished: {
    name: "setFinished",
    label: "结束本轮 Agent",
    description: "当本轮题目已经完成、画布和说明都不需要继续修改时调用。调用后后端 runner 会立即把本轮标记为成功结束，不再请求新的工具。",
    executor: "backend",
    sideEffectLevel: "write",
    timeoutMs: 1_000,
    rollbackPolicy: "none",
    display: {
      label: "结束本轮",
      running: "结束中",
      done: "已结束",
      error: "结束失败",
      metric: "结束",
      detailsLabel: "查看结束说明"
    }
  },
  setPerspective: {
    name: "setPerspective",
    label: "切换 GeoGebra 视角",
    description: [
      "切换 GeoGebra 视图或布局，参数使用 GeoGebra SetPerspective 手册格式。",
      "常用视图字母：A=Algebra，B=Probability Calculator，C=CAS，D=Graphics 2，G=Graphics，L=Construction Protocol，P=Properties，R=Data Analysis，S=Spreadsheet，T=3D Graphics。",
      "注意：3D Graphics 的代码是 T，不是 3D；用户说 3D、三维、三维视图时应传 T。",
      "可传完整布局表达式：G 只显示图形视图，AG 显示代数+图形，AGS 显示代数+图形+表格，S/G 表示表格在上图形在下，S/(GA) 表示下方图形和代数并排。",
      "可打开或关闭单个视图：+D 打开 Graphics 2，-D 关闭 Graphics 2，+T 打开 3D Graphics，-T 关闭 3D Graphics，+Tools/+Table 可用于支持这些侧栏的 GeoGebra app。",
      "也接受标准 perspective 数字：1=Algebra and Graphics，2=Geometry，3=Spreadsheet，4=CAS，5=3D Graphics，6=Probability。"
    ].join(" "),
    executor: "frontend",
    sideEffectLevel: "write",
    timeoutMs: 30_000,
    rollbackPolicy: "none",
    display: {
      label: "切换画布视角",
      running: "切换中",
      done: "切换完成",
      error: "切换失败",
      metric: "视角",
      detailsLabel: "查看视角参数"
    }
  }
} satisfies Record<FunctionCallToolName, FunctionCallSpec>;

const FUNCTION_CALL_ENGLISH_OVERRIDES = {
  searchGeoGebraCommands: {
    label: "Search GeoGebra construction references",
    description: "Look up GeoGebra command references, command names, argument order, and examples within the required scope. Pass global explicitly for broad lookup.",
    display: {
      label: "Find construction references",
      running: "Searching",
      done: "References found",
      error: "Search failed",
      metric: "references",
      detailsLabel: "View references"
    }
  },
  readBlackboard: {
    label: "Read working-memory blackboard",
    description: "Read structured working memory for the current conversation. Use it only for durable key state such as original problem, givens, goal, construction plan, failed attempts, and teaching notes; do not use it as a chat transcript summary.",
    display: {
      label: "Read blackboard",
      running: "Reading",
      done: "Read complete",
      error: "Read failed",
      metric: "memory",
      detailsLabel: "View blackboard entries"
    }
  },
  patchBlackboard: {
    label: "Update working-memory blackboard",
    description: "Apply controlled updates to the current conversation's working-memory blackboard. Save only key facts that matter for later solving or drawing: original problem, givens, goal, math analysis, construction plan, assumptions, open issues, failed attempts, and teaching notes. Only upsert or archive entries; never hard-delete. canvas_state is maintained by the system and canvas reads, so do not write it manually.",
    display: {
      label: "Update blackboard",
      running: "Updating",
      done: "Updated",
      error: "Update failed",
      metric: "memory",
      detailsLabel: "View blackboard changes"
    }
  },
  activateSkill: {
    label: "Activate skill instructions",
    description: "Compatibility alias for loadSkill. Prefer listSkills, searchSkills, then loadSkill for new calls.",
    display: {
      label: "Read skill",
      running: "Reading",
      done: "Read complete",
      error: "Read failed",
      metric: "skill",
      detailsLabel: "View skill instructions"
    }
  },
  listSkills: {
    label: "List available skills",
    description: "List available Agent Skill summaries before solving, so the agent can decide whether any skill is relevant. This tool is useful even when no skill is ultimately loaded because it records the skill evaluation basis.",
    display: {
      label: "Read skill catalog",
      running: "Reading",
      done: "Read complete",
      error: "Read failed",
      metric: "skills",
      detailsLabel: "View skill catalog"
    }
  },
  searchSkills: {
    label: "Search skills",
    description: "Search available Agent Skills by problem keywords, math domain, tags, or descriptions. Search before deciding whether to load the closest skill; continue normally when nothing matches.",
    display: {
      label: "Search skills",
      running: "Searching",
      done: "Search complete",
      error: "Search failed",
      metric: "skills",
      detailsLabel: "View skill search"
    }
  },
  loadSkill: {
    label: "Load skill instructions",
    description: "Read the full SKILL.md instructions for one available Agent Skill by skill name. Use after listSkills/searchSkills evaluation when the skill improves the strategy, construction, or explanation for this problem; do not invent skill names.",
    display: {
      label: "Load skill",
      running: "Loading",
      done: "Loaded",
      error: "Load failed",
      metric: "skill",
      detailsLabel: "View skill instructions"
    }
  },
  createGeometryPlan: {
    label: "Create a geometry construction plan",
    description: "Choose a construction recipe from the known problem intent, create a structured geometry plan, and compile draft executable GeoGebra commands.",
    display: {
      label: "Create construction plan",
      running: "Planning",
      done: "Plan ready",
      error: "Planning failed",
      metric: "steps",
      detailsLabel: "View construction plan"
    }
  },
  executeAdvancedDrawingCommand: {
    label: "Run advanced drawing command",
    description: "Call a high-level drawing command unlocked by the loaded Agent Skills. The backend validates permissions and compiles it into ordinary GeoGebra commands; only commands listed in this run's skill packet are available.",
    display: {
      label: "Compile advanced drawing",
      running: "Compiling",
      done: "Compiled",
      error: "Compile failed",
      metric: "advanced command",
      detailsLabel: "View advanced command"
    }
  },
  executeGeoGebraCommands: {
    label: "Execute GeoGebra canvas operations",
    description: executeGeoGebraCommandsDescriptionEn,
    display: {
      label: "Construct on canvas",
      running: "Constructing",
      done: "Construction complete",
      error: "Construction failed",
      metric: "operations",
      detailsLabel: "View construction commands"
    }
  },
  resetCanvas: {
    label: "Reset GeoGebra canvas",
    description: "Clear the current GeoGebra canvas and restore the default view. Use this before a new independent problem, when the user explicitly asks to clear the canvas, or when the existing canvas is unrelated to the current problem; after resetting, continue by reading or constructing the canvas.",
    display: {
      label: "Reset canvas",
      running: "Resetting",
      done: "Reset complete",
      error: "Reset failed",
      metric: "canvas",
      detailsLabel: "View reset args"
    }
  },
  getCanvasContext: {
    label: "Read GeoGebra canvas context",
    description: "Read the current GeoGebra canvas objects, expressions, and selected object summary.",
    display: {
      label: "Read canvas",
      running: "Reading",
      done: "Read complete",
      error: "Read failed",
      metric: "objects",
      detailsLabel: "View canvas context"
    }
  },
  getPNGBase64: {
    label: "Export current GeoGebra view as PNG",
    description: "Export the current GeoGebra view as a PNG base64 string for visual inspection.",
    display: {
      label: "Inspect figure",
      running: "Inspecting",
      done: "Inspection complete",
      error: "Inspection failed",
      metric: "image",
      detailsLabel: "View image inspection parameters"
    }
  },
  showSolutionSteps: {
    label: "Show solution steps card",
    description: "Create a solution steps card without modifying the GeoGebra canvas. After construction, include a helper-object review saying which auxiliary objects were hidden or why nothing should be hidden.",
    display: {
      label: "Organize solution steps",
      running: "Organizing",
      done: "Organized",
      error: "Organization failed",
      metric: "steps",
      detailsLabel: "View solution card"
    }
  },
  showTeachingHint: {
    label: "Show teaching hint card",
    description: "Create a learning hint card without modifying the GeoGebra canvas. After construction, include a helper-object review saying which auxiliary objects were hidden or why nothing should be hidden.",
    display: {
      label: "Organize teaching hints",
      running: "Organizing",
      done: "Organized",
      error: "Organization failed",
      metric: "hints",
      detailsLabel: "View hint card"
    }
  },
  showAnimationGuide: {
    label: "Show animation guide card",
    description: "Create a dynamic observation guide card without modifying the GeoGebra canvas. After construction, include a helper-object review saying which auxiliary objects were hidden or why nothing should be hidden.",
    display: {
      label: "Organize animation guide",
      running: "Organizing",
      done: "Organized",
      error: "Organization failed",
      metric: "observations",
      detailsLabel: "View animation guide"
    }
  },
  showChoiceAnalysis: {
    label: "Show choice analysis card",
    description: "Use for single-choice or multiple-choice problems where the stem provides shared givens and choices A/B/C/D provide different claims to judge. State the shared base conditions, then analyze each choice separately with its verdict, reasoning, construction focus, and non-empty commands. Each choice's commands run from the restored shared base canvas when the user selects that choice, so include only choice-specific construction commands. For parameter-based choices, prefer parameter-domain slices, level curves, special-value/counterexample lines, extrema slices, or verification objects. Do not merge all choice-specific auxiliary constructions into one indistinguishable canvas explanation. After construction, include a helper-object review saying which auxiliary objects were hidden or why nothing should be hidden.",
    display: {
      label: "Organize choice analysis",
      running: "Organizing",
      done: "Organized",
      error: "Organization failed",
      metric: "choices",
      detailsLabel: "View choice analysis"
    }
  },
  showSelectedElements: {
    label: "Show selected elements card",
    description: "Show the objects currently selected by the user in the GeoGebra canvas, so follow-up requests like 'this point', 'this line', or 'these objects' can be grounded in explicit object labels. This card only explains the selection and does not modify the canvas.",
    display: {
      label: "Organize selected elements",
      running: "Organizing",
      done: "Organized",
      error: "Organization failed",
      metric: "selected",
      detailsLabel: "View selected elements"
    }
  },
  setFinished: {
    label: "Finish this agent run",
    description: "Call this when the current problem is complete and no further canvas or explanation changes are needed. The backend runner will immediately mark this run as succeeded and will not request more tools.",
    display: {
      label: "Finish run",
      running: "Finishing",
      done: "Finished",
      error: "Finish failed",
      metric: "finish",
      detailsLabel: "View finish summary"
    }
  },
  setPerspective: {
    label: "Switch GeoGebra perspective",
    description: [
      "Switch a GeoGebra view or layout using the GeoGebra SetPerspective manual format.",
      "Common view letters: A=Algebra, B=Probability Calculator, C=CAS, D=Graphics 2, G=Graphics, L=Construction Protocol, P=Properties, R=Data Analysis, S=Spreadsheet, T=3D Graphics.",
      "Important: 3D Graphics uses code T, not 3D; when the user asks for 3D or a 3D view, pass T.",
      "Layout examples: G for Graphics only, AG for Algebra+Graphics, AGS for Algebra+Graphics+Spreadsheet, S/G for Spreadsheet above Graphics, S/(GA) for Graphics and Algebra side by side below Spreadsheet.",
      "View toggles: +D opens Graphics 2, -D closes Graphics 2, +T opens 3D Graphics, -T closes 3D Graphics, +Tools/+Table may open supported side panels.",
      "Standard numeric perspectives are also accepted: 1=Algebra and Graphics, 2=Geometry, 3=Spreadsheet, 4=CAS, 5=3D Graphics, 6=Probability."
    ].join(" "),
    display: {
      label: "Switch canvas view",
      running: "Switching",
      done: "View switched",
      error: "Switch failed",
      metric: "view",
      detailsLabel: "View perspective parameters"
    }
  }
} satisfies Record<FunctionCallToolName, Pick<FunctionCallSpec, "label" | "description" | "display">>;

export function localizedFunctionCallSpec<TToolName extends FunctionCallToolName>(
  toolName: TToolName,
  locale?: FunctionCallLocale | null
): FunctionCallSpec {
  const spec = FUNCTION_CALL_REGISTRY[toolName];
  if (locale !== "en-US") return spec;
  const override = FUNCTION_CALL_ENGLISH_OVERRIDES[toolName];
  return {
    ...spec,
    label: override.label,
    description: override.description,
    display: override.display
  };
}

export function isFunctionCallToolName(value: string): value is FunctionCallToolName {
  return value in FUNCTION_CALL_REGISTRY;
}

export function getFunctionCallSpec(toolName: FunctionCallToolName, locale?: FunctionCallLocale | null): FunctionCallSpec {
  return localizedFunctionCallSpec(toolName, locale);
}

export function getFunctionCallToolNames() {
  return Object.keys(FUNCTION_CALL_REGISTRY) as FunctionCallToolName[];
}
