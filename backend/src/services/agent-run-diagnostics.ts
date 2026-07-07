import type {
  AgentRunPersistenceDiagnostics,
  AgentRunRepository
} from "../db/agent-run-repository";

export function createAgentRunDiagnosticsService(agentRunRepository: AgentRunRepository) {
  return {
    persistenceDiagnostics(conversationId: string, expectedRunIds: string[] = []): Promise<AgentRunPersistenceDiagnostics> {
      return agentRunRepository.diagnostics(conversationId, expectedRunIds);
    }
  };
}
