import {
  Bot,
  Brain,
  Database,
  Info,
  MessageSquareText,
  Sparkles,
  Terminal
} from "lucide-solid";
import type { RendererI18n } from "../i18n";
import type { ConfigTab } from "../workbench-types";

const CONFIG_TABS: Array<{
  tab: ConfigTab;
  icon: typeof Bot;
  debug?: boolean;
}> = [
  { tab: "model", icon: Bot },
  { tab: "skills", icon: Sparkles },
  { tab: "externalMcp", icon: Terminal },
  { tab: "memory", icon: Brain },
  { tab: "runs", icon: MessageSquareText },
  { tab: "about", icon: Info },
  { tab: "credits", icon: Sparkles },
  { tab: "debug", icon: Database, debug: true }
];

export function ConfigTabs(props: {
  copy: RendererI18n;
  activeTab: ConfigTab;
  onTabChange: (tab: ConfigTab) => void;
}) {
  return (
    <nav class="config-tabs" aria-label={props.copy.config.title}>
      {CONFIG_TABS.map(({ tab, icon: Icon, debug }) => (
        <button
          class={debug ? "config-debug-tab" : undefined}
          type="button"
          aria-pressed={props.activeTab === tab}
          classList={{ active: props.activeTab === tab }}
          onClick={() => props.onTabChange(tab)}
        >
          <Icon size={16} />{props.copy.config.tabs[tab]}
        </button>
      ))}
    </nav>
  );
}
