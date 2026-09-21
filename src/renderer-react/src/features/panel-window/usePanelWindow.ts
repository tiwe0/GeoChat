import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";

export type PanelView = "chat" | "user";
export type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export const PANEL_WINDOW_STORAGE_KEY = "geogebraCopilotPanelWindow";
export const PANEL_WINDOW_STORAGE_VERSION = 2;
export const VIEWPORT_GUTTER = 8;
export const DEFAULT_PANEL_WIDTH = 600;
export const DEFAULT_PANEL_HEIGHT = 600;
export const MIN_PANEL_WIDTH = 320;
export const USER_PAGE_MIN_HEIGHT = 600;
export const USER_PAGE_MIN_WIDTH = Math.round(USER_PAGE_MIN_HEIGHT / 1.61803398875);
export const CHAT_PAGE_MIN_HEIGHT = 600;
export const RESIZE_HANDLES = [
  { direction: "n", cursor: "ns-resize", position: { top: 0, left: 12, right: 12, height: 6 } },
  { direction: "ne", cursor: "nesw-resize", position: { top: 0, right: 0, width: 12, height: 12 } },
  { direction: "e", cursor: "ew-resize", position: { top: 12, right: 0, bottom: 12, width: 6 } },
  { direction: "se", cursor: "nwse-resize", position: { right: 0, bottom: 0, width: 12, height: 12 } },
  { direction: "s", cursor: "ns-resize", position: { right: 12, bottom: 0, left: 12, height: 6 } },
  { direction: "sw", cursor: "nesw-resize", position: { bottom: 0, left: 0, width: 12, height: 12 } },
  { direction: "w", cursor: "ew-resize", position: { top: 12, bottom: 12, left: 0, width: 6 } },
  { direction: "nw", cursor: "nwse-resize", position: { top: 0, left: 0, width: 12, height: 12 } },
] as const satisfies ReadonlyArray<{ direction: ResizeDirection; cursor: string; position: Record<string, number> }>;

type PanelPosition = { left: number; top: number; right: number };
type PersistedPanelWindow = { version: 2; left: number; top: number; width?: number; height?: number };
type PanelDragState = { host: HTMLElement; pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean; interactiveClick: boolean };
type PanelResizeState = { panel: HTMLElement; host: HTMLElement; pointerId: number; direction: ResizeDirection; startX: number; startY: number; startLeft: number; startTop: number; startWidth: number; startHeight: number };

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function clampPanelGeometry(
  geometry: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
  gutter = VIEWPORT_GUTTER,
) {
  const width = Math.min(geometry.width, Math.max(0, viewport.width - gutter * 2));
  const height = Math.min(geometry.height, Math.max(0, viewport.height - gutter * 2));
  return {
    left: clamp(geometry.left, gutter, Math.max(gutter, viewport.width - width - gutter)),
    top: clamp(geometry.top, gutter, Math.max(gutter, viewport.height - height - gutter)),
    width,
    height,
  };
}

function panelHost(handle: HTMLElement) {
  const root = handle.getRootNode();
  if (root instanceof ShadowRoot && root.host instanceof HTMLElement) return root.host;
  return handle.closest<HTMLElement>("#geochat-panel-host") ?? handle.parentElement;
}

function readPanelPosition(host: HTMLElement): PanelPosition {
  const bounds = host.getBoundingClientRect();
  return { left: bounds.left, top: bounds.top, right: Math.max(VIEWPORT_GUTTER, window.innerWidth - bounds.right) };
}

function clampPanelPosition(host: HTMLElement, left: number, top: number) {
  const bounds = host.getBoundingClientRect();
  const geometry = clampPanelGeometry({ left, top, width: bounds.width, height: bounds.height }, { width: window.innerWidth, height: window.innerHeight });
  host.style.left = `${geometry.left}px`;
  host.style.top = `${geometry.top}px`;
}

