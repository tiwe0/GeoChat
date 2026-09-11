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

export type MessageScrollMode = "browse" | "follow";

type UseMessageScrollOptions = {
  active: boolean;
};

function isAtBottom(viewport: HTMLElement) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= BOTTOM_THRESHOLD;
}

export function useMessageScroll({ active }: UseMessageScrollOptions) {
  const [mode, setMode] = useState<MessageScrollMode>("follow");
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<MessageScrollMode>("follow");
  const activeRef = useRef(active);
  const lastScrollTopRef = useRef(0);
  const savedScrollTopRef = useRef(0);
  const touchYRef = useRef<number | null>(null);
  const autoScrollingRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const releaseFrameRef = useRef<number | null>(null);
  activeRef.current = active;

  const changeMode = useCallback((nextMode: MessageScrollMode) => {
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
    changeMode("browse");
  }, [cancelScheduledScroll, changeMode]);

  const scrollToLatest = useCallback(() => {
    if (!activeRef.current || modeRef.current !== "follow") return;
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const viewport = viewportRef.current;
      if (!viewport || modeRef.current !== "follow") return;
      autoScrollingRef.current = true;
      viewport.scrollTop = viewport.scrollHeight;
      lastScrollTopRef.current = viewport.scrollTop;
      savedScrollTopRef.current = viewport.scrollTop;
      if (releaseFrameRef.current !== null) cancelAnimationFrame(releaseFrameRef.current);
      releaseFrameRef.current = requestAnimationFrame(() => {
        releaseFrameRef.current = null;
        autoScrollingRef.current = false;
      });
    });
  }, []);

  const followLatest = useCallback(() => {
    changeMode("follow");
    scrollToLatest();
  }, [changeMode, scrollToLatest]);

  useLayoutEffect(() => {
    if (!active) return;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    if (modeRef.current === "follow") {
      scrollToLatest();
    } else {
      autoScrollingRef.current = true;
      viewport.scrollTop = savedScrollTopRef.current;
      lastScrollTopRef.current = viewport.scrollTop;
      if (isAtBottom(viewport)) followLatest();
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
      lastScrollTopRef.current = viewport.scrollTop;
      touchYRef.current = null;
      resizeObserver.disconnect();
      cancelScheduledScroll();
      autoScrollingRef.current = false;
    };
  }, [active, cancelScheduledScroll, followLatest, scrollToLatest]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    const currentScrollTop = viewport.scrollTop;
    const movedUp = currentScrollTop < lastScrollTopRef.current - 1;
    lastScrollTopRef.current = currentScrollTop;
    savedScrollTopRef.current = currentScrollTop;

    if (autoScrollingRef.current) return;
    if (modeRef.current === "follow" && movedUp) {
      enterBrowseMode();
      return;
    }
    if (modeRef.current === "browse" && isAtBottom(viewport)) followLatest();
  }, [enterBrowseMode, followLatest]);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) enterBrowseMode();
  }, [enterBrowseMode]);

  const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    touchYRef.current = event.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const currentY = event.touches[0]?.clientY;
    const previousY = touchYRef.current;
    if (currentY === undefined) return;
    if (previousY !== null && currentY > previousY + 1) enterBrowseMode();
    touchYRef.current = currentY;
  }, [enterBrowseMode]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const movesUp = event.key === "ArrowUp"
      || event.key === "PageUp"
      || event.key === "Home"
      || (event.key === " " && event.shiftKey);
    if (movesUp) enterBrowseMode();
  }, [enterBrowseMode]);

  return {
    mode,
    viewportRef,
    contentRef,
    scrollToLatest,
    followLatest,
    handleScroll,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleKeyDown,
  };
}
