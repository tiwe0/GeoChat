export const LEGAL_AGREEMENT_VERSION = 1;
export const LEGAL_DOCUMENT_UPDATED_AT = "2026-10-02";

export type LegalSection = {
  id: string;
  title: string;
  paragraphs: readonly string[];
};

export type LegalCopy = {
  title: string;
  intro: string;
  privacyTitle: string;
  termsTitle: string;
  updatedLabel: string;
  acknowledgment: string;
  acceptLabel: string;
  declineLabel: string;
  closeLabel: string;
  savingLabel: string;
  saveError: string;
  loadError: string;
  retryLabel: string;
  settingsTitle: string;
  settingsDescription: string;
  reviewLabel: string;
  exitError: string;
  privacySections: readonly LegalSection[];
  termsSections: readonly LegalSection[];
};

const englishPrivacySections = [
  {
    id: "privacy-scope",
    title: "Scope and operator",
    paragraphs: [
      "This policy describes how GeoChat Desktop handles information in the open-source desktop application. The project maintainers operate the project surfaces described here; a model provider, update source, problem-bank source, or other endpoint you configure may operate independently under its own terms and privacy policy.",
      "GeoChat Desktop is designed as a local-first mathematics workbench. Local-first does not mean offline-only: network requests occur when you use an external model or an enabled network-backed feature.",
    ],
  },
  {
    id: "privacy-local-data",
    title: "Data stored on this device",
    paragraphs: [
      "The application stores preferences and this agreement record in native application storage. The local backend uses SQLite for conversations and messages, message payloads such as attachment metadata or content, GeoGebra documents, blackboard entries, model-run records, tool inputs and results, usage information, and error diagnostics. Application logs and downloaded problem-bank or update files may also be kept in application data or log directories.",
      "Local records remain on the device until they are removed through available product controls or the application data is removed. Removing a conversation is intended to remove its related local messages, run records, blackboard entries, attempts, and recorded errors, but it does not retract information already sent to an external service.",
    ],
  },
  {
    id: "privacy-model-requests",
    title: "External model requests",
    paragraphs: [
      "When you submit an assistant request, GeoChat sends the configured model provider the material needed to answer it. This can include your current message, relevant conversation history, image attachments, model and language settings, skill instructions, and tool context produced during the run. Tool context can contain GeoGebra canvas objects or snapshots, construction commands, tool inputs, tool results, and error details. Selected-object labels used only to position a Fusion view turn stay in the local layout, but selection details you place in a message or that appear in canvas or tool context can be sent.",
      "The destination and handling of those requests depend on the provider and endpoint you select. Review that provider's terms and privacy policy before sending confidential, personal, student, or third-party information. GeoChat cannot control a provider's retention, training, access, or deletion practices.",
    ],
  },
  {
    id: "privacy-credentials",
    title: "Provider credentials",
    paragraphs: [
      "Provider API credentials are stored locally by the native application in a separate, access-restricted credential file; renderer settings keep credential references rather than the secret value. The credential store is a local cleartext JSON file and is not represented as encrypted or as a system keychain. Protect the device account and revoke a credential with its provider if you believe it has been exposed.",
      "A credential is resolved locally and used only for requests to the provider endpoint bound to that credential. Model discovery or connection tests may also contact that provider. GeoChat logs are designed to redact common credential fields, but no redaction rule can be promised to detect every secret placed in ordinary message or error text.",
    ],
  },
  {
    id: "privacy-optional-networking",
    title: "Other network features",
    paragraphs: [
      "Problem-bank checks and downloads, application or workspace update checks and downloads, remote model or skill catalogs, media uploads, and developer debug connections can make requests to their configured sources. These requests may reveal ordinary connection information such as your IP address, application version, requested resource, and request time to the receiving service.",
      "Availability and defaults vary by build and configuration. Do not assume that disabling one integration disables every other network feature; review model, update, problem-bank, improvement-plan, and developer settings separately.",
    ],
  },
  {
    id: "privacy-improvement-data",
    title: "Optional improvement data",
    paragraphs: [
      "Improvement-plan participation is off unless you opt in. When enabled, the application can queue local samples containing app and locale information, selected model identifiers, hashed conversation and message identifiers, role, a limited redacted copy of message text, attachment counts/types/sizes, tool names and statuses, token usage, and timestamps.",
      "Redaction is limited and may miss sensitive material. The current local desktop build does not provide an improvement upload destination, so queued samples are not uploaded by that build; a future or differently configured build must expose and honor the opt-in before sending them. Turn participation off before entering sensitive content if you do not want new samples queued.",
    ],
  },
  {
    id: "privacy-choices-security",
    title: "Your choices and security limits",
    paragraphs: [
      "You choose which model endpoint and optional features to use and what content to submit. You can review this document from Settings. For questions or requests about the project-maintained parts of GeoChat, use the maintained contact channels shown on the About page; requests concerning an external provider must be directed to that provider.",
      "GeoChat applies practical local access controls, bounded storage, and log sanitization in parts of the application, but no storage, network transport, or filtering process is guaranteed to be completely secure or to remove every sensitive value. Keep independent backups of work you cannot afford to lose.",
    ],
  },
] as const satisfies readonly LegalSection[];