export function parsePersistedPanelWindow(value: unknown): PersistedPanelWindow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  if ((stored.version !== 1 && stored.version !== PANEL_WINDOW_STORAGE_VERSION) || !Number.isFinite(stored.left) || !Number.isFinite(stored.top)) return null;
  const dimensions = stored.version === PANEL_WINDOW_STORAGE_VERSION
    ? {
        ...(typeof stored.width === "number" && Number.isFinite(stored.width) ? { width: stored.width } : {}),
        ...(typeof stored.height === "number" && Number.isFinite(stored.height) ? { height: stored.height } : {}),
      }
    : {};
  return {
    version: PANEL_WINDOW_STORAGE_VERSION,
    left: stored.left as number,
    top: stored.top as number,
    ...dimensions,
  };
}

export function usePanelWindow(view: PanelView) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState<ResizeDirection | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<PanelDragState | null>(null);
  const resizeRef = useRef<PanelResizeState | null>(null);
  const suppressRestoreClickRef = useRef(false);
  const expandedPositionRef = useRef<PanelPosition | null>(null);
  const expandedWidthRef = useRef<string | null>(null);
  const expandedHeightRef = useRef<string | null>(null);

  function persist() {
    const panel = panelRef.current;
    const host = panel ? panelHost(panel) : null;
    if (!panel || !host) return;
    const position = readPanelPosition(host);
    void browser.storage.local.set({
      [PANEL_WINDOW_STORAGE_KEY]: {
        version: PANEL_WINDOW_STORAGE_VERSION,
        left: position.left,
        top: position.top,
        ...((panel.style.width || expandedWidthRef.current) ? { width: Number.parseFloat(panel.style.width || expandedWidthRef.current!) } : {}),
        ...((panel.style.height || expandedHeightRef.current) ? { height: Number.parseFloat(panel.style.height || expandedHeightRef.current!) } : {}),
      } satisfies PersistedPanelWindow,
    });
  }

  useEffect(() => {
    let disposed = false;
    const frame = window.requestAnimationFrame(() => {
      void browser.storage.local.get(PANEL_WINDOW_STORAGE_KEY).then((stored) => {
        if (disposed) return;
        const saved = parsePersistedPanelWindow(stored[PANEL_WINDOW_STORAGE_KEY]);
        const panel = panelRef.current;
        const host = panel ? panelHost(panel) : null;
        if (!saved || !panel || !host) return;
        if (saved.width) panel.style.width = `${saved.width}px`;
        if (saved.height) panel.style.height = `${saved.height}px`;
        const bounds = panel.getBoundingClientRect();
        const geometry = clampPanelGeometry({ left: saved.left, top: saved.top, width: bounds.width, height: bounds.height }, { width: window.innerWidth, height: window.innerHeight });
        host.style.inset = "auto";
        host.style.right = "auto";
        host.style.left = `${geometry.left}px`;
        host.style.top = `${geometry.top}px`;
        expandedPositionRef.current = { left: geometry.left, top: geometry.top, right: Math.max(VIEWPORT_GUTTER, window.innerWidth - geometry.left - geometry.width) };
        expandedWidthRef.current = panel.style.width || null;
        expandedHeightRef.current = panel.style.height || null;
      }).catch((error) => {
        console.error("[ERROR] Failed to restore panel geometry", error);
      });
    });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (collapsed) return;
    const keepPanelInViewport = () => {
      const panel = panelRef.current;
      const host = panel ? panelHost(panel) : null;
      if (!panel || !host || !host.style.left || !host.style.top) return;
      const bounds = panel.getBoundingClientRect();
      if (panel.style.width && bounds.width > window.innerWidth - VIEWPORT_GUTTER * 2) panel.style.width = `${Math.max(0, window.innerWidth - VIEWPORT_GUTTER * 2)}px`;
      if (panel.style.height && bounds.height > window.innerHeight - VIEWPORT_GUTTER * 2) panel.style.height = `${Math.max(0, window.innerHeight - VIEWPORT_GUTTER * 2)}px`;
      const hostBounds = host.getBoundingClientRect();
      clampPanelPosition(host, hostBounds.left, hostBounds.top);
    };
    const frame = window.requestAnimationFrame(keepPanelInViewport);
    window.addEventListener("resize", keepPanelInViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", keepPanelInViewport);
    };
  }, [collapsed]);

  useEffect(() => {
    if (collapsed || !expandedHeightRef.current) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (expandedWidthRef.current) panel.style.width = expandedWidthRef.current;
    panel.style.height = expandedHeightRef.current;
    panel.style.maxHeight = "none";
  }, [collapsed]);

  function startDragging(event: PointerEvent<HTMLElement>, allowInteractive = false) {
    if (!event.isPrimary || event.button !== 0) return;
    if (!allowInteractive && event.target instanceof Element && event.target.closest("button, input, textarea, select, a, [data-copilot-no-drag]")) return;
    // The collapsed restore control is also the only draggable surface. Keep
    // the click alive when the pointer does not move, but let pointer capture
    // take over when the user drags from the button or its image.
    const interactiveClick = allowInteractive && event.target instanceof Element
      && Boolean(event.target.closest("button, input, textarea, select, a"));
    const host = panelHost(event.currentTarget);
    if (!host) return;
    const bounds = host.getBoundingClientRect();
    host.style.transition = "none";
    host.style.inset = "auto";
    host.style.left = `${bounds.left}px`;
    host.style.right = "auto";
    host.style.top = `${bounds.top}px`;
    host.style.willChange = "left, top";
    dragRef.current = { host, pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, startX: event.clientX, startY: event.clientY, moved: false, interactiveClick };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    if (!interactiveClick) event.preventDefault();
  }

  function moveDragging(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
    clampPanelPosition(drag.host, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    event.preventDefault();
  }

  function stopDragging(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.host.style.willChange = "";
    if (drag.moved) {
      expandedPositionRef.current = readPanelPosition(drag.host);
      suppressRestoreClickRef.current = true;
      window.setTimeout(() => { suppressRestoreClickRef.current = false; }, 0);
      persist();
    } else if (collapsed && drag.interactiveClick) {
      // Pointer capture can prevent the browser from dispatching the button's
      // click reliably. Restore directly on a stationary pointer release and
      // suppress the follow-up click to avoid toggling twice.
      suppressRestoreClickRef.current = true;
      window.setTimeout(() => { suppressRestoreClickRef.current = false; }, 0);
      toggleCollapsed();
    }
    dragRef.current = null;
    setDragging(false);
  }

  function toggleCollapsed() {
    const panel = panelRef.current;
    const host = panel ? panelHost(panel) : null;
    const transition = "left 240ms cubic-bezier(0.22, 1, 0.36, 1), top 240ms cubic-bezier(0.22, 1, 0.36, 1)";
    if (!collapsed && host) {
      const position = expandedPositionRef.current ?? readPanelPosition(host);
      expandedPositionRef.current = position;
      host.style.transition = "none";
      host.style.inset = "auto";
      host.style.left = "auto";
      host.style.right = `${position.right}px`;
      host.style.top = `${position.top}px`;
      void host.offsetWidth;
      host.style.transition = transition;
      host.style.top = `${position.top + 8}px`;
    } else if (collapsed && host && expandedPositionRef.current) {
      const position = expandedPositionRef.current;
      host.style.transition = transition;
      host.style.inset = "auto";
      host.style.left = "auto";
      host.style.right = `${position.right}px`;
      host.style.top = `${position.top}px`;
      window.setTimeout(() => { if (host.style.transition === transition) host.style.transition = ""; }, 260);
    }
    if (!collapsed && panel?.style.height) expandedHeightRef.current = panel.style.height;
    if (!collapsed && panel?.style.width) expandedWidthRef.current = panel.style.width;
    if (!collapsed && panel) {
      panel.style.width = "";
      panel.style.height = "";
      panel.style.maxWidth = "";
      panel.style.maxHeight = "";
    }
    setCollapsed((value) => !value);
  }

  function handleCollapsedRestoreClick(event: MouseEvent<HTMLButtonElement>) {
    if (suppressRestoreClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressRestoreClickRef.current = false;
      return;
    }
    toggleCollapsed();
  }

  function startResizing(direction: ResizeDirection) {
    return (event: PointerEvent<HTMLElement>) => {
      if (!event.isPrimary || event.button !== 0) return;
      const panel = panelRef.current;
      const host = panel ? panelHost(panel) : null;
      if (!panel || !host) return;
      const panelBounds = panel.getBoundingClientRect();
      const hostBounds = host.getBoundingClientRect();
      host.style.inset = "auto";
      host.style.transition = "none";
      host.style.left = `${hostBounds.left}px`;
      host.style.top = `${hostBounds.top}px`;
      host.style.willChange = "left, top";
      panel.style.width = `${panelBounds.width}px`;
      panel.style.height = `${panelBounds.height}px`;
      panel.style.maxHeight = "none";
      panel.style.willChange = "width, height";
      resizeRef.current = { panel, host, pointerId: event.pointerId, direction, startX: event.clientX, startY: event.clientY, startLeft: hostBounds.left, startTop: hostBounds.top, startWidth: panelBounds.width, startHeight: panelBounds.height };
      event.currentTarget.setPointerCapture(event.pointerId);
      setResizing(direction);
      event.preventDefault();
      event.stopPropagation();
    };
  }

  function moveResizing(event: PointerEvent<HTMLElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - resize.startX;
    const deltaY = event.clientY - resize.startY;
    const startRight = resize.startLeft + resize.startWidth;
    const startBottom = resize.startTop + resize.startHeight;
    const minWidth = Math.min(view === "user" ? USER_PAGE_MIN_WIDTH : MIN_PANEL_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2);
    const minHeight = Math.min(view === "user" ? USER_PAGE_MIN_HEIGHT : CHAT_PAGE_MIN_HEIGHT, window.innerHeight - VIEWPORT_GUTTER * 2);
    let left = resize.startLeft;
    let top = resize.startTop;
    let width = resize.startWidth;
    let height = resize.startHeight;
    if (resize.direction.includes("e")) width = clamp(resize.startWidth + deltaX, minWidth, window.innerWidth - resize.startLeft - VIEWPORT_GUTTER);
    if (resize.direction.includes("w")) { left = clamp(resize.startLeft + deltaX, VIEWPORT_GUTTER, startRight - minWidth); width = startRight - left; }
    if (resize.direction.includes("s")) height = clamp(resize.startHeight + deltaY, minHeight, window.innerHeight - resize.startTop - VIEWPORT_GUTTER);
    if (resize.direction.includes("n")) { top = clamp(resize.startTop + deltaY, VIEWPORT_GUTTER, startBottom - minHeight); height = startBottom - top; }
    resize.host.style.left = `${left}px`;
    resize.host.style.top = `${top}px`;
    resize.panel.style.width = `${width}px`;
    resize.panel.style.height = `${height}px`;
    event.preventDefault();
    event.stopPropagation();
  }

  function stopResizing(event: PointerEvent<HTMLElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resize.host.style.willChange = "";
    resize.panel.style.willChange = "";
    expandedPositionRef.current = readPanelPosition(resize.host);
    expandedWidthRef.current = resize.panel.style.width;
    expandedHeightRef.current = resize.panel.style.height;
    resizeRef.current = null;
    setResizing(null);
    persist();
    event.stopPropagation();
  }

  return { panelRef: panelRef as RefObject<HTMLDivElement>, collapsed, setCollapsed, dragging, resizing, startDragging, moveDragging, stopDragging, toggleCollapsed, handleCollapsedRestoreClick, startResizing, moveResizing, stopResizing };
}
