import { useCallback, useRef } from "react";

/**
 * Keeps the optional local backend token stable across renderer requests.
 * The generation counter prevents a response created with an older token from
 * overwriting state after the local runtime configuration changes.
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
  const setLocalToken = useCallback((token: string | null) => {
    // A new generation invalidates anything already in flight.
    generationRef.current += 1;
    tokenRef.current = token;
    authSessionRef.current = { ...authSessionRef.current, token };
  }, []);

  return {
    authSessionRef,
    setLocalToken
  };
}
