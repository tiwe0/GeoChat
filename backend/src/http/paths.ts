export function safeDecodePathComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function isValidPathEncoding(pathname: string) {
  return safeDecodePathComponent(pathname) !== undefined;
}

export function conversationDetailPath(pathname: string) {
  const match = pathname.match(/^\/v1\/conversations\/([^/]+)$/);
  return match ? safeDecodePathComponent(match[1]) : undefined;
}

export function conversationMessagesPath(pathname: string) {
  const match = pathname.match(/^\/v1\/conversations\/([^/]+)\/messages$/);
  return match ? safeDecodePathComponent(match[1]) : undefined;
}

export function conversationBlackboardPath(pathname: string) {
  const match = pathname.match(/^\/v1\/conversations\/([^/]+)\/blackboard$/);
  return match ? safeDecodePathComponent(match[1]) : undefined;
}

export function problemSetProblemsPath(pathname: string) {
  const match = pathname.match(/^\/v1\/problem-sets\/([^/]+)\/problems$/);
  return match ? safeDecodePathComponent(match[1]) : undefined;
}

export function problemDetailPath(pathname: string) {
  const match = pathname.match(/^\/v1\/problems\/([^/]+)$/);
  return match ? safeDecodePathComponent(match[1]) : undefined;
}

export function problemAttemptPath(pathname: string) {
  const match = pathname.match(/^\/v1\/problems\/([^/]+)\/attempts$/);
  return match ? safeDecodePathComponent(match[1]) : undefined;
}

export function agentRunCancelPath(pathname: string) {
  const match = pathname.match(/^\/v1\/agent-runs\/([^/]+)\/cancel$/);
  return match ? safeDecodePathComponent(match[1]) : undefined;
}

export function benchmarkRunPath(pathname: string) {
  const match = pathname.match(/^\/v1\/benchmark-runs\/([^/]+)$/);
  return match ? safeDecodePathComponent(match[1]) : undefined;
}

export function benchmarkRunResultsPath(pathname: string) {
  const match = pathname.match(/^\/v1\/benchmark-runs\/([^/]+)\/results$/);
  return match ? safeDecodePathComponent(match[1]) : undefined;
}

export function benchmarkRunActionPath(pathname: string) {
  const match = pathname.match(/^\/v1\/benchmark-runs\/([^/]+)\/(complete|cancel|fail|interrupt)$/);
  if (!match) return undefined;
  const runId = safeDecodePathComponent(match[1]);
  return runId === undefined
    ? undefined
    : { runId, action: match[2] as "complete" | "cancel" | "fail" | "interrupt" };
}

export function isGeoGebraAssetPath(pathname: string) {
  return pathname.startsWith("/tools/geogebra-assets-v2/") || pathname.startsWith("/tools/geogebra-assets/");
}
