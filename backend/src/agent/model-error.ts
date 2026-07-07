export function sanitizeRunnerModelError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutToolCallIds = raw.replace(/:[A-Za-z0-9_-]*call[_-][A-Za-z0-9_-]+/g, "");
  const userFacing =
    /多个工具调用|multiple tool calls/i.test(withoutToolCallIds)
      ? withoutToolCallIds.replace(
          /(?:：|:)\s*[\s\S]*$/u,
          withoutToolCallIds.includes("多个工具调用")
            ? "：模型一次请求了多个工具，GeoChat 已改为自动拆分执行。请重试当前问题。"
            : ": the model requested multiple tools at once. GeoChat now splits this into one tool step at a time. Please retry the request."
        )
      : withoutToolCallIds;
  return userFacing
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key["'\s:=]+)[A-Za-z0-9._-]{8,}/gi, "$1[redacted]")
    .replace(/\b(?:sk|sk-ant|sk-proj|sk-or|AIza)[A-Za-z0-9._-]{12,}\b/g, "[redacted-key]")
    .slice(0, 600);
}
