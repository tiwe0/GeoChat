import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_APP_BUNDLE_UPDATE_STATE,
  DEFAULT_UNIFIED_UPDATE_STATE,
  DEFAULT_UPDATE_STATE,
  normalizeAppBundleUpdateState,
  normalizeUnifiedUpdateState,
  primaryUpdateAction,
  primaryUpdateActionBusy,
  unifiedUpdateFromParts,
  type DesktopPrimaryUpdateAction
} from "../../../../shared/desktop/update-state";
import type {
  RendererAppBundleUpdateState,
  RendererUnifiedUpdateState,
  RendererUpdateState
} from "../../../../shared/desktop/workbench-types";

/**
 * Desktop update state, subscribed through the shell bridge.
 *
 * Without this the app can never tell a user a new version exists, which is
 * the one capability that cannot be deferred to a later release — an app that
 * cannot update is stuck at whatever version it shipped with.
 *
 * Both tracks are covered on purpose. Watching only the shell would leave
 * renderer-only releases, which are the common kind, invisible.
 */
export type UpdateController = ReturnType<typeof useUpdateState>;

export function useUpdateState() {
  const [shell, setShell] = useState<RendererUpdateState>(DEFAULT_UPDATE_STATE);
  const [appBundle, setAppBundle] = useState<RendererAppBundleUpdateState>(DEFAULT_APP_BUNDLE_UPDATE_STATE);
  const [unified, setUnified] = useState<RendererUnifiedUpdateState>(DEFAULT_UNIFIED_UPDATE_STATE);
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);
  // The two tracks arrive on separate channels, and each recomputes the
  // recommendation from both. Reading the other one out of state inside an
  // event callback would read the value captured when the callback was
  // created, so the latest of each is mirrored here.
  const latestRef = useRef({ shell, appBundle });

  const applyShell = useCallback((next: RendererUpdateState) => {
    latestRef.current = { ...latestRef.current, shell: next };
    setShell(next);
    setUnified(unifiedUpdateFromParts(next, latestRef.current.appBundle));
  }, []);

  const applyAppBundle = useCallback((next: RendererAppBundleUpdateState) => {
    const normalized = normalizeAppBundleUpdateState(next);
    latestRef.current = { ...latestRef.current, appBundle: normalized };
    setAppBundle(normalized);
    setUnified(unifiedUpdateFromParts(latestRef.current.shell, normalized));
  }, []);

  const applyUnified = useCallback((next: RendererUnifiedUpdateState) => {
    const normalized = normalizeUnifiedUpdateState(next);
    latestRef.current = { shell: normalized.shell, appBundle: normalized.appBundle };
    setShell(normalized.shell);
    setAppBundle(normalized.appBundle);
    setUnified(normalized);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const api = window.geochatDesktop;
    if (!api) return;
    void api.getUpdateState().then((next) => { if (aliveRef.current) applyShell(next); }).catch(() => undefined);
    void api.getAppBundleUpdateState?.().then((next) => { if (aliveRef.current) applyAppBundle(next); }).catch(() => undefined);
    // The shell pushes progress during download, so polling is unnecessary.
    const unsubscribeShell = api.onUpdateState?.((next) => { if (aliveRef.current) applyShell(next); });
    const unsubscribeAppBundle = api.onAppBundleUpdateState?.((next) => { if (aliveRef.current) applyAppBundle(next); });
    return () => {
      aliveRef.current = false;
      unsubscribeShell?.();
      unsubscribeAppBundle?.();
    };
  }, [applyAppBundle, applyShell]);

  const run = useCallback(async (action: (api: NonNullable<typeof window.geochatDesktop>) => Promise<void>) => {
    const api = window.geochatDesktop;
    if (!api) return;
    setBusy(true);
    try {
      await action(api);
    } catch (error) {
      if (!aliveRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      // A failed action leaves the last known state in place and reports the
      // failure, rather than resetting to idle and hiding that a version is
      // still waiting to be installed.
      setUnified((current) => ({ ...current, status: "error", recommendation: "error", message, error: message, errorCode: "unknown" }));
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }, []);

  const check = useCallback(() => run(async (api) => {
    if (api.checkAllUpdates) {
      applyUnified(await api.checkAllUpdates());
      return;
    }
    applyShell(await api.checkForUpdates());
    if (api.checkAppBundleUpdate) applyAppBundle(await api.checkAppBundleUpdate());
  }), [applyAppBundle, applyShell, applyUnified, run]);

  const action = primaryUpdateAction({ updateState: shell, appBundleUpdateState: appBundle });
  const actionBusy = primaryUpdateActionBusy({
    unifiedUpdateBusy: busy,
    updateBusy: busy,
    appBundleUpdateBusy: busy,
    unifiedUpdateState: unified,
    updateState: shell,
    appBundleUpdateState: appBundle
  });

  const runPrimaryAction = useCallback(() => {
    if (actionBusy) return Promise.resolve();
    if (action === "install_shell") return run(async (api) => applyShell(await api.installUpdate()));
    if (action === "download_shell") return run(async (api) => applyShell(await api.downloadUpdate()));
    if (action === "install_app_bundle") {
      return run(async (api) => {
        if (api.installAppBundleUpdate) applyAppBundle(await api.installAppBundleUpdate());
      });
    }
    return check();
  }, [action, actionBusy, applyAppBundle, applyShell, check, run]);

  return {
    shell,
    appBundle,
    unified,
    busy,
    /** Present only inside the desktop shell. */
    supported: typeof window !== "undefined" && Boolean(window.geochatDesktop),
    action: action satisfies DesktopPrimaryUpdateAction,
    actionBusy,
    check,
    runPrimaryAction
  };
}
