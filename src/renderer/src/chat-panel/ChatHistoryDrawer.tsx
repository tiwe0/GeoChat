import { Trash2, X } from "lucide-solid";
import { createMemo, For, Show } from "solid-js";
import { interpolate, type Locale, type RendererI18n } from "../i18n";
import { IconButton } from "../workbench-ui";
import type { HistoryItem } from "../workbench-types";
import { formatIsoTime } from "./formatting";

export function ChatHistoryDrawer(props: {
  items: HistoryItem[];
  activeId?: string;
  disabled?: boolean;
  query: string;
  copy: RendererI18n;
  locale: Locale;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const filtered = createMemo(() =>
    props.items.filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(props.query.trim().toLowerCase()))
  );
  return (
    <div class="history-drawer">
      <div class="drawer-head history-head">
        <div>
          <strong>{props.copy.history.title}</strong>
          <p>{props.copy.history.subtitle}</p>
        </div>
        <IconButton title={props.copy.app.closeHistory} onClick={props.onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <label class="history-search">
        <input
          value={props.query}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
          placeholder={props.copy.history.searchPlaceholder}
          aria-label={props.copy.history.searchAria}
        />
      </label>
      <div class="history-list">
        <Show when={filtered().length > 0} fallback={<div class="empty-history">{props.copy.history.empty}</div>}>
          <For each={filtered()}>
            {(item) => (
              <div classList={{ "history-item": true, active: props.activeId === item.id }}>
                <button type="button" class="history-select" disabled={props.disabled} onClick={() => props.onSelect(item.id)}>
                  <span>{item.title}</span>
                  <small>{item.summary}</small>
                  <time>
                    {formatIsoTime(item.updatedAt, props.locale)} · {interpolate(props.copy.history.messageCount, { count: item.messageCount })}
                  </time>
                </button>
                <button
                  type="button"
                  class="history-delete"
                  data-tooltip={props.copy.history.delete}
                  aria-label={props.copy.history.delete}
                  disabled={props.disabled}
                  onClick={() => props.onDelete(item.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
