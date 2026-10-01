import { rmSync } from "node:fs";

export function assertRestoreEvidence(result: Record<string, unknown> | undefined, expectedConversationId: string) {
  if (result?.conversationId !== expectedConversationId) throw new Error("Restored conversation id did not match.");
  if (typeof result.messageCount !== "number" || result.messageCount < 2) throw new Error("Restored message count was incomplete.");
  const recovery = result.recovery as Record<string, unknown> | undefined;
  if (recovery?.messages !== "restored" || recovery.canvas !== "replayed") {
    throw new Error(`Conversation recovery evidence was incomplete: ${JSON.stringify(result)}`);
  }
}

export function redactDesktopE2eEvidenceText(value: string, secrets: readonly string[]) {
  return secrets.reduce(
    (redacted, secret) => secret ? redacted.replaceAll(secret, "[REDACTED]") : redacted,
    value,
  );
}

export function createTestProviderCleanupState() {
  let handle: { nonce: string; credentialRef: string; restoreConfigJson: string } | null = null;
  let result: Record<string, unknown> = { attempted: false, completed: false };
  return {
    register(next: { nonce: string; credentialRef: string; restoreConfigJson: string }) { handle = next; },
    current() { return handle; },
    markResult(next: Record<string, unknown>) { result = next; if (next.completed === true) handle = null; },
    evidence() { return result; },
    needsCleanup() { return handle !== null; },
  };
}

export function recordTestProviderRecoveryFailure(
  cleanupState: ReturnType<typeof createTestProviderCleanupState>,
  failure: unknown,
) {
  if (!failure || typeof failure !== "object") return false;
  const candidate = failure as { operationId?: unknown; recovery?: unknown };
  const recovery = candidate.recovery;
  if (!recovery
    || typeof recovery !== "object"
    || (recovery as { kind?: unknown }).kind !== "native-credential-journal"
    || (recovery as { preserveUserDataDir?: unknown }).preserveUserDataDir !== true) {
    return false;
  }
  const operationId = candidate.operationId === null || typeof candidate.operationId === "string"
    ? candidate.operationId
    : null;
  cleanupState.markResult({
    ...cleanupState.evidence(),
    attempted: true,
    completed: false,
    recoveryPending: true,
    operationId,
    recovery: {
      kind: "native-credential-journal",
      preserveUserDataDir: true,
    },
  });
  return true;
}

export function finalizeTestProviderProfile(
  userDataDir: string,
  providerConfigurationAttempted: boolean,
  cleanupState: ReturnType<typeof createTestProviderCleanupState>,
) {
  const cleanup = cleanupState.evidence();
  const preserve = providerConfigurationAttempted && cleanup.completed !== true;
  if (preserve) {
    cleanupState.markResult({
      ...cleanup,
      attempted: true,
      completed: false,
      recoveryPending: true,
      recoveryPath: userDataDir,
    });
  } else {
    rmSync(userDataDir, { recursive: true, force: true });
  }
  return { preserved: preserve, recoveryPath: preserve ? userDataDir : null };
}
