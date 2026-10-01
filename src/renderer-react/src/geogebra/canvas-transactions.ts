import { createStructuredLogger } from "@geochat-ai/app/structured-logger";

const logger = createStructuredLogger("geogebra.canvas-transactions");

export type CanvasTransactionOptions = {
  label: string;
  readOnly?: boolean;
  shouldContinue?: () => boolean;
  supersedeKey?: string;
  captureSnapshot?: () => string | undefined | PromiseLike<string | undefined>;
  restoreSnapshot?: (snapshot: string) => boolean | void | PromiseLike<boolean | void>;
};

export type CanvasTransactionContext = {
  readonly label: string;
  assertCurrent: () => void;
  wait: <T>(operation: () => T | PromiseLike<T>) => Promise<T>;
};

export type CanvasRecoveryState = {
  frozen: true;
  label: string;
  error: string;
};

type CanvasTransactionAdapter = {
  epoch: () => number;
  capture: () => string | undefined;
  restore: (snapshot: string) => boolean | void | PromiseLike<boolean | void>;
};

type RecoveryRecord = CanvasRecoveryState & {
  snapshot: string;
  epoch: number;
  restore: (snapshot: string) => boolean | void | PromiseLike<boolean | void>;
  ready?: () => boolean;
};

type Lease = {
  id: symbol;
  epoch: number;
  options: CanvasTransactionOptions;
  supersedeVersion?: number;
};

export class CanvasRecoveryRequiredError extends Error {
  constructor(message = "Canvas recovery is required before another mutation can run.", options?: ErrorOptions) {
    super(message, options);
    this.name = "CanvasRecoveryRequiredError";
  }
}

/**
 * A canvas write timed out after it crossed the applet boundary, so the caller
 * cannot know whether GeoGebra will still apply it. The coordinator must keep
 * the canvas frozen until the underlying callback proves that write is done.
 */
export class CanvasMutationStateUnknownError extends Error {
  constructor(
    message: string,
    readonly isSettled: () => boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CanvasMutationStateUnknownError";
  }
}

/**
 * The single serialization and recovery boundary for canvas mutations.
 *
 * A transaction owns one applet epoch; writes also own one complete snapshot.
 * Work can only cross an async boundary through `wait`, which checks cancellation,
 * supersession, lease ownership, and the applet epoch on both sides. A failed
 * owner restores its snapshot before releasing the queue. If that restore is
 * not trustworthy, the queue enters one explicit recovery state and rejects
 * every later mutation until `retryRecovery` succeeds.
 */
