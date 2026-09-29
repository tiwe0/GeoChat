import { readDesktopConfig } from "../../../../shared/desktop/desktop-config";
import type {
  DesktopRealUiProbeOperation,
  DesktopRealUiProbeTarget,
} from "../../../../shared/desktop/mcp-debug-actions";

const DETERMINISTIC_PROVIDER_NAME = "GeoChat deterministic E2E";
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function assertRestrictedUiProbeOwner(nonce: string) {
  const environment = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  if (environment?.DEV !== true) throw new Error("The real UI probe is only available in a development build.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce)) {
    throw new Error("A valid deterministic E2E nonce is required for the real UI probe.");
  }
  if (readDesktopConfig().customProvider.name !== `${DETERMINISTIC_PROVIDER_NAME}:${nonce}`) {
    throw new Error("The current provider configuration is not owned by this deterministic E2E UI probe.");
  }
}

function panelRoot(element: Element) {
  return element.closest<HTMLElement>("[data-fusion-panel]");
}

function describe(element: Element | null) {
  if (!element) return null;
  const html = element as HTMLElement;
  return {
    tag: element.tagName.toLowerCase(),
    ariaLabel: element.getAttribute("aria-label"),
    fusionPanel: element.getAttribute("data-fusion-panel") ?? panelRoot(element)?.getAttribute("data-fusion-panel") ?? null,
    tour: element.getAttribute("data-copilot-tour"),
    composerVariant: element.getAttribute("data-composer-variant"),
    text: (html.innerText || element.textContent || "").trim().slice(0, 240),
  };
}

function click(document: Document, selector: string, label: string) {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`${label} was not found.`);
  if (button.disabled) throw new Error(`${label} is disabled.`);
  button.click();
  return describe(button);
}

function setComposerText(document: Document, text: string) {
  const input = document.querySelector<HTMLTextAreaElement>("[data-geochat-composer='true'] textarea");
  if (!input) throw new Error("The active GeoChat composer textarea was not found.");
  const TextArea = document.defaultView?.HTMLTextAreaElement;
  const setter = TextArea ? Object.getOwnPropertyDescriptor(TextArea.prototype, "value")?.set : undefined;
  if (setter) setter.call(input, text);
  else input.value = text;
  const InputEventConstructor = document.defaultView?.InputEvent;
  input.dispatchEvent(InputEventConstructor
    ? new InputEventConstructor("input", { bubbles: true, inputType: "insertText", data: text })
    : new Event("input", { bubbles: true }));
  input.focus({ preventScroll: true });
  return { text: input.value, focused: document.activeElement === input };
}

function snapshot(document: Document) {
  const composer = document.querySelector<HTMLElement>("[data-geochat-composer='true']");
  const input = composer?.querySelector<HTMLTextAreaElement>("textarea") ?? null;
  const send = composer?.querySelector<HTMLButtonElement>("button[data-copilot-tour$='send']") ?? null;
  const messages = Array.from(document.querySelectorAll<HTMLElement>("[data-geochat-message='true']"))
    .slice(-20)
    .map((element) => ({
      role: element.getAttribute("data-message-role") ?? "unknown",
      text: (element.innerText || element.textContent || "").trim().slice(0, 2_000),
    }));
  const liveRegions = Array.from(document.querySelectorAll<HTMLElement>("[aria-live]"))
    .map((element) => ({
      politeness: element.getAttribute("aria-live"),
      role: element.getAttribute("role"),
      text: (element.innerText || element.textContent || "").trim().slice(0, 500),
    }));
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog']"))
    .filter((element) => element.getClientRects().length > 0 && !element.closest("[aria-hidden='true']"))
    .map((element) => ({
      panel: panelRoot(element)?.getAttribute("data-fusion-panel") ?? element.getAttribute("data-fusion-panel"),
      ariaModal: element.getAttribute("aria-modal"),
      ariaLabel: element.getAttribute("aria-label"),
      containsFocus: element.contains(document.activeElement),
    }));
  return {
    mode: document.querySelector("[data-interaction-mode='fusion']") ? "fusion" : "window",
    composer: composer ? {
      variant: composer.getAttribute("data-composer-variant"),
      text: input?.value ?? null,
      focused: document.activeElement === input,
      sendDisabled: send?.disabled ?? null,
    } : null,
    messages,
    liveRegions,
    dialogs,
    activeElement: describe(document.activeElement),
  };
}

