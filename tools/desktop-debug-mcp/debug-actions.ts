export type DesktopDebugActionStatus = "queued" | "claimed" | "succeeded" | "failed";

export type DesktopDebugActionRecovery = {
  kind: "native-credential-journal";
  preserveUserDataDir: true;
};

type DesktopDebugActionState = {
  id: string;
  createdAt: string;
  status: DesktopDebugActionStatus;
  claimedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
  operationId?: string | null;
  recovery?: DesktopDebugActionRecovery;
};

export type DesktopDebugAction = DesktopDebugActionState & (
  | {
      type: "get_ui_status";
    }
  | {
      type: "export_png";
      exportScale?: number;
      transparent?: boolean;
      dpi?: number;
    }
  | {
      type: "execute_geogebra_tool";
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      type: "send_message";
      conversationId?: string;
      content: string;
    }
  | {
      type: "restore_conversation";
      conversationId: string;
    }
  | {
      type: "configure_test_provider";
      baseUrl: string;
      model: string;
      nonce: string;
    }
  | {
      type: "clear_test_provider";
      nonce: string;
      credentialRef: string;
      restoreConfigJson: string;
    }
  | {
      type: "probe_real_ui";
      nonce: string;
      operation: DesktopRealUiProbeOperation;
      text?: string;
      target?: DesktopRealUiProbeTarget;
    }
);

export type DesktopRealUiProbeOperation =
  | "snapshot"
  | "set_composer_text"
  | "submit_composer"
  | "switch_mode"
  | "open_fusion_panel"
  | "close_fusion_panel"
  | "cycle_dialog_focus";

export type DesktopRealUiProbeTarget = "window" | "fusion" | "history" | "settings" | "transcript";

export type DesktopDebugActionInput =
  | { type: "get_ui_status" }
  | { type: "export_png"; exportScale?: number; transparent?: boolean; dpi?: number }
  | {
      type: "execute_geogebra_tool";
      toolName: string;
      args: Record<string, unknown>;
    }
  | { type: "send_message"; conversationId?: string; content: string }
  | { type: "restore_conversation"; conversationId: string }
  | { type: "configure_test_provider"; baseUrl: string; model: string; nonce: string }
  | { type: "clear_test_provider"; nonce: string; credentialRef: string; restoreConfigJson: string }
  | {
      type: "probe_real_ui";
      nonce: string;
      operation: DesktopRealUiProbeOperation;
      text?: string;
      target?: DesktopRealUiProbeTarget;
    };

export type DesktopDebugActionQueue = ReturnType<typeof createDesktopDebugActionQueue>;

export function createDesktopDebugActionQueue() {
  const actions: DesktopDebugAction[] = [];

  function enqueue(input: DesktopDebugActionInput) {
    const now = new Date().toISOString();
    const action = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      status: "queued" as const
    } satisfies DesktopDebugAction;
    actions.unshift(action);
    actions.splice(200);
    return action;
  }

  function claimNext() {
    const action = actions
      .slice()
      .reverse()
      .find((item) => item.status === "queued");
    if (!action) return undefined;
    action.status = "claimed";
    action.claimedAt = new Date().toISOString();
    return action;
  }

  function complete(id: string, result: unknown) {
    const action = actions.find((item) => item.id === id);
    if (!action) return undefined;
    action.status = "succeeded";
    action.completedAt = new Date().toISOString();
    action.result = result;
    return action;
  }

  function fail(
    id: string,
    error: string,
    details: { operationId?: string | null; recovery?: DesktopDebugActionRecovery } = {},
  ) {
    const action = actions.find((item) => item.id === id);
    if (!action) return undefined;
    action.status = "failed";
    action.completedAt = new Date().toISOString();
    action.error = error;
    if (details.operationId !== undefined) action.operationId = details.operationId;
    if (details.recovery) action.recovery = details.recovery;
    return action;
  }

  function list(limit = 30) {
    return actions.slice(0, Math.max(1, Math.min(200, limit)));
  }

  return { enqueue, claimNext, complete, fail, list };
}

export function desktopDebugActionFailureDetails(payload: {
  operationId?: unknown;
  recovery?: unknown;
}) {
  const operationId = payload.operationId === null
    || (typeof payload.operationId === "string" && payload.operationId.length > 0 && payload.operationId.length <= 128)
    ? payload.operationId as string | null
    : undefined;
  const recovery = payload.recovery;
  const validRecovery = recovery
    && typeof recovery === "object"
    && (recovery as { kind?: unknown }).kind === "native-credential-journal"
    && (recovery as { preserveUserDataDir?: unknown }).preserveUserDataDir === true
    ? { kind: "native-credential-journal" as const, preserveUserDataDir: true as const }
    : undefined;
  return { operationId, recovery: validRecovery };
}
