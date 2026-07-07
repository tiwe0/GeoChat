import {
  upsertAgentRunTool,
  type AgentRunLedgerRecord,
  type AgentRunRemoteToolRequestInput,
  type AgentRunToolRecord
} from "@geochat-ai/app";
import {
  executeBackendToolRequest,
  type BackendToolExecutionContext
} from "../agent/backend-tools";
import {
  backendToolFailureRecord,
  failAgentRunForBackendToolError
} from "./agent-run-continuation-failures";

type BackendToolAutoStepResult =
  | {
      type: "succeeded";
      run: AgentRunLedgerRecord;
      tool: AgentRunToolRecord;
    }
  | {
      type: "failed";
      run: AgentRunLedgerRecord;
      tool: AgentRunToolRecord;
    };

export async function executeBackendToolAutoStep(input: {
  run: AgentRunLedgerRecord;
  request: AgentRunRemoteToolRequestInput;
  executionContext: BackendToolExecutionContext;
}): Promise<BackendToolAutoStepResult> {
  try {
    const tool = await executeBackendToolRequest(input.request, input.executionContext);
    return {
      type: "succeeded",
      run: upsertAgentRunTool(input.run, tool),
      tool
    };
  } catch (error) {
    const tool = backendToolFailureRecord(input.request, error);
    const runWithTool = upsertAgentRunTool(input.run, tool);
    return {
      type: "failed",
      run: failAgentRunForBackendToolError(runWithTool, tool),
      tool
    };
  }
}
