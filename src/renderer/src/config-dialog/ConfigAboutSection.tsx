import {
  Bot,
  Check,
  FileSearch,
  Github,
  HeartHandshake,
  Info,
  MessageCircle,
  MessageSquareText,
  PlaySquare,
  Sparkles
} from "lucide-solid";
import { For, Show } from "solid-js";
import type { RendererI18n } from "../i18n";
import { SectionCard } from "../workbench-ui";

type OpenSourceCreditCopyKey = "geogebraCredit" | "gaokaoCredit" | "conic10kCredit";

const OPEN_SOURCE_CREDITS: Array<{
  name: string;
  href: string;
  descriptionKey: OpenSourceCreditCopyKey;
}> = [
  {
    name: "GeoGebra",
    href: "https://github.com/geogebra/geogebra",
    descriptionKey: "geogebraCredit"
  },
  {
    name: "OpenLMLab/GAOKAO-Bench",
    href: "https://github.com/OpenLMLab/GAOKAO-Bench",
    descriptionKey: "gaokaoCredit"
  },
  {
    name: "whyNLP/Conic10K",
    href: "https://github.com/whyNLP/Conic10K",
    descriptionKey: "conic10kCredit"
  }
];

const PEOPLE_CREDITS: Array<{
  name: string;
  identity?: string;
  note?: string;
}> = [
  { name: "Neal", identity: "普渡大学统计博士" },
  { name: "宇豪", identity: "南京五中教师" },
  { name: "志勇老师" },
  { name: "桢桢老师" },
  { name: "Zgy 老师" },
  { name: "馅儿", note: "爱犬" },
  { name: "喵喵", note: "爱猫" },
  { name: "fzm 老师" }
];

export function ConfigAboutSection(props: {
  copy: RendererI18n;
  wechatCopied: boolean;
  onCopyWechat: () => void;
}) {
  return (
    <>
      <SectionCard class="config-module-card about-primary-card">
        <div class="mcp-setting">
          <div class="mcp-setting-main">
            <strong><Info size={16} />{props.copy.about.projectTitle}</strong>
            <p>{props.copy.about.projectBody}</p>
          </div>
        </div>
        <div class="about-project-points">
          <div>
            <Bot size={15} />
            <span>{props.copy.about.projectAgentPoint}</span>
          </div>
          <div>
            <FileSearch size={15} />
            <span>{props.copy.about.projectCanvasPoint}</span>
          </div>
          <div>
            <MessageSquareText size={15} />
            <span>{props.copy.about.projectReviewPoint}</span>
          </div>
        </div>
      </SectionCard>
      <SectionCard class="config-module-card about-primary-card about-author-card">
        <div class="about-card-heading">
          <div class="mcp-setting-main">
            <strong><HeartHandshake size={16} />{props.copy.about.author}</strong>
          </div>
          <span class="status-pill active">{props.copy.about.madeWithLove}</span>
          <p>{props.copy.about.authorBody}</p>
        </div>
        <div class="contact-links">
          <a href="https://space.bilibili.com/266909334" target="_blank" rel="noreferrer"><PlaySquare size={15} />{props.copy.about.bilibili} <span>space.bilibili.com/266909334</span></a>
          <a href="https://github.com/tiwe0" target="_blank" rel="noreferrer"><Github size={15} />GitHub <span>github.com/tiwe0</span></a>
          <button type="button" onClick={props.onCopyWechat}>
            {props.wechatCopied ? <Check size={15} /> : <MessageCircle size={15} />}
            {props.copy.about.wechat} <span>{props.wechatCopied ? props.copy.about.copied : "I0v0ry"}</span>
          </button>
        </div>
      </SectionCard>
    </>
  );
}

export function ConfigCreditsSection(props: { copy: RendererI18n }) {
  return (
    <>
      <SectionCard class="config-card-wide">
        <div class="about-author-head">
          <strong><Sparkles size={16} />{props.copy.about.credits}</strong>
          <span>{props.copy.about.openSource}</span>
        </div>
        <div class="credit-list">
          <For each={OPEN_SOURCE_CREDITS}>
            {(credit) => (
              <a href={credit.href} target="_blank" rel="noreferrer">
                <strong>{credit.name}</strong>
                <span>{props.copy.about[credit.descriptionKey]}</span>
              </a>
            )}
          </For>
        </div>
      </SectionCard>
      <SectionCard class="config-card-wide">
        <div class="about-author-head">
          <strong><HeartHandshake size={16} />{props.copy.about.peopleCredits}</strong>
          <span>{props.copy.about.peopleCreditsTag}</span>
        </div>
        <div class="people-credit-list">
          <For each={PEOPLE_CREDITS}>
            {(person) => (
              <div class="people-credit-item">
                <strong>{person.name}</strong>
                <Show when={person.identity || person.note}>
                  <span>{[person.identity, person.note].filter(Boolean).join(" · ")}</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </SectionCard>
    </>
  );
}
