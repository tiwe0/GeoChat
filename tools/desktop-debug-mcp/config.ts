import { resolve } from "node:path";

export type DesktopDebugMcpConfig = {
  databasePath: string;
  backendBaseUrl: string;
  backendAuthToken?: string;
  mcpAuthToken?: string;
  defaultLimit: number;
  maxLimit: number;
  defaultContentLimit: number;
  includeSensitiveByDefault: boolean;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): DesktopDebugMcpConfig {
  return {
    databasePath: resolve(env.GEOCHAT_DESKTOP_MCP_DB_PATH ?? env.GEOCHAT_DESKTOP_DB_PATH ?? "./data/geochat-desktop.sqlite"),
    backendBaseUrl: readBackendBaseUrl(env),
    backendAuthToken: env.GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN,
    mcpAuthToken: env.GEOCHAT_DESKTOP_MCP_AUTH_TOKEN,
    defaultLimit: readPositiveInt(env.GEOCHAT_DESKTOP_MCP_DEFAULT_LIMIT, 30),
    maxLimit: readPositiveInt(env.GEOCHAT_DESKTOP_MCP_MAX_LIMIT, 200),
    defaultContentLimit: readPositiveInt(env.GEOCHAT_DESKTOP_MCP_CONTENT_LIMIT, 4_000),
    includeSensitiveByDefault: env.GEOCHAT_DESKTOP_MCP_ALLOW_SENSITIVE === "1"
  };
}

export function clampLimit(value: number | undefined, config: DesktopDebugMcpConfig, fallback = config.defaultLimit) {
  const requested = Number.isInteger(value) && value && value > 0 ? value : fallback;
  return Math.max(1, Math.min(config.maxLimit, requested));
}

function readPositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readBackendBaseUrl(env: NodeJS.ProcessEnv) {
  const explicit = env.GEOCHAT_DESKTOP_MCP_BACKEND_BASE_URL ?? env.GEOCHAT_DESKTOP_BACKEND_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const port = readPositiveInt(env.GEOCHAT_DESKTOP_BACKEND_PORT, 17365);
  return `http://127.0.0.1:${port}`;
}
