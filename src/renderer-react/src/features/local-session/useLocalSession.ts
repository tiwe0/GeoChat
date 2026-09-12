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
/**
 * The generation guard the conversation hooks rely on: they snapshot before an
 * await and check `isCurrent` after, so a late response cannot overwrite state
 * belonging to a newer session. There are no accounts to switch between here,
 * but the token can still change, and dropping the guard would reintroduce the
 * race it exists to prevent.
 */
export type AuthSessionSnapshot = { token: string | null; generation: number };

export type AuthSessionController = {
  token: string | null;
  snapshot(): AuthSessionSnapshot;
  isCurrent(snapshot: AuthSessionSnapshot): boolean;
};

export type LocalSessionRef = { current: AuthSessionController };


export function useLocalSession(options: { localAuthToken?: string | null } = {}) {
  const generationRef = useRef(0);
  // Held separately so the controller's snapshot() can read the current token
  // without referencing the ref that contains it.
  const tokenRef = useRef<string | null>(options.localAuthToken ?? null);
  const authSessionRef = useRef<AuthSessionController>({
    token: tokenRef.current,
    snapshot: () => ({ token: tokenRef.current, generation: generationRef.current }),
    isCurrent: (snapshot: AuthSessionSnapshot) => snapshot.generation === generationRef.current
  });
  const [authError, setAuthError] = useState<string | null>(null);

  const setLocalToken = useCallback((token: string | null) => {
    // A new generation invalidates anything already in flight.
    generationRef.current += 1;
    tokenRef.current = token;
    authSessionRef.current = { ...authSessionRef.current, token };
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
