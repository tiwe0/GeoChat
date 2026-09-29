import { useCallback, type RefObject } from "react";

export function useAssistantLanguageTransition(
  panelRef: RefObject<HTMLElement | null>,
  reduceMotion: boolean,
) {
  return useCallback(async (changeLanguage: () => Promise<void>) => {
    const panel = panelRef.current;
    await changeLanguage();
    if (reduceMotion || !panel) return;

    const surfaces = panel.querySelectorAll<HTMLElement>("[data-language-transition-surface]");
    await Promise.all(Array.from(surfaces, async (surface) => {
      const animation = surface.animate(
        [{ opacity: 0.76 }, { opacity: 1 }],
        { duration: 140, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
      try {
        await animation.finished;
      } catch {
        // A mode or panel change may replace the brief transition surface.
      }
    }));
  }, [panelRef, reduceMotion]);
}