const englishTermsSections = [
  {
    id: "terms-service",
    title: "Using GeoChat Desktop",
    paragraphs: [
      "These terms govern your use of the GeoChat Desktop application. You may use it only if you can understand and accept these terms and the Privacy Policy. If you do not agree, decline and exit the application.",
      "GeoChat assists with mathematical reasoning and GeoGebra construction. It does not replace your judgment. Check generated explanations, calculations, commands, and canvas changes before relying on or sharing them, especially in teaching, assessment, research, or other consequential settings.",
    ],
  },
  {
    id: "terms-open-source",
    title: "Open-source license",
    paragraphs: [
      "GeoChat-owned source code and documentation in this repository are licensed under the Apache License, Version 2.0. Your rights to use, copy, modify, and distribute that material are governed by the repository LICENSE and NOTICE files, not reduced by these application terms. The Apache License text is available at https://www.apache.org/licenses/LICENSE-2.0.",
      "These terms govern use of the application as a service experience; they do not add restrictions to permissions already granted by an applicable open-source license.",
    ],
  },
  {
    id: "terms-third-party",
    title: "Third-party software and services",
    paragraphs: [
      "GeoChat includes third-party software and assets under their own licenses. Review THIRD_PARTY_NOTICES.md and the notices supplied with a distribution, including the separate terms for the vendored GeoGebra runtime. Do not assume every bundled component is Apache-2.0 or approved for every commercial use.",
      "External model providers, datasets, problem banks, update sources, remote skills, and endpoints are supplied by their respective operators. You are responsible for their fees, credentials, license conditions, acceptable-use rules, and privacy terms.",
    ],
  },
  {
    id: "terms-responsible-use",
    title: "Your responsibilities",
    paragraphs: [
      "Use GeoChat lawfully and respect intellectual-property, privacy, confidentiality, and other rights. Do not submit material you are not permitted to process, attempt unauthorized access, interfere with the application or connected services, evade provider safeguards, or use generated output to mislead others about its source or reliability.",
      "You are responsible for configuring endpoints and credentials, protecting local application data, reviewing content before transmission, and deciding whether generated output is suitable for your purpose.",
    ],
  },
  {
    id: "terms-ai-output",
    title: "AI and generated output",
    paragraphs: [
      "Model output can be incomplete, inaccurate, outdated, or inconsistent, and the same input may produce different results. A successful tool call or rendered diagram does not prove that a mathematical conclusion is correct.",
      "Rights in inputs and outputs can depend on applicable law and the external provider's terms. GeoChat does not promise that generated output is unique, non-infringing, or eligible for any particular form of ownership. Preserve source attribution and verify permissions where needed.",
    ],
  },
  {
    id: "terms-availability-warranty",
    title: "Availability and warranties",
    paragraphs: [
      "The application and project-maintained materials are provided on an as-is and as-available basis, subject to any protections that cannot lawfully be excluded. Features can change, fail, or become unavailable, and external services may impose their own limits or stop operating.",
      "The repository's Apache-2.0 license contains the warranty and liability terms that apply to Apache-licensed material. Nothing in these application terms overrides that license or excludes rights or remedies that applicable law does not allow to be excluded.",
    ],
  },
  {
    id: "terms-changes-contact",
    title: "Changes and contact",
    paragraphs: [
      "The maintainers may update these documents when the application or its data flows change. A new agreement version may require you to review and accept the updated text before continuing to use the application.",
      "Questions about these documents or project-maintained processing can be sent through the maintained contact channels listed on the About page. This product text describes the application and is not a certification of compliance or legal advice.",
    ],
  },
] as const satisfies readonly LegalSection[];

