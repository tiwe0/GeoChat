import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TouchEvent,
  type UIEvent,
  type WheelEvent,
} from "react";

const BOTTOM_THRESHOLD = 8;

export type FusionCardScrollMode = "browse" | "follow";
export type FusionCardScrollEvent = "follow-latest" | "reached-bottom" | "user-browse";

export function nextFusionCardScrollMode(
  current: FusionCardScrollMode,
  event: FusionCardScrollEvent,
): FusionCardScrollMode {
  if (event === "user-browse") return "browse";
  if (event === "follow-latest" || event === "reached-bottom") return "follow";
  return current;
}

export function fusionCardScrollEventForViewport(
  mode: FusionCardScrollMode,
  atBottom: boolean,
): FusionCardScrollEvent | null {
  // Native scroll events also fire for layout reflow and programmatic
  // scrollTop updates. Only explicit wheel/touch/keyboard intent may detach
  // streaming output from follow mode.
  return mode === "browse" && atBottom ? "reached-bottom" : null;
}

type UseFusionCardScrollOptions = {
  active: boolean;
  targetKey?: string;
  viewportKey?: string;
};

function isAtBottom(viewport: HTMLElement) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= BOTTOM_THRESHOLD;
}

function canBrowseEarlier(viewport: HTMLElement) {
  return viewport.scrollTop > BOTTOM_THRESHOLD;
}

export function useFusionCardScroll({ active, targetKey, viewportKey }: UseFusionCardScrollOptions) {
  const [mode, setMode] = useState<FusionCardScrollMode>("follow");
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<FusionCardScrollMode>("follow");
  const activeRef = useRef(active);
  const savedScrollTopRef = useRef(0);
  const savedScrollTopsRef = useRef(new Map<string, number>());
  const viewportKeyRef = useRef(viewportKey);
  const touchYRef = useRef<number | null>(null);
  const autoScrollingRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const releaseFrameRef = useRef<number | null>(null);
  activeRef.current = active;
  viewportKeyRef.current = viewportKey;

  const changeMode = useCallback((nextMode: FusionCardScrollMode) => {
    modeRef.current = nextMode;
    setMode((currentMode) => currentMode === nextMode ? currentMode : nextMode);
  }, []);

  const cancelScheduledScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    if (releaseFrameRef.current !== null) cancelAnimationFrame(releaseFrameRef.current);
    scrollFrameRef.current = null;
    releaseFrameRef.current = null;
  }, []);

  const enterBrowseMode = useCallback(() => {
    if (modeRef.current === "browse") return;
    cancelScheduledScroll();
    autoScrollingRef.current = false;
    changeMode(nextFusionCardScrollMode(modeRef.current, "user-browse"));
  }, [cancelScheduledScroll, changeMode]);

  const scrollToLatest = useCallback(() => {
    if (!activeRef.current || modeRef.current !== "follow") return;
    // Coalesce rapid streaming updates into one scroll per animation frame.
    // Cancelling and rescheduling here can starve the scroll indefinitely
    // while tokens arrive faster than the browser paints.
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const viewport = viewportRef.current;
      if (!viewport || modeRef.current !== "follow") return;
      autoScrollingRef.current = true;
      viewport.scrollTop = viewport.scrollHeight;
      savedScrollTopRef.current = viewport.scrollTop;
      if (releaseFrameRef.current !== null) cancelAnimationFrame(releaseFrameRef.current);
      releaseFrameRef.current = requestAnimationFrame(() => {
        releaseFrameRef.current = null;
        autoScrollingRef.current = false;
      });
    });
  }, []);

  const followLatest = useCallback(() => {
    changeMode(nextFusionCardScrollMode(modeRef.current, "follow-latest"));
    scrollToLatest();
  }, [changeMode, scrollToLatest]);

  useLayoutEffect(() => {
    cancelScheduledScroll();
    autoScrollingRef.current = false;
    touchYRef.current = null;
    savedScrollTopRef.current = 0;
    changeMode("follow");

    const viewport = viewportRef.current;
    if (!active || !viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
    savedScrollTopRef.current = viewport.scrollTop;
  }, [active, cancelScheduledScroll, changeMode, targetKey]);

  useLayoutEffect(() => {
    if (!active) return;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    if (modeRef.current === "follow") {
      scrollToLatest();
    } else {
      autoScrollingRef.current = true;
      const savedScrollTop = viewportKey
        ? savedScrollTopsRef.current.get(viewportKey)
        : undefined;
      viewport.scrollTop = savedScrollTop ?? viewport.scrollHeight;
      savedScrollTopRef.current = viewport.scrollTop;
      releaseFrameRef.current = requestAnimationFrame(() => {
        releaseFrameRef.current = null;
        autoScrollingRef.current = false;
      });
    }

    const resizeObserver = new ResizeObserver(scrollToLatest);
    resizeObserver.observe(content);
    resizeObserver.observe(viewport);

    return () => {
      savedScrollTopRef.current = viewport.scrollTop;
      if (viewportKey) savedScrollTopsRef.current.set(viewportKey, viewport.scrollTop);
      touchYRef.current = null;
      resizeObserver.disconnect();
      cancelScheduledScroll();
      autoScrollingRef.current = false;
    };
  }, [active, cancelScheduledScroll, scrollToLatest, viewportKey]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    savedScrollTopRef.current = viewport.scrollTop;
    const ownerKey = viewportKeyRef.current;
    if (ownerKey) savedScrollTopsRef.current.set(ownerKey, viewport.scrollTop);

    if (autoScrollingRef.current) return;
    const eventType = fusionCardScrollEventForViewport(modeRef.current, isAtBottom(viewport));
    if (eventType) changeMode(nextFusionCardScrollMode(modeRef.current, eventType));
  }, [changeMode]);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (event.deltaY < 0 && canBrowseEarlier(event.currentTarget)) enterBrowseMode();
  }, [enterBrowseMode]);

  const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    touchYRef.current = event.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const currentY = event.touches[0]?.clientY;
    const previousY = touchYRef.current;
    if (currentY === undefined) return;
    if (previousY !== null && currentY > previousY + 1 && canBrowseEarlier(event.currentTarget)) {
      enterBrowseMode();
    }
    touchYRef.current = currentY;
  }, [enterBrowseMode]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const movesUp = event.key === "ArrowUp"
      || event.key === "PageUp"
      || event.key === "Home"
      || (event.key === " " && event.shiftKey);
    if (movesUp && canBrowseEarlier(event.currentTarget)) enterBrowseMode();
  }, [enterBrowseMode]);

  return {
    mode,
    viewportRef,
    contentRef,
    scrollToLatest,
    followLatest,
    pauseFollowing: enterBrowseMode,
    handleScroll,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleKeyDown,
  };
}
