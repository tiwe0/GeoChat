export type DesktopDebugActionStatus = "queued" | "claimed" | "succeeded" | "failed";

export type DesktopDebugAction =
  | {
      id: string;
      type: "get_ui_status";
      createdAt: string;
      status: DesktopDebugActionStatus;
      claimedAt?: string;
      completedAt?: string;
      result?: unknown;
      error?: string;
    }
  | {
      id: string;
      type: "export_png";
      exportScale?: number;
      transparent?: boolean;
      dpi?: number;
      createdAt: string;
      status: DesktopDebugActionStatus;
      claimedAt?: string;
      completedAt?: string;
      result?: unknown;
      error?: string;
    }
  | {
      id: string;
      type: "send_message";
      conversationId?: string;
      content: string;
      createdAt: string;
      status: DesktopDebugActionStatus;
      claimedAt?: string;
      completedAt?: string;
      result?: unknown;
      error?: string;
    }
  | {
      id: string;
      type: "select_problem";
      conversationId?: string;
      source?: "local" | "cloud";
      cloudBaseUrl?: string;
      bankSlug?: string;
      problemApiPath?: string | null;
      problemId: string;
      mode: "show" | "draft" | "send";
      createdAt: string;
      status: DesktopDebugActionStatus;
      claimedAt?: string;
      completedAt?: string;
      result?: unknown;
      error?: string;
    };

export type DesktopDebugActionInput =
  | { type: "get_ui_status" }
  | { type: "export_png"; exportScale?: number; transparent?: boolean; dpi?: number }
  | { type: "send_message"; conversationId?: string; content: string }
  | {
      type: "select_problem";
      conversationId?: string;
      source?: "local" | "cloud";
      cloudBaseUrl?: string;
      bankSlug?: string;
      problemApiPath?: string | null;
      problemId: string;
      mode: "show" | "draft" | "send";
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

  function fail(id: string, error: string) {
    const action = actions.find((item) => item.id === id);
    if (!action) return undefined;
    action.status = "failed";
    action.completedAt = new Date().toISOString();
    action.error = error;
    return action;
  }

  function list(limit = 30) {
    return actions.slice(0, Math.max(1, Math.min(200, limit)));
  }

  return { enqueue, claimNext, complete, fail, list };
}