const chinesePrivacySections = [
  {
    id: "privacy-scope",
    title: "适用范围与维护者",
    paragraphs: [
      "本政策说明开源桌面应用 GeoChat Desktop 如何处理信息。项目维护者负责本文所述的项目功能；你配置的模型提供商、更新源、题库源或其他端点可能由独立主体运营，并适用其各自的条款与隐私政策。",
      "GeoChat Desktop 采用本地优先设计，但“本地优先”不等于“仅离线”。当你使用外部模型或启用依赖网络的功能时，应用会发起网络请求。",
    ],
  },
  {
    id: "privacy-local-data",
    title: "保存在本设备上的数据",
    paragraphs: [
      "应用会在原生应用存储中保存偏好设置和本协议的同意记录。本地后端使用 SQLite 保存会话与消息、附件元数据或内容等消息载荷、GeoGebra 文档、黑板条目、模型运行记录、工具输入与结果、用量信息及错误诊断。应用日志、已下载的题库或更新文件也可能保存在应用数据目录或日志目录中。",
      "本地记录会留在设备上，直至通过产品现有功能移除，或应用数据被删除。删除某个会话旨在一并删除其本地消息、运行记录、黑板条目、作答记录和已记录错误，但无法撤回此前已经发送给外部服务的信息。",
    ],
  },
  {
    id: "privacy-model-requests",
    title: "外部模型请求",
    paragraphs: [
      "当你提交助手请求时，GeoChat 会向所配置的模型提供商发送完成回答所需的材料。这可能包括当前消息、相关会话历史、图片附件、模型与语言设置、技能指令，以及运行过程中产生的工具上下文。工具上下文可能包含 GeoGebra 画布对象或快照、构造命令、工具输入、工具结果和错误详情。仅用于定位融合视图会话轮次的所选对象名称会留在本地布局中；但如果你把选择信息写入消息，或该信息出现在画布/工具上下文中，它就可能被发送。",
      "请求的接收方和处理方式取决于你选择的提供商与端点。在发送机密、个人、学生或第三方信息前，请查看该提供商的条款与隐私政策。GeoChat 无法控制提供商的留存、训练、访问或删除做法。",
    ],
  },
  {
    id: "privacy-credentials",
    title: "模型提供商凭据",
    paragraphs: [
      "模型提供商 API 凭据由原生应用单独保存在本地、访问权限受限的凭据文件中；渲染器设置仅保存凭据引用，不保存密钥值。该凭据存储是本地明文 JSON 文件，本文不将其描述为已加密存储或系统钥匙串。请保护设备账户；如怀疑凭据泄露，请到相应提供商处撤销凭据。",
      "凭据在本地解析，并仅用于访问与该凭据绑定的提供商端点。模型发现或连接测试也可能联系该提供商。GeoChat 日志会尝试遮蔽常见凭据字段，但无法保证任何遮蔽规则都能识别你写入普通消息或错误文本中的每一个秘密。",
    ],
  },
  {
    id: "privacy-optional-networking",
    title: "其他联网功能",
    paragraphs: [
      "题库检查与下载、应用或工作区更新检查与下载、远程模型或技能目录、媒体上传以及开发者调试连接，可能向各自配置的来源发起请求。接收方可能获得 IP 地址、应用版本、所请求资源和请求时间等通常的连接信息。",
      "这些功能是否可用及其默认状态取决于具体构建与配置。不要认为关闭一个集成就会关闭全部联网功能；请分别检查模型、更新、题库、改进计划和开发者设置。",
    ],
  },
  {
    id: "privacy-improvement-data",
    title: "可选的产品改进数据",
    paragraphs: [
      "除非你主动选择加入，否则产品改进计划处于关闭状态。启用后，应用可在本地排队保存样本，包括应用与语言信息、所选模型标识、经过哈希处理的会话和消息标识、消息角色、长度受限且经过遮蔽的消息文本副本、附件数量/类型/大小、工具名称与状态、Token 用量和时间戳。",
      "遮蔽能力有限，仍可能遗漏敏感材料。当前本地桌面构建未提供改进数据上传目的地，因此该构建不会上传已排队样本；未来版本或不同配置的构建在发送前必须提供并遵守此项选择加入设置。如果你不希望新样本进入队列，请在输入敏感内容前关闭参与。",
    ],
  },
  {
    id: "privacy-choices-security",
    title: "你的选择与安全边界",
    paragraphs: [
      "你可以选择使用哪个模型端点和可选功能，也可以决定提交哪些内容。你可在设置中再次查看本文档。对 GeoChat 项目维护部分有疑问或请求时，请使用“关于”页面中持续维护的联系渠道；涉及外部提供商的请求应直接提交给该提供商。",
      "GeoChat 在应用的部分环节采用本地访问控制、容量限制和日志清理措施，但不保证任何存储、网络传输或过滤过程绝对安全，也不保证能移除每一个敏感值。请为无法承受丢失的工作保留独立备份。",
    ],
  },
] as const satisfies readonly LegalSection[];