function cycleDialogFocus(document: Document, target: DesktopRealUiProbeTarget | undefined) {
  if (target !== "settings" && target !== "transcript") {
    throw new Error("cycle_dialog_focus requires a supported Fusion dialog target.");
  }
  const dialog = document.querySelector<HTMLElement>(
    `[data-fusion-panel='${target}'] [role='dialog'], [role='dialog'][data-fusion-panel='${target}']`,
  );
  if (!dialog) throw new Error(`The ${target} Fusion dialog was not found.`);
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) throw new Error(`The ${target} Fusion dialog has no focusable boundary.`);
  const KeyboardEventConstructor = document.defaultView?.KeyboardEvent;
  if (!KeyboardEventConstructor) throw new Error("KeyboardEvent is unavailable in the active WebView.");
  last.focus({ preventScroll: true });
  last.dispatchEvent(new KeyboardEventConstructor("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  const forwardWrapped = document.activeElement === first;
  first.focus({ preventScroll: true });
  first.dispatchEvent(new KeyboardEventConstructor("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
  const backwardWrapped = document.activeElement === last;
  if (!forwardWrapped || !backwardWrapped) {
    throw new Error(`The ${target} Fusion dialog did not keep keyboard focus inside both boundaries.`);
  }
  return {
    panel: target,
    focusableCount: focusable.length,
    forwardWrapped,
    backwardWrapped,
    first: describe(first),
    last: describe(last),
    activeElement: describe(document.activeElement),
  };
}

function closeActiveDialog(document: Document) {
  const dialog = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog']"))
    .find((element) => element.getClientRects().length > 0 && !element.closest("[aria-hidden='true']"));
  if (!dialog) throw new Error("No active dialog was found.");
  const root = panelRoot(dialog) ?? dialog;
  const closeButton = root.querySelector<HTMLButtonElement>("[data-fusion-panel-close]")
    ?? dialog.querySelector<HTMLButtonElement>("button[aria-label]");
  if (!closeButton) throw new Error("The active dialog has no supported close control.");
  if (closeButton.disabled) throw new Error("The active dialog close control is disabled.");
  closeButton.click();
  return { dialog: describe(dialog), button: describe(closeButton) };
}

export function executeRestrictedDesktopUiProbe(
  document: Document,
  operation: DesktopRealUiProbeOperation,
  input: { text?: string; target?: DesktopRealUiProbeTarget },
) {
  if (operation === "snapshot") return snapshot(document);
  if (operation === "set_composer_text") {
    if (typeof input.text !== "string" || input.text.length > 20_000) {
      throw new Error("set_composer_text requires text no longer than 20,000 characters.");
    }
    return { operation, ...setComposerText(document, input.text), snapshot: snapshot(document) };
  }
  if (operation === "submit_composer") {
    const before = snapshot(document);
    const button = click(document, "[data-geochat-composer='true'] button[data-copilot-tour$='send']", "The active composer send button");
    return { operation, button, before, after: snapshot(document) };
  }
  if (operation === "switch_mode") {
    if (input.target !== "window" && input.target !== "fusion") throw new Error("switch_mode requires window or fusion as its target.");
    const button = click(document, `[data-interaction-mode-toggle][data-target-mode='${input.target}']`, `The switch-to-${input.target} button`);
    return { operation, target: input.target, button };
  }
  if (operation === "open_fusion_panel") {
    if (input.target !== "history" && input.target !== "settings" && input.target !== "transcript") {
      throw new Error("open_fusion_panel requires history, settings, or transcript as its target.");
    }
    const button = click(document, `[data-copilot-tour='fusion-${input.target}']`, `The Fusion ${input.target} button`);
    return { operation, target: input.target, button };
  }
  if (operation === "close_fusion_panel") return { operation, ...closeActiveDialog(document) };
  if (operation === "cycle_dialog_focus") return { operation, ...cycleDialogFocus(document, input.target) };
  throw new Error(`Unsupported restricted real UI probe operation: ${operation satisfies never}`);
}
