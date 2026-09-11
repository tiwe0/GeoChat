import { describe, expect, test } from "bun:test";
import {
  DEFAULT_APP_BUNDLE_UPDATE_STATE,
  DEFAULT_UPDATE_STATE,
  normalizeAppBundleUpdateState,
  normalizeUnifiedUpdateState,
  primaryUpdateAction,
  primaryUpdateActionBusy,
  unifiedUpdateFromParts,
  updateCanDownload
} from "../src/shared/desktop/update-state";
import type {
  RendererAppBundleUpdateState,
  RendererUpdateState
} from "../src/shared/desktop/workbench-types";

/**
 * The desktop updates on two tracks and only one action is ever correct.
 * Installing an app bundle before the shell version it requires is rejected,
 * so this decision is not cosmetic and both renderers must reach the same
 * answer from the same code.
 */
const shell = (patch: Partial<RendererUpdateState> = {}): RendererUpdateState => ({ ...DEFAULT_UPDATE_STATE, ...patch });
const bundle = (patch: Partial<RendererAppBundleUpdateState> = {}): RendererAppBundleUpdateState => ({ ...DEFAULT_APP_BUNDLE_UPDATE_STATE, ...patch });

describe("unified update recommendation", () => {
  test("nothing available reads as none", () => {
    expect(unifiedUpdateFromParts(shell(), bundle()).recommendation).toBe("none");
  });

  test("a shell update alone recommends the shell", () => {
    const state = unifiedUpdateFromParts(shell({ available: true, status: "available", updateVersion: "0.5.0" }), bundle());
    expect(state.recommendation).toBe("shell");
    expect(state.message).toContain("0.5.0");
  });

  test("an app bundle update alone recommends the app bundle", () => {
    const state = unifiedUpdateFromParts(shell(), bundle({ updateAvailable: true, bundleVersion: "0.4.1" }));
    expect(state.recommendation).toBe("app_bundle");
    expect(state.message).toContain("0.4.1");
  });

  test("both available puts the shell first", () => {
    const state = unifiedUpdateFromParts(
      shell({ available: true, status: "available", updateVersion: "0.5.0" }),
      bundle({ updateAvailable: true, bundleVersion: "0.4.1" })
    );
    expect(state.recommendation).toBe("both_shell_first");
  });

  test("a blocked bundle says the shell must come first, whatever else is true", () => {
    // The server already refused this install; the recommendation has to say
    // why rather than offering the bundle again.
    expect(unifiedUpdateFromParts(shell(), bundle({ status: "blocked", error: "needs a newer shell" })).recommendation)
      .toBe("shell_required_for_app_bundle");
    expect(unifiedUpdateFromParts(shell(), bundle({ errorCode: "shell_update_required" })).recommendation)
      .toBe("shell_required_for_app_bundle");
  });

  test("errors surface, with the app bundle's taking precedence", () => {
    expect(unifiedUpdateFromParts(shell(), bundle({ status: "error", error: "bundle boom" })).error).toBe("bundle boom");
    expect(unifiedUpdateFromParts(shell({ status: "error", error: "shell boom" }), bundle()).error).toBe("shell boom");
  });
});

describe("the single primary action", () => {
  test("installing a downloaded shell outranks everything else", () => {
    expect(primaryUpdateAction({
      updateState: shell({ status: "downloaded", downloaded: true }),
      appBundleUpdateState: bundle({ updateAvailable: true })
    })).toBe("install_shell");
  });

  test("an available shell must be downloaded before a bundle is offered", () => {
    expect(primaryUpdateAction({
      updateState: shell({ status: "available", available: true }),
      appBundleUpdateState: bundle({ updateAvailable: true })
    })).toBe("download_shell");
  });

  test("with the shell settled, the bundle is next", () => {
    expect(primaryUpdateAction({ updateState: shell(), appBundleUpdateState: bundle({ updateAvailable: true }) }))
      .toBe("install_app_bundle");
  });

  test("otherwise the only thing to do is check", () => {
    expect(primaryUpdateAction({ updateState: shell(), appBundleUpdateState: bundle() })).toBe("check");
  });

  test("an already-downloaded update is not offered for download again", () => {
    expect(updateCanDownload(shell({ status: "available", downloaded: true }))).toBe(false);
    expect(updateCanDownload(shell({ status: "available", downloaded: false }))).toBe(true);
  });

  test("any in-flight transfer disables the button", () => {
    const busy = (patch: Parameters<typeof primaryUpdateActionBusy>[0]) => primaryUpdateActionBusy(patch);
    const base = {
      unifiedUpdateBusy: false,
      updateBusy: false,
      appBundleUpdateBusy: false,
      unifiedUpdateState: unifiedUpdateFromParts(shell(), bundle()),
      updateState: shell(),
      appBundleUpdateState: bundle()
    };
    expect(busy(base)).toBe(false);
    expect(busy({ ...base, updateState: shell({ status: "downloading" }) })).toBe(true);
    expect(busy({ ...base, updateState: shell({ status: "checking" }) })).toBe(true);
    expect(busy({ ...base, appBundleUpdateState: bundle({ status: "downloading" }) })).toBe(true);
    expect(busy({ ...base, unifiedUpdateBusy: true })).toBe(true);
  });
});

describe("normalization", () => {
  test("an unset configured flag falls back to availability", () => {
    const state = normalizeAppBundleUpdateState({ ...bundle(), available: true, configured: undefined as never });
    expect(state.configured).toBe(true);
  });

  test("updateAvailable is derived from status when absent", () => {
    const state = normalizeAppBundleUpdateState({ ...bundle(), status: "available", updateAvailable: undefined as never });
    expect(state.updateAvailable).toBe(true);
  });

  test("normalizing a unified state normalizes the bundle inside it", () => {
    const state = normalizeUnifiedUpdateState({
      ...unifiedUpdateFromParts(shell(), bundle()),
      appBundle: { ...bundle(), status: "available", updateAvailable: undefined as never }
    });
    expect(state.appBundle.updateAvailable).toBe(true);
  });
});
