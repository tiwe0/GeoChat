import type { RuntimeInfo } from "@geochat-ai/app/desktop-contracts";

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

export type DesktopLogLevel = "error" | "warn" | "info" | "debug" | "trace";

export type DesktopLoggingState = {
  enabled: boolean;
  level: DesktopLogLevel;
  logDirectory: string;
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

export type DesktopProblemBankCacheErrorCode =
  | "network_unavailable"
  | "manifest_invalid"
  | "schema_unsupported"
  | "integrity_error"
  | "permission_denied"
  | "unknown"
  | null;

export type DesktopProblemBankCacheState = {
  status: "disabled" | "idle" | "checking" | "available" | "syncing" | "ready" | "error";
  configured: boolean;
  manifestUrl: string | null;
  activeReleaseId: string | null;
  availableReleaseId: string | null;
  activeChannel: "production" | "evaluation" | "internal" | string | null;
  availableChannel: "production" | "evaluation" | "internal" | string | null;
  updateAvailable: boolean;
  checkedAt: string | null;
  activatedAt: string | null;
  cachedBytes: number;
  cacheDirectory: string;
  error: string | null;
  errorCode: DesktopProblemBankCacheErrorCode;
};

export type DesktopProblemBankSummary = {
  bankId: string;
  bankSlug: string;
  title: string;
  description: string | null;
  kind: string;
  problemCount: number;
  datasetId: string | null;
  reusePolicy: "allowed" | "restricted" | "unknown";
};

export type DesktopProblemBankCatalog = {
  releaseId: string;
  channel: "production" | "evaluation" | "internal" | string;
  cloudBaseUrl: string;
  banks: DesktopProblemBankSummary[];
};

export type DesktopProblemBankDownloadState = {
  bankSlug: string;
  releaseId: string;
  status: "idle" | "downloading" | "paused" | "complete" | "error";
  phase: "preparing" | "pages" | "records" | "complete";
  completedItems: number;
  totalItems: number;
  downloadedBytes: number;
  totalBytes: number;
  updatedAt: string;
  error: string | null;
};

export type DesktopProblemBankPage = {
  releaseId: string;
  bankSlug: string;
  cursor: string;
  nextCursor: string | null;
  items: Array<{
    id: string;
    promptPreview?: string;
    answerPreview?: string;
    difficulty?: string;
    subject?: string;
    grade?: string;
    knowledge?: string[];
    tags?: string[];
    hasMedia?: boolean;
    [key: string]: unknown;
  }>;
};

export type DesktopProblemDetail = {
  releaseId: string;
  bankSlug: string;
  problem: {
    id: string;
    prompt: string;
    answer?: {
      final?: string;
      type?: string;
      choices?: Array<{ label?: string; text?: string; correct?: boolean }>;
      solution?: string;
      analysis?: string;
    };
    taxonomy?: {
      language?: string;
      subject?: string;
      grade?: string;
      difficulty?: string;
      knowledge?: string[];
      skills?: string[];
      tags?: string[];
    };
    media?: Array<{
      url?: string;
      r2Url?: string;
      trackingUrl?: string;
      alt?: string;
    }> | null;
    source?: { datasetId?: string; datasetSlug?: string };
    [key: string]: unknown;
  };
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
  getLoggingPreferences: () => Promise<DesktopLoggingState>;
  setLoggingPreferences: (preferences: Partial<Pick<DesktopLoggingState, "enabled" | "level">>) => Promise<DesktopLoggingState>;
  openLogDirectory: () => Promise<string>;
  writeAppLog: (level: DesktopLogLevel, message: string) => Promise<void>;
  getProblemBankCacheState: () => Promise<DesktopProblemBankCacheState>;
  getProblemBankCatalog: () => Promise<DesktopProblemBankCatalog | null>;
  checkProblemBankUpdate: () => Promise<DesktopProblemBankCacheState>;
  syncProblemBankMetadata: () => Promise<DesktopProblemBankCacheState>;
  openProblemBankCacheDirectory: () => Promise<string>;
  clearProblemBankCache: () => Promise<DesktopProblemBankCacheState>;
  getProblemBankDownloadStates: () => Promise<DesktopProblemBankDownloadState[]>;
  downloadProblemBank: (bankSlug: string) => Promise<DesktopProblemBankDownloadState>;
  loadProblemBankPage: (bankSlug: string, cursor?: string | null) => Promise<DesktopProblemBankPage>;
  loadProblemDetail: (bankSlug: string, problemId: string) => Promise<DesktopProblemDetail>;
  getAppBundleUpdateState: () => Promise<DesktopAppBundleUpdateState>;
  checkAppBundleUpdate: () => Promise<DesktopAppBundleUpdateState>;
  installAppBundleUpdate: () => Promise<DesktopAppBundleUpdateState>;
  rollbackAppBundleUpdate: () => Promise<DesktopAppBundleUpdateState>;
  markRendererReady: () => Promise<void>;
  installUpdate: () => Promise<DesktopUpdateState>;
  onUpdateState: (callback: (state: DesktopUpdateState) => void) => () => void;
  onAppBundleUpdateState: (callback: (state: DesktopAppBundleUpdateState) => void) => () => void;
  onProblemBankCacheState: (callback: (state: DesktopProblemBankCacheState) => void) => () => void;
  onProblemBankDownloadState: (callback: (state: DesktopProblemBankDownloadState) => void) => () => void;
};
