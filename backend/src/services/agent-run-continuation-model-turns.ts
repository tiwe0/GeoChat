import {
  agentModelStepTimeoutMsOrDefault,
  type AgentModelConfig,
  type AgentRunImageAttachment,
  type AgentRunLedgerRecord,
  type AgentRunModelStepRecord
} from "@geochat-ai/app";
import type { BackendModelNextAction, BackendModelNextActionInput } from "../agent/model-runner";
import { failAgentRunForModelError } from "./agent-run-continuation-failures";
import {
  completeRunnerModelStepFailure,
  completeRunnerModelStepSuccess,
  createRunnerModelStepStart
} from "./agent-run-continuation-model-steps";

type RunnerContinuationModelTurnResult =
  | {
      type: "succeeded";
      action: BackendModelNextAction;
      modelStep: AgentRunModelStepRecord;
    }
  | {
      type: "failed";
      run: AgentRunLedgerRecord;
      modelStep: AgentRunModelStepRecord;
    };

export async function runRunnerContinuationModelTurn(input: {
  run: AgentRunLedgerRecord;
  model: AgentModelConfig;
  attachments?: AgentRunImageAttachment[];
  onModelTextDelta?: (text: string) => void;
  modelNextAction: (input: BackendModelNextActionInput) => Promise<BackendModelNextAction>;
}): Promise<RunnerContinuationModelTurnResult> {
  const modelStep = createRunnerModelStepStart({
    run: input.run,
    model: input.model,
    attachmentCount: input.attachments?.length ?? 0
  });

  try {
    const action = await input.modelNextAction({
      modelConfig: input.model,
      run: input.run,
      attachments: input.attachments,
      timeoutMs: agentModelStepTimeoutMsOrDefault(input.run.modelStepTimeoutMs),
      onTextDelta: input.onModelTextDelta
    });
    return {
      type: "succeeded",
      action,
      modelStep: completeRunnerModelStepSuccess(modelStep, action)
    };
  } catch (error) {
    return {
      type: "failed",
      run: failAgentRunForModelError(input.run, error),
      modelStep: completeRunnerModelStepFailure(modelStep, error)
    };
  }
}
