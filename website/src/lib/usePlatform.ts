import { useEffect, useState } from "react";
import { detectPlatform, type Platform } from "../lib/platform";

/**
 * Returns "unknown" on the server and on the first client render, then the
 * detected platform. Deferring past hydration keeps the prerendered HTML and
 * the first client render identical, so React never warns and the button never
 * flickers between two labels mid-paint.
 */
export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>("unknown");
  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);
  return platform;
}
