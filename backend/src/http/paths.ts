export function conversationDetailPath(pathname: string) {
  const match = pathname.match(/^\/v1\/conversations\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function conversationMessagesPath(pathname: string) {
  const match = pathname.match(/^\/v1\/conversations\/([^/]+)\/messages$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function conversationBlackboardPath(pathname: string) {
  const match = pathname.match(/^\/v1\/conversations\/([^/]+)\/blackboard$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function problemSetProblemsPath(pathname: string) {
  const match = pathname.match(/^\/v1\/problem-sets\/([^/]+)\/problems$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function problemDetailPath(pathname: string) {
  const match = pathname.match(/^\/v1\/problems\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function problemAttemptPath(pathname: string) {
  const match = pathname.match(/^\/v1\/problems\/([^/]+)\/attempts$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function agentRunCancelPath(pathname: string) {
  const match = pathname.match(/^\/v1\/agent-runs\/([^/]+)\/cancel$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function isGeoGebraAssetPath(pathname: string) {
  return pathname.startsWith("/tools/geogebra-assets-v2/") || pathname.startsWith("/tools/geogebra-assets/");
}
