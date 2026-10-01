import { useCallback, useEffect, useState } from "react";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import { nativePreferences } from "../../lib/nativePreferences";

const logger = createStructuredLogger("assistant.onboarding-state");

export const ONBOARDING_TOUR_STORAGE_KEY = "geogebraCopilotOnboardingTourCompleted";
export const ONBOARDING_TOUR_VERSION = 3;

export function useOnboardingState() {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setReady(nativePreferences().get(ONBOARDING_TOUR_STORAGE_KEY) !== ONBOARDING_TOUR_VERSION);
    } catch (error) {
      logger.debug("state_read_failed", "ONBOARDING_STATE_READ_FAILED", { error });
      setReady(true);
    }
  }, []);

  const complete = useCallback(() => {
    setReady(false);
    void nativePreferences().set(ONBOARDING_TOUR_STORAGE_KEY, ONBOARDING_TOUR_VERSION).catch((error) => {
      logger.warn("state_write_failed", "ONBOARDING_STATE_WRITE_FAILED", { error });
      setReady(true);
    });
  }, []);

  const restart = useCallback(() => {
    setReady(false);
    void nativePreferences().remove(ONBOARDING_TOUR_STORAGE_KEY).then(
      () => setReady(true),
      () => setReady(true),
    );
  }, []);

  return { ready, complete, restart };
}
