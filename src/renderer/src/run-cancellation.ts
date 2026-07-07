export class RunCancelledError extends Error {
  constructor(message = "Run cancelled by user.") {
    super(message);
    this.name = "RunCancelledError";
  }
}

export function throwIfRunCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new RunCancelledError();
}

export function isRunCancelledError(error: unknown) {
  return error instanceof RunCancelledError ||
    (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError");
}
