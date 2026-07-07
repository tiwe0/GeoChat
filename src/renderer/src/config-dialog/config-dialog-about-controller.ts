import { createMemo, createSignal, type Accessor } from "solid-js";
import type { RendererI18n } from "../i18n";
import type {
  RendererAppBundleUpdateState,
  RendererImprovementPlanState,
  RendererUnifiedUpdateState,
  RendererUpdateState
} from "../workbench-types";
import {
  primaryUpdateAction,
  primaryUpdateActionBusy,
  primaryUpdateActionLabel,
  unifiedUpdateStatusBody
} from "./config-dialog-state";

export function createConfigAboutController(input: {
  copy: Accessor<RendererI18n>;
  updateState: Accessor<RendererUpdateState>;
  unifiedUpdateState: Accessor<RendererUnifiedUpdateState>;
  appBundleUpdateState: Accessor<RendererAppBundleUpdateState>;
  improvementPlanState: Accessor<RendererImprovementPlanState>;
  onUnifiedUpdateCheck: () => Promise<RendererUnifiedUpdateState>;
  onUpdateDownload: () => Promise<RendererUpdateState>;
  onUpdateInstall: () => Promise<RendererUpdateState>;
  onAppBundleUpdateInstall: () => Promise<RendererAppBundleUpdateState>;
  onImprovementPlanChange: (preferences: Partial<RendererImprovementPlanState>) => Promise<RendererImprovementPlanState>;
}) {
  const [unifiedUpdateBusy, setUnifiedUpdateBusy] = createSignal(false);
  const [updateBusy, setUpdateBusy] = createSignal(false);
  const [appBundleUpdateBusy, setAppBundleUpdateBusy] = createSignal(false);
  const [improvementPlanBusy, setImprovementPlanBusy] = createSignal(false);
  const [wechatCopied, setWechatCopied] = createSignal(false);

  const currentPrimaryUpdateAction = createMemo(() => primaryUpdateAction({
    updateState: input.updateState(),
    appBundleUpdateState: input.appBundleUpdateState()
  }));
  const isPrimaryUpdateActionBusy = createMemo(() => primaryUpdateActionBusy({
    unifiedUpdateBusy: unifiedUpdateBusy(),
    updateBusy: updateBusy(),
    appBundleUpdateBusy: appBundleUpdateBusy(),
    unifiedUpdateState: input.unifiedUpdateState(),
    updateState: input.updateState(),
    appBundleUpdateState: input.appBundleUpdateState()
  }));
  const currentPrimaryUpdateActionLabel = createMemo(() => primaryUpdateActionLabel({
    busy: isPrimaryUpdateActionBusy(),
    updateState: input.updateState(),
    appBundleUpdateState: input.appBundleUpdateState(),
    copy: input.copy()
  }));
  const updateStatusBody = createMemo(() => unifiedUpdateStatusBody(input.unifiedUpdateState(), input.copy()));

  async function checkUnifiedUpdate() {
    if (unifiedUpdateBusy()) return;
    setUnifiedUpdateBusy(true);
    try {
      await input.onUnifiedUpdateCheck();
    } finally {
      setUnifiedUpdateBusy(false);
    }
  }

  async function downloadUpdate() {
    if (updateBusy() || input.updateState().status !== "available") return;
    setUpdateBusy(true);
    try {
      await input.onUpdateDownload();
    } finally {
      setUpdateBusy(false);
    }
  }

  async function installUpdate() {
    if (updateBusy() || input.updateState().status !== "downloaded") return;
    setUpdateBusy(true);
    try {
      await input.onUpdateInstall();
    } finally {
      setUpdateBusy(false);
    }
  }

  async function installAppBundleUpdate() {
    if (appBundleUpdateBusy() || !input.appBundleUpdateState().updateAvailable) return;
    setAppBundleUpdateBusy(true);
    try {
      await input.onAppBundleUpdateInstall();
    } finally {
      setAppBundleUpdateBusy(false);
    }
  }

  async function changeImprovementPlanEnabled(enabled: boolean) {
    if (improvementPlanBusy() || !input.improvementPlanState().available) return;
    setImprovementPlanBusy(true);
    try {
      await input.onImprovementPlanChange({ enabled });
    } finally {
      setImprovementPlanBusy(false);
    }
  }

  async function runPrimaryUpdateAction() {
    if (isPrimaryUpdateActionBusy()) return;
    const action = currentPrimaryUpdateAction();
    if (action === "install_shell") {
      await installUpdate();
      return;
    }
    if (action === "download_shell") {
      await downloadUpdate();
      return;
    }
    if (action === "install_app_bundle") {
      await installAppBundleUpdate();
      return;
    }
    await checkUnifiedUpdate();
  }

  async function copyWechat() {
    await globalThis.navigator?.clipboard?.writeText("I0v0ry").catch(() => undefined);
    setWechatCopied(true);
    globalThis.setTimeout(() => setWechatCopied(false), 1400);
  }

  return {
    wechatCopied,
    improvementPlanBusy,
    isPrimaryUpdateActionBusy,
    currentPrimaryUpdateActionLabel,
    updateStatusBody,
    copyWechat,
    runPrimaryUpdateAction,
    changeImprovementPlanEnabled
  };
}
