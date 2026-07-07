export const BLACKBOARD_CATEGORIES = [
  "original_problem",
  "givens",
  "goal",
  "math_analysis",
  "construction_plan",
  "canvas_state",
  "assumptions",
  "open_issues",
  "failed_attempts",
  "teaching_notes"
] as const;

export type BlackboardCategory = (typeof BLACKBOARD_CATEGORIES)[number];
export type BlackboardEntryStatus = "active" | "archived";

export type BlackboardEntry = {
  id: string;
  conversationId: string;
  key: string;
  category: BlackboardCategory;
  value: string;
  status: BlackboardEntryStatus;
  confidence: number;
  reason: string;
  sourceMessageId?: string | null;
  sourceToolCallId?: string | null;
  sourceRunId?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

export type ReadBlackboardArgs = {
  categories?: BlackboardCategory[] | null;
  includeArchived?: boolean | null;
  limit?: number | null;
  reason?: string | null;
  intendedOutcome?: string | null;
  nextExpectedAction?: string | null;
};

export type BlackboardPatchOperation = {
  op: "upsert" | "archive";
  key: string;
  category?: BlackboardCategory | null;
  value?: string | null;
  confidence?: number | null;
  reason?: string | null;
  sourceMessageId?: string | null;
  sourceToolCallId?: string | null;
  sourceRunId?: string | null;
};

export type PatchBlackboardArgs = {
  ops: BlackboardPatchOperation[];
  reason?: string | null;
  intendedOutcome?: string | null;
  nextExpectedAction?: string | null;
};

export type BlackboardPatchResult = {
  entries: BlackboardEntry[];
  changed: number;
  archived: number;
};

export type DesktopConversationBlackboardResponse = {
  conversationId: string;
  entries: BlackboardEntry[];
};

export function isBlackboardCategory(value: unknown): value is BlackboardCategory {
  return typeof value === "string" && (BLACKBOARD_CATEGORIES as readonly string[]).includes(value);
}

export function isBlackboardEntryStatus(value: unknown): value is BlackboardEntryStatus {
  return value === "active" || value === "archived";
}
