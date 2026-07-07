import { Check, ChevronDown, Languages } from "lucide-solid";
import { createEffect, createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import type { Locale, RendererI18n } from "./i18n";

export function SectionCard(props: { children: JSX.Element; class?: string }) {
  return <div class={`section-card ${props.class ?? ""}`.trim()}>{props.children}</div>;
}

export function IconButton(props: {
  title: string;
  disabled?: boolean;
  active?: boolean;
  ariaControls?: string;
  ariaExpanded?: boolean;
  onClick?: () => void;
  children: JSX.Element;
  class?: string;
}) {
  return (
    <button
      type="button"
      class={`icon-button ${props.active ? "active" : ""} ${props.class ?? ""}`.trim()}
      data-tooltip={props.title}
      aria-label={props.title}
      aria-controls={props.ariaControls}
      aria-expanded={props.ariaExpanded}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function LanguageSwitcher(props: { locale: Locale; copy: RendererI18n; onChange: (locale: Locale) => void }) {
  return (
    <div class="language-switcher" role="group" aria-label={props.copy.config.languageTitle} data-tooltip={props.copy.config.languageTitle}>
      <Languages size={14} aria-hidden="true" />
      <button
        type="button"
        classList={{ active: props.locale === "zh-CN" }}
        aria-pressed={props.locale === "zh-CN"}
        onClick={() => props.onChange("zh-CN")}
      >
        中文
      </button>
      <button
        type="button"
        classList={{ active: props.locale === "en-US" }}
        aria-pressed={props.locale === "en-US"}
        onClick={() => props.onChange("en-US")}
      >
        EN
      </button>
    </div>
  );
}

export function SwitchField(props: { checked: boolean; disabled?: boolean; label: string; onLabel: string; offLabel: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      classList={{ "switch-field": true, checked: props.checked }}
      role="switch"
      aria-checked={props.checked}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      <span class="switch-track" aria-hidden="true">
        <span class="switch-thumb" />
      </span>
      <span>{props.checked ? props.onLabel : props.offLabel}</span>
      <span class="sr-only">{props.label}</span>
    </button>
  );
}

export function SelectField(props: {
  id: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  ariaLabel?: string;
  class?: string;
  menuMinWidth?: number;
  onChange: (value: string) => void;
}) {
  let buttonRef: HTMLButtonElement | undefined;
  let menuRef: HTMLDivElement | undefined;
  const [isOpen, setIsOpen] = createSignal(false);
  const [menuBounds, setMenuBounds] = createSignal<{ top: number; left: number; width: number; maxHeight: number }>();
  const selectedOption = createMemo(() => props.options.find((option) => option.value === props.value) ?? props.options[0]);

  function updateMenuBounds() {
    if (!buttonRef) return;
    const rect = buttonRef.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(Math.max(rect.width, props.menuMinWidth ?? 220), globalThis.innerWidth - viewportPadding * 2);
    const left = Math.min(Math.max(viewportPadding, rect.left), globalThis.innerWidth - width - viewportPadding);
    const expectedHeight = Math.min(260, Math.max(46, props.options.length * 37 + 12));
    const availableBelow = globalThis.innerHeight - rect.bottom - viewportPadding - 8;
    const availableAbove = rect.top - viewportPadding - 8;
    const shouldOpenAbove = availableBelow < expectedHeight && availableAbove > availableBelow;
    const maxHeight = Math.max(96, Math.min(expectedHeight, shouldOpenAbove ? availableAbove : availableBelow));
    setMenuBounds({
      top: shouldOpenAbove ? Math.max(viewportPadding, rect.top - maxHeight - 8) : rect.bottom + 8,
      left,
      width,
      maxHeight
    });
  }

  function openMenu() {
    updateMenuBounds();
    setIsOpen(true);
  }

  function closeMenu() {
    setIsOpen(false);
  }

  function choose(value: string) {
    props.onChange(value);
    closeMenu();
    buttonRef?.focus();
  }

  function focusAdjacentOption(direction: 1 | -1) {
    const options = Array.from(menuRef?.querySelectorAll<HTMLButtonElement>(".select-field-option") ?? []);
    if (options.length === 0) return;
    const currentIndex = Math.max(0, options.indexOf(globalThis.document.activeElement as HTMLButtonElement));
    options[(currentIndex + direction + options.length) % options.length]?.focus();
  }

  createEffect(() => {
    if (!isOpen()) return;
    updateMenuBounds();

    globalThis.requestAnimationFrame(() => {
      menuRef?.querySelector<HTMLButtonElement>(".select-field-option.selected")?.focus();
    });

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || buttonRef?.contains(target) || menuRef?.contains(target)) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        buttonRef?.focus();
      }
    };

    globalThis.addEventListener("pointerdown", handlePointerDown);
    globalThis.addEventListener("keydown", handleKeyDown);
    globalThis.addEventListener("resize", updateMenuBounds);
    globalThis.addEventListener("scroll", updateMenuBounds, true);
    onCleanup(() => {
      globalThis.removeEventListener("pointerdown", handlePointerDown);
      globalThis.removeEventListener("keydown", handleKeyDown);
      globalThis.removeEventListener("resize", updateMenuBounds);
      globalThis.removeEventListener("scroll", updateMenuBounds, true);
    });
  });

  return (
    <div class={`select-field ${props.class ?? ""}`.trim()}>
      <button
        id={props.id}
        ref={buttonRef}
        type="button"
        class="select-field-trigger"
        aria-haspopup="listbox"
        aria-label={props.ariaLabel}
        aria-expanded={isOpen()}
        onClick={() => (isOpen() ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        <span>{selectedOption()?.label ?? props.value}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      <Portal>
        <Show when={isOpen() && menuBounds()}>
          {(bounds) => (
            <div
              ref={menuRef}
              class="select-field-menu"
              role="listbox"
              aria-labelledby={props.id}
              data-kb-top-layer=""
              style={{
                top: `${bounds().top}px`,
                left: `${bounds().left}px`,
                width: `${bounds().width}px`,
                "max-height": `${bounds().maxHeight}px`
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusAdjacentOption(1);
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  focusAdjacentOption(-1);
                }
              }}
            >
              <For each={props.options}>
                {(option) => (
                  <button
                    type="button"
                    role="option"
                    classList={{ "select-field-option": true, selected: option.value === props.value }}
                    aria-selected={option.value === props.value}
                    onClick={() => choose(option.value)}
                  >
                    <span class="select-field-check">{option.value === props.value ? <Check size={16} /> : null}</span>
                    <span>{option.label}</span>
                  </button>
                )}
              </For>
            </div>
          )}
        </Show>
      </Portal>
    </div>
  );
}
