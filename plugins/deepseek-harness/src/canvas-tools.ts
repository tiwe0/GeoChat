// This allowlist deliberately excludes database, history and credential tools.
const text = { type: "string", minLength: 1, maxLength: 180 } as const;
const number = { type: "number" } as const;
const boolean = { type: "boolean" } as const;
const names = (max: number) => ({
  type: "array",
  items: text,
  minItems: 1,
  maxItems: max,
  description: `当前画布的对象名数组，1–${max} 个；使用实际标签，不是自然语言描述。`
});
const choice = (...values: string[]) => ({ type: "string", enum: values });
const perspective = {
  type: "string",
  minLength: 1,
  maxLength: 80,
  description: "GeoGebra 视图布局代码，例如 G（绘图）、T（3D）；省略则不主动切换布局。"
} as const;

export const CANVAS_TOOLS = [
  {
    name: "sceneReport",
    description:
      "返回：主 2D 视口世界范围、横纵像素密度、对象样式读回、有限 XML 依赖线索及插件业务动画列表；一次最多 100 个对象，截断和不支持字段明确标记。使用：作图前或样式批次后一次读取场景，避免反复创建视口探针；用 include 选择 viewport/style/bbox/deps。边界：只读、不创建探针；bbox 不支持时返回 unavailable，不伪造几何框。XML 依赖线索不是完整动态依赖图。文字框检测用 geochat_checkLayout，外观仍需 geochat_capture_canvas，不能从 visible 推断入画。",
    required: [],
    properties: {
      objects: names(100),
      include: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: choice("viewport", "style", "bbox", "deps"),
        description: "默认全部；按需选择视口、样式、包围盒能力状态和有限 XML 依赖线索。"
      }
    }
  },
  {
    name: "checkLayout",
    description:
      "返回：Applet 真实 text 文字容器框的像素重叠、越界及测量覆盖范围；支持有限列表文字，未测量项明确列出。使用：文字构图或字号调整后检查当前一帧，再用 geochat_capture_canvas 复核。边界：受控临时 Corner/Element 探针用完删除，不是完全无副作用的纯读取；不移除业务动画，但动画运行时不是原子帧。框含排版边距，不是字形墨迹；普通点/圆标签、绝对屏幕定位文字、3D 遮挡和整段动画不保证覆盖。空碰撞仅代表已测集合，不是全场景通过。",
    required: [],
    properties: { objects: names(100) }
  },
  {
    name: "captureFrames",
    description:
      "返回：按实际时间采样的 2–8 张原生图片内容块及每帧 elapsedMs，可直接看图，不返回 base64 文本。使用：动画播放时检查抽样时刻的标签跳变、遮挡和布局，配合 geochat_sceneReport 的动画状态。边界：不改写参数、不停止动画；采样占用当前会话工具队列，后台调度或导出会延迟间隔。有限帧不能证明帧间绝对流畅或没有闪帧，失败不返回部分成功。",
    required: [],
    properties: {
      count: { type: "integer", minimum: 2, maximum: 8, description: "默认 4 帧，范围 2–8；第一帧立即截取。" },
      intervalMs: {
        type: "integer",
        minimum: 100,
        maximum: 2000,
        description: "默认 500ms，范围 100–2000；实际时间以每帧 elapsedMs 为准，不承诺精确等间隔。"
      },
      exportScale: {
        type: "number",
        minimum: 0.25,
        maximum: 4,
        description: "默认 1，0.25 仅用于布局粗看；全部帧合计 base64 编码体积上限 12MiB。"
      },
      transparent: { ...boolean, description: "默认 true；false 用不透明背景检查实际底色对比。" },
      dpi: {
        type: "integer",
        minimum: 1,
        maximum: 600,
        description: "省略使用 Applet 默认 DPI；显式 DPI 可能增加逐帧导出耗时。"
      }
    }
  },
  {
    name: "setTextStyle",
    description:
      "返回：对象字体设置请求及写后的实际样式 XML，供回读确认；不会把请求字号冒充渲染测量值。使用：为已有 text 对象批量设置字号，减少标签拥挤，再 geochat_checkLayout 与 geochat_capture_canvas 验收。边界：仅支持独立命名 text，不是普通点/圆的名字标签，也不直接修改列表中的匿名元素；字号 8–96。bold/italic/serif 省略为 false，会覆盖原字体风格；不移除插件动画配置。",
    required: ["objects", "fontSize"],
    properties: {
      objects: names(32),
      fontSize: {
        type: "number",
        minimum: 8,
        maximum: 96,
        description: "必填目标字号 8–96，传入 Applet setFont；并非测量后的字形像素高度。"
      },
      bold: { ...boolean, description: "默认 false；是否粗体，省略会清除原粗体设置。" },
      italic: { ...boolean, description: "默认 false；是否斜体，省略会清除原斜体设置。" },
      serif: { ...boolean, description: "默认 false；是否使用衬线字体，省略会清除原衬线设置。" }
    }
  },
  {
    name: "executeGeoGebraCommands",
    description:
      "返回：逐条命令结果、失败命令及从 1 开始的 failedCommandIndex、执行前后对象摘要，供定位实际执行结果。使用：先 geochat_open_canvas 并 geochat_getCanvasContext，不确定语法先 geochat_search_commands，再批量构造或调整样式；之后 geochat_inspectGeoGebraObjects 核对数值并 geochat_capture_canvas 看图。边界：仅接受 GeoGebra 命令，不是 JavaScript；执行会停止并移除插件动画配置。resetBefore 仅用户明确要求清空时使用。ok 不证明数学或视觉正确；失败后摘要可能是回滚前状态，应重新读取画布，超时或取消后不要自动重放写操作。",
    required: ["commands"],
    properties: {
      commands: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: { type: "string", minLength: 1, maxLength: 5000 },
        description: "按顺序执行的 1–100 条 GeoGebra 命令；遇首条失败停止，不能填写 JavaScript。"
      },
      resetBefore: { ...boolean, description: "默认 false；true 会在执行前清空构造，仅用户明确要求清空时设置。" },
      restoreOnError: {
        ...boolean,
        description:
          "默认 false；true 请求命令失败时在可用 XML 快照上执行内部恢复。不代表关闭外层事务回滚，也不保证恢复动画；失败后重新读取画布。"
      },
      perspective
    }
  },
  {
    name: "configureGeoGebraAnimation",
    description:
      "返回：动画配置和当前状态快照，含对象、范围、时长、模式、状态及当前值。使用：为已有自由数值/角度或滑块配置时间轴，默认立即播放；再用 geochat_controlGeoGebraAnimation 控制，geochat_inspectGeoGebraObjects 检查状态。边界：不创建参数，不保证依赖对象的数学关系正确，也不证明动画持续播放；需间隔读取数值验证运动。依赖当前页面存活，后台帧调度可能降速；命令批次、geochat_setValue 或清空画布会移除插件动画配置。",
    required: ["object", "from", "to"],
    properties: {
      object: {
        ...text,
        description:
          "已存在且可赋值的自由数值/角度或滑块名称；先用 geochat_exists 确认存在，再用 geochat_inspectGeoGebraObjects 检查定义。"
      },
      from: { ...number, description: "动画起始值；配置时会立即写入该值，即使 autoplay=false。" },
      to: { ...number, description: "终值；continuous 模式中表示一个 durationMs 后的值，不是停止上限。" },
      durationMs: {
        type: "number",
        minimum: 2000,
        maximum: 120000,
        description: "默认 20000 毫秒；从 from 到 to 的时长，范围 2000–120000。"
      },
      mode: {
        ...choice("once", "loop", "ping_pong", "continuous"),
        description: "默认 once；once 单次、loop 循环、ping_pong 往返、continuous 按相同速率持续外推。"
      },
      easing: {
        ...choice("linear", "ease_in_out"),
        description: "默认 linear；ease_in_out 为缓入缓出，continuous 始终使用 linear。"
      },
      autoplay: {
        ...boolean,
        description: "默认 true；false 仅配置并写入起始值，之后用 geochat_controlGeoGebraAnimation 的 play 播放。"
      }
    }
  },
  {
    name: "controlGeoGebraAnimation",
    description:
      "返回：各指定对象执行操作后的插件动画状态快照。使用：配置动画后播放、暂停、停止或回到起始值；pause/stop 保留进度，reset 回到 from 且不自动播放。边界：仅控制 geochat_configureGeoGebraAnimation 建立的时间轴，不控制任意 GeoGebra 原生动画；未配置对象会报错，多对象操作不保证原子性。状态快照不替代 geochat_getValue 间隔取值和 geochat_capture_canvas 截图验收。",
    required: ["action", "objects"],
    properties: {
      action: {
        ...choice("play", "pause", "stop", "reset"),
        description: "play 继续播放（已完成则重播）；pause/stop 保留进度；reset 回到起点并保持未播放。"
      },
      objects: names(16)
    }
  },
  {
    name: "inspectGeoGebraObjects",
    description:
      "返回：指定对象的存在性，以及 Applet 可提供的类型、定义、格式化值、数值、坐标、可见性和动画状态；缺失对象返回 exists=false。使用：构造、赋值或动画操作后，核对真实对象和数学不变量。边界：部分 API 字段可能缺失，不能当作 false 或零；visible 仅是对象可见开关，不表示位于视口内。没有图片或标签包围盒，不能证明标签不重叠、配色合格；视觉检查用 geochat_capture_canvas。",
    required: ["objects"],
    properties: { objects: names(20) }
  },
  {
    name: "resetCanvas",
    description:
      "返回：重置结果、删除计数、失败计数及前后对象摘要。使用：仅在用户明确要求清空或重新开始时，删除构造、移除插件动画，并恢复主 2D 视图原点居中、坐标轴 1:1 比例。边界：破坏性操作，不是清除聊天或导出备份；不承诺重置所有 3D 相机参数。检查 ok/error 和重置后对象；报错、超时或取消后先检查当前画布，不要盲目重试。",
    required: [],
    properties: { perspective }
  },
  {
    name: "getCanvasContext",
    description:
      "返回：当前画布的对象名称/类型索引、表达式标签、对象数量、选择状态及可获取的视图布局；可选附原始 XML。使用：作图前了解现有构造，避免覆盖名称；错误后重新读取状态。边界：默认不返回 XML，表达式标签不是完整公式；选择或视图状态可能 unknown，不能当作未选择。精确值/定义用 geochat_inspectGeoGebraObjects 或 geochat_getValue，真实外观用 geochat_capture_canvas；本工具不打开或清空画布。",
    required: [],
    properties: {
      includeXml: {
        ...boolean,
        description: "默认 false；仅需要检查完整构造 XML 时设 true，内容可能较大；本插件不提供 XML 写入工具。"
      }
    }
  },
  {
    name: "getPNGBase64",
    publicName: "geochat_capture_canvas",
    description:
      "返回：当前 GeoGebra 画布的图片内容块（可直接查看的原生图片附件），不是需要自行解码的 base64 文本；无需另找看图工具。使用：完成构造或批量样式调整后调用，检查颜色对比、标签重叠、遮挡、网格和布局；可不带参数调用。边界：不替代 geochat_inspectGeoGebraObjects、geochat_getValue 等工具对定义、坐标、数值和动画状态的验证；截图只反映当前一帧，不证明动画连续性或数学正确性，也不包含 Harness 整体 UI。若模型实际无法读取附件，应说明限制；未实际读取图片不能声称完成视觉验收。",
    required: [],
    properties: {
      exportScale: {
        type: "number",
        minimum: 0.25,
        maximum: 4,
        description:
          "默认 1，按画布原始尺寸导出；0.25 仅用于布局粗看，不能替代最终文字清晰度验收。可增大至 4，但受附件大小限制。"
      },
      transparent: {
        ...boolean,
        description: "默认 true，透明背景；false 使用不透明背景，检查实际底色上的配色对比时可设 false。"
      },
      dpi: {
        type: "integer",
        minimum: 1,
        maximum: 600,
        description:
          "省略时使用 Applet 默认导出 DPI；显式指定范围 1–600。像素缩放使用 exportScale，不要只靠 DPI 提高清晰度。"
      }
    }
  },
  {
    name: "setPerspective",
    description:
      "返回：请求的布局代码及 API 切换成功/失败信息。使用：任务需要绘图或 3D 等不同布局时切换现有 Applet 的视图。边界：不创建构造、不清空画布，也不是对象变换或相机缩放；success 仅说明 API 接受切换，不证明最终布局可读，用 geochat_capture_canvas 检查画面。",
    required: ["mode"],
    properties: {
      mode: {
        ...perspective,
        description: "必填 GeoGebra 视图布局代码，例如 G（绘图）、T（3D）；使用 Applet 支持的代码。"
      }
    }
  },
  {
    name: "getValue",
    description:
      "返回：对象名和 Applet 返回的有限数值。使用：读取数值参数、验证计算关系，或间隔读取动画参数以判断是否变化。边界：不是点的坐标读取器，也不证明对象存在、已定义或正在连续运动；先 geochat_exists/geochat_inspectGeoGebraObjects 确认对象，坐标和定义用 geochat_inspectGeoGebraObjects，外观用 geochat_capture_canvas。非有限数值会报错，不要把异常或缺失当作零。",
    required: ["name"],
    properties: {
      name: { ...text, description: "待取值的已有数值对象名称；不是任意公式，创建或求值表达式请用命令工具。" }
    }
  },
  {
    name: "getValueString",
    description:
      "返回：对象名和 GeoGebra 格式化的值字符串，例如点坐标、公式或文本对象内容；不是图片。使用：需要可读的对象值表示时读取。边界：字符串可能带对象名、单位或舍入，不保证是文本对象的原始正文，也不宜作精确数值运算；数值用 geochat_getValue，坐标/定义用 geochat_inspectGeoGebraObjects，视觉验收用 geochat_capture_canvas。",
    required: ["name"],
    properties: { name: { ...text, description: "要读取格式化值表示的已有对象名称；不传文件路径或自然语言问题。" } }
  },
  {
    name: "setValue",
    description:
      "返回：赋值调用成功标志和请求的对象名、数值；该数值是请求回显，不是赋值后的回读。使用：调整已有自由数值/滑块，再用 geochat_getValue 或 geochat_inspectGeoGebraObjects 确认实际值及依赖对象。边界：不创建对象、不改写依赖公式；会停止并移除所有插件动画配置，需要播放时重新 geochat_configureGeoGebraAnimation。ok 不保证 Applet 实际采纳该值；超时或取消后先读取状态，不要自动重试。",
    required: ["name", "value"],
    properties: {
      name: { ...text, description: "已有且可赋值的自由数值/滑块名称；依赖表达式应使用命令工具修改。" },
      value: { ...number, description: "要写入的有限数值；写入后回读确认是否被 Applet 接受或受范围约束。" }
    }
  },
  {
    name: "exists",
    description:
      "返回：对象名及 exists 布尔值。使用：创建前避免名称冲突，读取或修改前确认标签存在。边界：存在不等于已定义、可见或位于视口内，不验证数值、类型或视觉效果；进一步用 geochat_inspectGeoGebraObjects/geochat_getObjectType，外观用 geochat_capture_canvas。",
    required: ["name"],
    properties: { name: { ...text, description: "精确的 GeoGebra 对象标签，例如 A、f 或 t；不支持模糊搜索。" } }
  },
  {
    name: "getObjectType",
    description:
      "返回：对象名和 GeoGebra 对象类型字符串，例如 point、numeric、angle。使用：已有对象需要按类型选择读取、赋值或动画操作时调用。边界：先用 geochat_exists 确认标签；类型不证明对象已定义、是自由参数、可赋值或位于视口内。详细定义/值用 geochat_inspectGeoGebraObjects，画面用 geochat_capture_canvas。",
    required: ["name"],
    properties: { name: { ...text, description: "已存在对象的精确标签；未知标签先用 geochat_exists 检查。" } }
  }
] as const;
