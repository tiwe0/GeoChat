/**
 * Identifies which client owns a runner's pending tool requests.
 *
 * The backend already accepts `claimOwner` on the runner endpoints
 * (see remote-tool.ts and run-coordinator.ts); this is the builder and parser
 * for the value. It matters when more than one surface can drive the same
 * run — the desktop workbench and the desktop debug MCP, for instance — so
 * that neither claims work intended for the other.
 *
 * Only the channels shipped by this repository are accepted: the desktop
 * workbench and its debug MCP.
 */
export const AGENT_RUNNER_CLAIM_OWNER_CHANNELS = ["desktop-workbench", "desktop-mcp"] as const;
export type AgentRunRunnerClaimOwnerChannel = (typeof AGENT_RUNNER_CLAIM_OWNER_CHANNELS)[number];

export type AgentRunRunnerClaimOwner = {
  channel: AgentRunRunnerClaimOwnerChannel;
  installationId: string;
  canvasSessionId: string;
};

const CLAIM_OWNER_SEGMENT = /^[a-zA-Z0-9._-]{1,128}$/;

export function createAgentRunRunnerClaimOwner(
  channel: AgentRunRunnerClaimOwnerChannel,
  installationId: string,
  canvasSessionId: string
) {
  if (!CLAIM_OWNER_SEGMENT.test(installationId) || !CLAIM_OWNER_SEGMENT.test(canvasSessionId)) {
    throw new RangeError(
      "Runner claim owner segments must contain 1-128 letters, numbers, dots, underscores, or hyphens."
    );
  }
  return `${channel}:${installationId}:${canvasSessionId}`;
}

export function parseAgentRunRunnerClaimOwner(value: unknown): AgentRunRunnerClaimOwner | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^([a-z-]+):([a-zA-Z0-9._-]{1,128}):([a-zA-Z0-9._-]{1,128})$/);
  if (!match) return undefined;
  const [, rawChannel, installationId, canvasSessionId] = match;
  if (!AGENT_RUNNER_CLAIM_OWNER_CHANNELS.includes(rawChannel as AgentRunRunnerClaimOwnerChannel)) {
    return undefined;
  }
  return {
    channel: rawChannel as AgentRunRunnerClaimOwnerChannel,
    installationId: installationId!,
    canvasSessionId: canvasSessionId!
  };
}