const chineseTermsSections = [
  {
    id: "terms-service",
    title: "使用 GeoChat Desktop",
    paragraphs: [
      "本条款适用于你对 GeoChat Desktop 应用的使用。只有在你能够理解并接受本条款和隐私政策时，才应继续使用；如不同意，请选择拒绝并退出应用。",
      "GeoChat 用于辅助数学推理与 GeoGebra 构造，不能代替你的判断。在依赖或分享生成内容前，应核对解释、计算、命令和画布变化；在教学、考试评价、研究或其他重要场景中尤其如此。",
    ],
  },
  {
    id: "terms-open-source",
    title: "开源许可",
    paragraphs: [
      "本仓库中由 GeoChat 所有的源代码与文档采用 Apache License, Version 2.0。你使用、复制、修改和分发这些材料的权利，以仓库中的 LICENSE 与 NOTICE 文件为准，不因本应用条款而缩减。Apache 许可证正文见 https://www.apache.org/licenses/LICENSE-2.0。",
      "本条款规范应用作为产品体验的使用，不会对适用的开源许可证已经授予的权限增加限制。",
    ],
  },
  {
    id: "terms-third-party",
    title: "第三方软件与服务",
    paragraphs: [
      "GeoChat 包含适用各自许可证的第三方软件与素材。请查阅 THIRD_PARTY_NOTICES.md 以及发行包随附的通知，其中包括内置 GeoGebra 运行时的独立条款。请勿假定所有随附组件均采用 Apache-2.0，或均获准用于所有商业用途。",
      "外部模型提供商、数据集、题库、更新源、远程技能和端点由相应运营方提供。你应自行承担其费用、凭据管理、许可条件、可接受使用规则和隐私条款。",
    ],
  },
  {
    id: "terms-responsible-use",
    title: "你的责任",
    paragraphs: [
      "请合法使用 GeoChat，并尊重知识产权、隐私、保密义务及其他权利。不得提交无权处理的材料，不得尝试未经授权的访问、干扰应用或所连接的服务、规避提供商的保护措施，或利用生成内容误导他人判断其来源或可靠性。",
      "你应负责配置端点和凭据、保护本地应用数据、在传输前审查内容，并判断生成结果是否适合你的用途。",
    ],
  },
  {
    id: "terms-ai-output",
    title: "AI 与生成内容",
    paragraphs: [
      "模型输出可能不完整、不准确、已过时或前后不一致，同一输入也可能得到不同结果。工具调用成功或图形完成渲染，并不能证明数学结论正确。",
      "输入与输出所涉权利可能取决于适用法律和外部提供商条款。GeoChat 不承诺生成内容具有唯一性、不侵权或必然符合某种权利归属条件。必要时请保留来源标注并核实许可。",
    ],
  },
  {
    id: "terms-availability-warranty",
    title: "可用性与保证",
    paragraphs: [
      "在不得依法排除的保护范围之外，应用及项目维护的材料按“现状”和“现有可用”状态提供。功能可能变更、失败或停止提供，外部服务也可能设置限制或停止运营。",
      "仓库 Apache-2.0 许可证中的保证与责任条款适用于相应的 Apache 许可材料。本应用条款不会覆盖该许可证，也不会排除适用法律不允许排除的权利或救济。",
    ],
  },
  {
    id: "terms-changes-contact",
    title: "变更与联系",
    paragraphs: [
      "当应用或数据流发生变化时，维护者可能更新这些文档。协议版本更新后，应用可能要求你在继续使用前重新阅读并接受更新内容。",
      "如对本文档或项目维护的数据处理有疑问，请使用“关于”页面中持续维护的联系渠道。本文是描述产品行为的功能文案，不构成合规认证或法律意见。",
    ],
  },
] as const satisfies readonly LegalSection[];

