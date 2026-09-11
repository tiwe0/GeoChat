import { useCallback, useRef, useState } from "react";

/**
 * Stands in for the hosted account session of the web build.
 *
 * GeoChat Desktop is local-first: there is no sign-in, no credit balance and
 * no OAuth. The shape is kept because the panel threads `authSessionRef`
 * through to every backend call, and the local Bun backend does accept an
 * optional shared token (GEOCHAT_DESKTOP_LOCAL_AUTH_TOKEN) for the desktop MCP
 * batch path — so the slot stays, only its source changes.
 *
 * Sign-in, billing and device bridging belong to the Pro build and are
 * deliberately absent from this repository (see OPEN_SOURCE.md).
 */
export type LocalSessionRef = { current: { token: string | null } };

export function useLocalSession(options: { localAuthToken?: string | null } = {}) {
  const authSessionRef = useRef<{ token: string | null }>({
    token: options.localAuthToken ?? null
  });
  const [authError, setAuthError] = useState<string | null>(null);

  const setLocalToken = useCallback((token: string | null) => {
    authSessionRef.current = { token };
  }, []);

  return {
    authSessionRef,
    /** Always null: the desktop build has no account. */
    account: null,
    authError,
    setAuthError,
    setLocalToken
  };
}
