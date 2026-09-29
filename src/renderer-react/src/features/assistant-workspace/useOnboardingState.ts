import { useCallback, useEffect, useState } from "react";

export const ONBOARDING_TOUR_STORAGE_KEY = "geogebraCopilotOnboardingTourCompleted";
export const ONBOARDING_TOUR_VERSION = 3;

export function useOnboardingState() {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    void browser.storage.local
      .get(ONBOARDING_TOUR_STORAGE_KEY)
      .then((stored) => setReady(stored[ONBOARDING_TOUR_STORAGE_KEY] !== ONBOARDING_TOUR_VERSION))
      .catch((error) => {
        console.error("[ERROR] Failed to read onboarding state", error);
        setReady(true);
      });
  }, []);

  const complete = useCallback(() => {
    setReady(false);
    void browser.storage.local.set({ [ONBOARDING_TOUR_STORAGE_KEY]: ONBOARDING_TOUR_VERSION });
  }, []);

  const restart = useCallback(() => {
    setReady(false);
    void browser.storage.local.remove(ONBOARDING_TOUR_STORAGE_KEY).then(
      () => setReady(true),
      () => setReady(true),
    );
  }, []);

  return { ready, complete, restart };
}
