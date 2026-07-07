import type { RuntimeInfo } from "@geochat-ai/app";

export type DesktopMcpStatus = {
  available: boolean;
  enabled: boolean;
  running: boolean;
  endpoint: string | null;
  healthUrl: string | null;
  port: number;
  pid: number | null;
  error: string | null;
};

export type DesktopAccessState = {
  status: "active" | "error";
  features: {
    local: boolean;
    problemBank: boolean;
    improvementUpload: boolean;
  };
  checkedAt: string | null;
  error: string | null;
  errorCode: "unknown" | null;
};

export type DesktopUpdatePreferences = {
  autoCheck: boolean;
  autoDownload: boolean;
  installOnQuit: boolean;
};

export type DesktopImprovementPlanPreferences = {
  enabled: boolean;
};

export type DesktopImprovementPlanUploadResult = {
  ok: boolean;
  accepted: number;
};

export type DesktopUpdateErrorCode =
  | "network_unavailable"
  | "metadata_missing"
  | "signature_error"
  | "permission_denied"
  | "server_error"
  | "shell_update_required"
  | "unknown"
  | null;

export type DesktopUpdateState = {
  status: "idle" | "checking" | "available" | "not_available" | "downloading" | "downloaded" | "error" | "disabled";
  available: boolean;
  currentVersion: string;
  updateVersion: string | null;
  releaseName: string | null;
  releaseDate: string | null;
  downloaded: boolean;
  downloadPercent: number | null;
  error: string | null;
  errorCode: DesktopUpdateErrorCode;
  checkedAt: string | null;
  preferences: DesktopUpdatePreferences;
};

export type DesktopAppBundleUpdateState = {
  status: "idle" | "checking" | "available" | "not_available" | "blocked" | "downloading" | "installed" | "error" | "disabled";
  available: boolean;
  configured: boolean;
  updateAvailable: boolean;
  manifestUrl: string | null;
  currentBundleVersion: string | null;
  bundleVersion: string | null;
  rollbackAvailable: boolean;
  checkedAt: string | null;
  installedAt: string | null;
  requiresRestart: boolean;
  error: string | null;
  errorCode: DesktopUpdateState["errorCode"];
};

export type DesktopUpdateRecommendation =
  | "none"
  | "app_bundle"
  | "shell"
  | "shell_required_for_app_bundle"
  | "both_shell_first"
  | "error";

export type DesktopUnifiedUpdateState = {
  status: "idle" | "checking" | "available" | "not_available" | "error" | "disabled";
  recommendation: DesktopUpdateRecommendation;
  shell: DesktopUpdateState;
  appBundle: DesktopAppBundleUpdateState;
  message: string | null;
  error: string | null;
  errorCode: DesktopUpdateState["errorCode"];
};

export type GeoChatDesktopApi = {
  getRuntimeInfo: () => Promise<RuntimeInfo>;
  getMcpStatus: () => Promise<DesktopMcpStatus>;
  setMcpEnabled: (enabled: boolean) => Promise<DesktopMcpStatus>;
  getAccessState: () => Promise<DesktopAccessState>;
  checkAccess: () => Promise<DesktopAccessState>;
  getUpdateState: () => Promise<DesktopUpdateState>;
  checkForUpdates: () => Promise<DesktopUpdateState>;
  checkAllUpdates: () => Promise<DesktopUnifiedUpdateState>;
  downloadUpdate: () => Promise<DesktopUpdateState>;
  setUpdatePreferences: (preferences: Partial<DesktopUpdatePreferences>) => Promise<DesktopUpdateState>;
  getImprovementPlanPreferences: () => Promise<DesktopImprovementPlanPreferences>;
  setImprovementPlanPreferences: (preferences: Partial<DesktopImprovementPlanPreferences>) => Promise<DesktopImprovementPlanPreferences>;
  uploadImprovementPlanSamples: (samples: unknown[]) => Promise<DesktopImprovementPlanUploadResult>;
  getAppBundleUpdateState: () => Promise<DesktopAppBundleUpdateState>;
  checkAppBundleUpdate: () => Promise<DesktopAppBundleUpdateState>;
  installAppBundleUpdate: () => Promise<DesktopAppBundleUpdateState>;
  rollbackAppBundleUpdate: () => Promise<DesktopAppBundleUpdateState>;
  markRendererReady: () => Promise<void>;
  installUpdate: () => Promise<DesktopUpdateState>;
  onUpdateState: (callback: (state: DesktopUpdateState) => void) => () => void;
  onAppBundleUpdateState: (callback: (state: DesktopAppBundleUpdateState) => void) => () => void;
};
