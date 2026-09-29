import { timingSafeEqual } from "node:crypto";

const DEFAULT_BROWSER_DEV_ORIGIN = "http://127.0.0.1:1421";

export const CORS_ALLOWED_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;
export const CORS_ALLOWED_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "x-client-channel",
  "x-guest-session-id"
] as const;

export type BackendAuthentication =
  | { mode: "required"; token: string }
  | { mode: "disabled" };

export type BackendHttpSecurity = {
  authentication: BackendAuthentication;
  allowedOrigins: ReadonlySet<string>;
};

export function readBackendHttpSecurity(
  environment: Record<string, string | undefined> = Bun.env
): BackendHttpSecurity {
  const mode = environment.GEOCHAT_DESKTOP_BACKEND_AUTH_MODE?.trim() || "required";
  if (mode !== "required" && mode !== "disabled") {
    throw new Error(
      "GEOCHAT_DESKTOP_BACKEND_AUTH_MODE must be either 'required' or 'disabled'."
    );
  }

  const token = environment.GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN?.trim();
  if (mode === "required" && !token) {
    throw new Error(
      "GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN is required unless GEOCHAT_DESKTOP_BACKEND_AUTH_MODE=disabled is explicitly configured."
    );
  }

  const configuredOrigins = parseCommaSeparated(environment.GEOCHAT_DESKTOP_ALLOWED_ORIGINS);
  return {
    authentication: mode === "required" ? { mode, token: token! } : { mode },
    allowedOrigins: new Set(
      configuredOrigins.length > 0
        ? configuredOrigins
        : mode === "disabled"
          ? [DEFAULT_BROWSER_DEV_ORIGIN]
          : []
    )
  };
}

export function requestIsAuthorized(request: Request, authentication: BackendAuthentication) {
  if (authentication.mode === "disabled") return true;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const suppliedToken = authorization.slice("Bearer ".length).trim();
  if (!suppliedToken) return false;

  const expected = Buffer.from(authentication.token);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function isAllowedOrigin(origin: string | null, security: BackendHttpSecurity) {
  return origin !== null && security.allowedOrigins.has(origin);
}

function parseCommaSeparated(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