const englishCopy: LegalCopy = {
  title: "Privacy Policy and Terms",
  intro: "Before first use, please read and agree to both documents below. Your consent version and acceptance time are stored locally on this device so the application can remember your choice.",
  privacyTitle: "Privacy Policy",
  termsTitle: "Terms of Service",
  updatedLabel: "Last updated",
  acknowledgment: "I have read and voluntarily agree to both the Privacy Policy and the Terms of Service.",
  acceptLabel: "Agree and continue",
  declineLabel: "Decline and exit",
  closeLabel: "Close",
  savingLabel: "Processing…",
  saveError: "GeoChat could not save your agreement locally. Please retry before continuing.",
  loadError: "GeoChat could not read the locally stored agreement state.",
  retryLabel: "Retry",
  settingsTitle: "Privacy Policy and Terms",
  settingsDescription: "Review the current privacy policy, service terms, agreement version, and update date.",
  reviewLabel: "Review documents",
  exitError: "GeoChat could not close automatically. Close the application window to exit without agreeing.",
  privacySections: englishPrivacySections,
  termsSections: englishTermsSections,
};

const chineseCopy: LegalCopy = {
  title: "隐私政策与服务条款",
  intro: "首次使用前，请阅读并同意以下两份文档。应用会在本设备上保存你同意的协议版本和时间，以记住你的选择。",
  privacyTitle: "隐私政策",
  termsTitle: "服务条款",
  updatedLabel: "更新日期",
  acknowledgment: "我已阅读并自愿同意《隐私政策》和《服务条款》。",
  acceptLabel: "同意并继续",
  declineLabel: "拒绝并退出",
  closeLabel: "关闭",
  savingLabel: "正在处理…",
  saveError: "GeoChat 无法在本地保存同意记录，请重试后再继续。",
  loadError: "GeoChat 无法读取本地保存的协议状态。",
  retryLabel: "重试",
  settingsTitle: "隐私政策与服务条款",
  settingsDescription: "查看当前隐私政策、服务条款、协议版本和更新日期。",
  reviewLabel: "查看文档",
  exitError: "GeoChat 无法自动关闭。若不同意，请关闭应用窗口退出。",
  privacySections: chinesePrivacySections,
  termsSections: chineseTermsSections,
};

export function getLegalCopy(language: string): LegalCopy {
  return language.toLowerCase().startsWith("zh") ? chineseCopy : englishCopy;
}