export class CanvasTransactionCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private activeLease: Lease | null = null;
  private recovery: RecoveryRecord | null = null;
  private readonly supersedeVersions = new Map<string, number>();
  private readonly recoveryListeners = new Set<() => void>();

  constructor(private readonly adapter: CanvasTransactionAdapter) {}

  get recoveryState(): CanvasRecoveryState | null {
    if (!this.recovery) return null;
    return {
      frozen: true,
      label: this.recovery.label,
      error: this.recovery.error,
    };
  }

  subscribeRecovery(listener: () => void) {
    this.recoveryListeners.add(listener);
    return () => {
      this.recoveryListeners.delete(listener);
    };
  }

  clearRecoveryForAppletReplacement() {
    if (!this.recovery) return;
    this.recovery = null;
    this.notifyRecoveryChanged();
  }

  run<T>(options: CanvasTransactionOptions, work: (transaction: CanvasTransactionContext) => T | PromiseLike<T>): Promise<T> {
    const supersedeVersion = options.supersedeKey
      ? this.advanceSupersedeVersion(options.supersedeKey)
      : undefined;
    return this.enqueue(async () => {
      if (this.recovery) throw this.recoveryError();
      const lease: Lease = {
        id: Symbol(options.label),
        epoch: this.adapter.epoch(),
        options,
        supersedeVersion,
      };
      this.activeLease = lease;
      let snapshot: string | undefined;
      try {
        this.assertLease(lease);
        if (!lease.options.readOnly) {
          snapshot = lease.options.captureSnapshot
            ? await Promise.resolve(lease.options.captureSnapshot())
            : this.adapter.capture();
          if (!snapshot) throw new Error("GeoGebra did not provide a complete XML snapshot.");
        }
        this.assertLease(lease);
        const transaction = this.contextFor(lease);
        const result = await work(transaction);
        this.assertLease(lease);
        return result;
      } catch (error) {
        if (snapshot !== undefined && this.activeLease?.id === lease.id) {
          if (error instanceof CanvasMutationStateUnknownError) {
            this.freeze(lease, snapshot, error, error.isSettled);
            throw this.recoveryError(error);
          }
          try {
            await this.rollback(lease, snapshot);
          } catch (rollbackError) {
            this.freeze(
              lease,
              snapshot,
              rollbackError,
              rollbackError instanceof CanvasMutationStateUnknownError
                ? rollbackError.isSettled
                : undefined,
            );
            throw this.recoveryError(error);
          }
        }
        throw error;
      } finally {
        if (this.activeLease?.id === lease.id) this.activeLease = null;
      }
    });
  }

  retryRecovery(): Promise<void> {
    return this.enqueue(async () => {
      const recovery = this.recovery;
      if (!recovery) return;
      if (recovery.ready?.() === false) {
        throw this.recoveryError();
      }
      if (this.adapter.epoch() !== recovery.epoch) {
        // A remounted applet cannot accept an XML snapshot owned by the old
        // instance. Explicit retry still verifies that the replacement can
        // produce a complete snapshot before releasing the freeze.
        if (!this.adapter.capture()) {
          throw new CanvasRecoveryRequiredError("The replacement canvas is not ready for recovery.");
        }
        this.recovery = null;
        this.notifyRecoveryChanged();
        return;
      }
      let restored: boolean | void;
      try {
        restored = await Promise.resolve(recovery.restore(recovery.snapshot));
      } catch (error) {
        if (error instanceof CanvasMutationStateUnknownError) {
          recovery.error = errorMessage(error);
          recovery.ready = error.isSettled;
          this.notifyRecoveryChanged();
        }
        throw this.recoveryError(error);
      }
      if (restored === false) throw new CanvasRecoveryRequiredError("Canvas recovery retry was rejected by GeoGebra.");
      this.recovery = null;
      this.notifyRecoveryChanged();
    });
  }

  private contextFor(lease: Lease): CanvasTransactionContext {
    return {
      label: lease.options.label,
      assertCurrent: () => this.assertLease(lease),
      wait: async <T>(operation: () => T | PromiseLike<T>) => {
        this.assertLease(lease);
        const value = await operation();
        this.assertLease(lease);
        return value;
      },
    };
  }

  private async rollback(lease: Lease, snapshot: string) {
    if (this.activeLease?.id !== lease.id) throw new Error("Canvas transaction lost its rollback lease.");
    if (this.adapter.epoch() !== lease.epoch) throw new Error("Canvas applet changed before rollback.");
    const restored = await Promise.resolve(
      (lease.options.restoreSnapshot ?? this.adapter.restore)(snapshot),
    );
    if (restored === false) throw new Error("GeoGebra rejected the rollback snapshot.");
    if (this.activeLease?.id !== lease.id) throw new Error("Canvas transaction lost its lease during rollback.");
    if (this.adapter.epoch() !== lease.epoch) throw new Error("Canvas applet changed during rollback.");
  }

  private assertLease(lease: Lease) {
    if (this.activeLease?.id !== lease.id) throw abortError("Canvas transaction lost its lease.");
    if (this.adapter.epoch() !== lease.epoch) throw abortError("Canvas applet changed during the transaction.");
    if (lease.options.shouldContinue?.() === false) throw abortError("Canvas transaction was cancelled.");
    const key = lease.options.supersedeKey;
    if (key && this.supersedeVersions.get(key) !== lease.supersedeVersion) {
      throw abortError("Canvas transaction was superseded.");
    }
  }

  private advanceSupersedeVersion(key: string) {
    const next = (this.supersedeVersions.get(key) ?? 0) + 1;
    this.supersedeVersions.set(key, next);
    return next;
  }

  private freeze(lease: Lease, snapshot: string, error: unknown, ready?: () => boolean) {
    if (this.recovery) return;
    this.recovery = {
      frozen: true,
      label: lease.options.label,
      error: errorMessage(error),
      snapshot,
      epoch: lease.epoch,
      restore: lease.options.restoreSnapshot ?? this.adapter.restore,
      ready,
    };
    this.notifyRecoveryChanged();
  }

  private notifyRecoveryChanged() {
    for (const listener of this.recoveryListeners) {
      try {
        listener();
      } catch (error) {
        logger.warn("recovery_subscriber_failed", "CANVAS_RECOVERY_SUBSCRIBER_FAILED", { error });
      }
    }
  }

  private recoveryError(cause?: unknown) {
    const detail = this.recovery?.error;
    return new CanvasRecoveryRequiredError(
      detail ? `Canvas recovery is required: ${detail}` : undefined,
      cause === undefined ? undefined : { cause },
    );
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

function abortError(message: string) {
  return new DOMException(message, "AbortError");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
