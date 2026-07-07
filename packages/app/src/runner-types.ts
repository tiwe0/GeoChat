import type { AgentModelConfig, AgentModelPolicySnapshot } from "./model-registry";
import type { AgentRunRemoteToolRequest, AgentRunRemoteToolRequestInput } from "./remote-tool";
import type { AgentRunLedgerRecord, AgentRunModelStepRecord, AgentRunPolicyDecisionRecord, AgentRunStartInput, AgentRunUsage } from "./run-ledger";
import type { AgentRunImageAttachment } from "./attachments";

export type AgentRunRunnerStatus = "waiting_for_tool" | "running" | "succeeded" | "failed" | "cancelled";
export type AgentRunRunnerPhase = "needs_canvas_read" | "planning" | "writing" | "verifying" | "repairing" | "explaining" | "done";

export type AgentRunRunnerBudget = {
  maxToolSteps: number;
  completedToolSteps: number;
  activeToolRequests: number;
  remainingToolRequests: number;
  exhausted: boolean;
};

export type AgentRunRunnerStartInput = {
  run: AgentRunStartInput;
  model?: AgentModelConfig;
  firstTool?: AgentRunRemoteToolRequestInput;
  attachments?: AgentRunImageAttachment[];
};

export type AgentRunRunnerSnapshot = {
  run: AgentRunLedgerRecord;
  status: AgentRunRunnerStatus;
  phase: AgentRunRunnerPhase;
  modelPolicy: AgentModelPolicySnapshot;
  budget: AgentRunRunnerBudget;
  pendingToolRequests: AgentRunRemoteToolRequest[];
  policyDecisions?: AgentRunPolicyDecisionRecord[];
  modelSteps?: AgentRunModelStepRecord[];
};

export type AgentRunRunnerModelAction =
  | {
      type: "tool";
      tool: AgentRunRemoteToolRequestInput;
    }
  | {
      type: "finish";
      text: string;
      usage?: AgentRunUsage;
    };

export type AgentRunRunnerStartDecision =
  | {
      type: "enqueue_tool";
      run: AgentRunLedgerRecord;
      firstRequest: AgentRunRemoteToolRequestInput;
    }
  | {
      type: "workflow_blocked";
      run: AgentRunLedgerRecord;
      message: string;
    }
  | {
      type: "budget_exhausted";
      run: AgentRunLedgerRecord;
      budget: AgentRunRunnerBudget;
    };

export type AgentRunRunnerContinuationDecision =
  | {
      type: "enqueue_tool";
      run: AgentRunLedgerRecord;
      nextRequest: AgentRunRemoteToolRequestInput;
    }
  | {
      type: "finish";
      run: AgentRunLedgerRecord;
      text: string;
    }
  | {
      type: "workflow_blocked";
      run: AgentRunLedgerRecord;
      message: string;
    }
  | {
      type: "budget_exhausted";
      run: AgentRunLedgerRecord;
      text: string;
      budget: AgentRunRunnerBudget;
    };
