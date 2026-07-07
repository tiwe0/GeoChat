import type { FunctionCallToolName } from "./functioncalls";
import { geometryVerificationReportFromToolResult } from "./geometry-verifier";
import type { AgentRunLedgerRecord, AgentRunToolRecord } from "./run-ledger";
import { deriveAgentWorkflowStateFromTools, evaluateAgentWorkflowToolRecord } from "./workflow-policy";

export type AgentRunReviewRole = "planner" | "verifier" | "critic";
export type AgentRunReviewSeverity = "info" | "warn" | "error";
export type AgentRunReviewVerdict = "pass" | "warn" | "fail";

export type AgentRunReviewFinding = {
  role: AgentRunReviewRole;
  severity: AgentRunReviewSeverity;
  code:
    | "workflow_order_violation"
    | "terminal_verification_missing"
    | "geometry_verification_failed"
    | "geometry_verification_incomplete"
    | "tool_failed"
    | "run_not_successful"
    | "empty_successful_run";
  message: string;
  toolCallId?: string;
  toolName?: FunctionCallToolName;
};

export type AgentRunReviewRoleReport = {
  role: AgentRunReviewRole;
  verdict: AgentRunReviewVerdict;
  findings: AgentRunReviewFinding[];
};

export type AgentRunReviewMetrics = {
  totalTools: number;
  successfulTools: number;
  failedTools: number;
  canvasWriteTools: number;
  canvasVerificationTools: number;
  geometryVerificationReports: number;
};

export type AgentRunReviewReport = {
  runId: string;
  verdict: AgentRunReviewVerdict;
  roles: AgentRunReviewRoleReport[];
  findings: AgentRunReviewFinding[];
  metrics: AgentRunReviewMetrics;
};

const reviewRoles = ["planner", "verifier", "critic"] as const;
const canvasWriteTools = new Set<FunctionCallToolName>(["executeGeoGebraCommands"]);
const canvasVerificationTools = new Set<FunctionCallToolName>(["getCanvasContext", "getPNGBase64"]);

export function reviewAgentRunLedger(run: AgentRunLedgerRecord): AgentRunReviewReport {
  const findings: AgentRunReviewFinding[] = [];
  const metrics: AgentRunReviewMetrics = {
    totalTools: run.tools.length,
    successfulTools: run.tools.filter((tool) => tool.status === "succeeded").length,
    failedTools: run.tools.filter((tool) => tool.status === "failed").length,
    canvasWriteTools: run.tools.filter((tool) => canvasWriteTools.has(tool.toolName) && tool.status === "succeeded").length,
    canvasVerificationTools: run.tools.filter((tool) => canvasVerificationTools.has(tool.toolName) && tool.status === "succeeded").length,
    geometryVerificationReports: 0
  };

  for (const [index, tool] of run.tools.entries()) {
    const workflowDecision = evaluateAgentWorkflowToolRecord(run.tools.slice(0, index), tool);
    if (!workflowDecision.allowed) {
      findings.push({
        role: "planner",
        severity: "error",
        code: "workflow_order_violation",
        message: workflowDecision.reason ?? `${tool.toolName} is not allowed in the current workflow phase.`,
        toolCallId: tool.toolCallId,
        toolName: tool.toolName
      });
    }
    if (tool.status === "failed") {
      findings.push({
        role: "critic",
        severity: run.status === "failed" ? "error" : "warn",
        code: "tool_failed",
        message: tool.error ?? `${tool.toolName} failed during the run.`,
        toolCallId: tool.toolCallId,
        toolName: tool.toolName
      });
    }
    reviewGeometryVerificationTool(tool, findings, metrics);
  }

  const workflowState = deriveAgentWorkflowStateFromTools(run.tools);
  if (run.status === "succeeded" && workflowState.hasCanvasWrite && !workflowState.hasVerificationAfterWrite) {
    findings.push({
      role: "verifier",
      severity: "error",
      code: "terminal_verification_missing",
      message: "Run succeeded after a GeoGebra canvas write without a successful canvas verification step."
    });
  }
  if (run.status !== "succeeded") {
    findings.push({
      role: "critic",
      severity: "error",
      code: "run_not_successful",
      message: run.error ?? `Run ended with status ${run.status}.`
    });
  }
  if (run.status === "succeeded" && run.tools.length === 0) {
    findings.push({
      role: "critic",
      severity: "warn",
      code: "empty_successful_run",
      message: "Run succeeded without any tool evidence."
    });
  }

  return {
    runId: run.runId,
    verdict: verdictForFindings(findings),
    roles: reviewRoles.map((role) => {
      const roleFindings = findings.filter((finding) => finding.role === role);
      return {
        role,
        verdict: verdictForFindings(roleFindings),
        findings: roleFindings
      };
    }),
    findings,
    metrics
  };
}

function reviewGeometryVerificationTool(
  tool: AgentRunToolRecord,
  findings: AgentRunReviewFinding[],
  metrics: AgentRunReviewMetrics
) {
  if (!canvasVerificationTools.has(tool.toolName) || tool.status !== "succeeded") return;
  const report = geometryVerificationReportFromToolResult(tool.result);
  if (!report) return;
  metrics.geometryVerificationReports += 1;
  const failedResults = report.results.filter((result) => result.status === "failed");
  if (failedResults.length > 0) {
    findings.push({
      role: "verifier",
      severity: "error",
      code: "geometry_verification_failed",
      message: failedResults.map((result) => result.message).join(" "),
      toolCallId: tool.toolCallId,
      toolName: tool.toolName
    });
    return;
  }
  const unknownResults = report.results.filter((result) => result.status === "unknown");
  if (unknownResults.length > 0) {
    findings.push({
      role: "verifier",
      severity: "warn",
      code: "geometry_verification_incomplete",
      message: unknownResults.map((result) => result.message).join(" "),
      toolCallId: tool.toolCallId,
      toolName: tool.toolName
    });
  }
}

function verdictForFindings(findings: readonly Pick<AgentRunReviewFinding, "severity">[]): AgentRunReviewVerdict {
  if (findings.some((finding) => finding.severity === "error")) return "fail";
  if (findings.some((finding) => finding.severity === "warn")) return "warn";
  return "pass";
}
