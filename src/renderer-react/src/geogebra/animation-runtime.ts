export type GeoGebraAnimationMode = "once" | "loop" | "ping_pong" | "continuous";
export type GeoGebraAnimationEasing = "linear" | "ease_in_out";
export type GeoGebraAnimationStatus = "configured" | "running" | "paused" | "stopped" | "completed" | "error";

export type GeoGebraAnimationConfig = {
  object: string;
  from: number;
  to: number;
  durationMs: number;
  mode: GeoGebraAnimationMode;
  easing: GeoGebraAnimationEasing;
};

export type GeoGebraAnimationSnapshot = GeoGebraAnimationConfig & {
  status: GeoGebraAnimationStatus;
  currentValue: number;
  elapsedMs: number;
  error?: string;
};

export type AnimationScheduler = {
  now(): number;
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(handle: number): void;
};

type AnimationState = GeoGebraAnimationConfig & {
  status: GeoGebraAnimationStatus;
  currentValue: number;
  elapsedMs: number;
  startedAt: number | null;
  frameHandle: number | null;
  error?: string;
};

const defaultScheduler: AnimationScheduler = {
  now: () => typeof performance === "undefined" ? Date.now() : performance.now(),
  requestFrame: (callback) => typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : globalThis.setTimeout(() => callback(defaultScheduler.now()), 16) as unknown as number,
  cancelFrame: (handle) => typeof cancelAnimationFrame === "function"
    ? cancelAnimationFrame(handle)
    : globalThis.clearTimeout(handle)
};

export class GeoGebraAnimationRuntime {
  private readonly states = new Map<string, AnimationState>();

  constructor(
    private readonly writeValue: (object: string, value: number) => void,
    private readonly scheduler: AnimationScheduler = defaultScheduler
  ) {}

  configure(config: GeoGebraAnimationConfig, autoplay = false) {
    if (!config.object.trim()) throw new Error("动画对象名不能为空。");
    if (!Number.isFinite(config.from) || !Number.isFinite(config.to) || config.from === config.to) {
      throw new Error("动画 from/to 必须是不同的有限数字。");
    }
    if (!Number.isFinite(config.durationMs) || config.durationMs < 2_000 || config.durationMs > 120_000) {
      throw new Error("动画时长必须在 2000 到 120000 毫秒之间。");
    }
    this.cancel(config.object);
    const state: AnimationState = {
      ...config,
      object: config.object.trim(),
      // An unbounded clock must remain monotonic. Repeating an easing curve
      // would slow down at every artificial span boundary, so continuous
      // timelines always advance linearly.
      easing: config.mode === "continuous" ? "linear" : config.easing,
      status: "configured",
      currentValue: config.from,
      elapsedMs: 0,
      startedAt: null,
      frameHandle: null
    };
    this.states.set(state.object, state);
    try {
      this.writeValue(state.object, state.from);
    } catch (error) {
      this.states.delete(state.object);
      throw error;
    }
    if (autoplay) this.play(state);
    return this.snapshot(state.object)!;
  }

  control(action: "play" | "pause" | "stop" | "reset", objects: readonly string[]) {
    return objects.map((object) => {
      const state = this.requireState(object);
      if (action === "play") this.play(state);
      if (action === "pause") this.pause(state);
      if (action === "stop") this.stop(state);
      if (action === "reset") this.reset(state);
      return this.snapshot(state.object)!;
    });
  }

  snapshot(object: string): GeoGebraAnimationSnapshot | undefined {
    const state = this.states.get(object);
    if (!state) return undefined;
    return {
      object: state.object,
      from: state.from,
      to: state.to,
      durationMs: state.durationMs,
      mode: state.mode,
      easing: state.easing,
      status: state.status,
      currentValue: state.currentValue,
      elapsedMs: state.elapsedMs,
      ...(state.error ? { error: state.error } : {})
    };
  }

  dispose() {
    for (const state of this.states.values()) this.cancelStateFrame(state);
    this.states.clear();
  }

  private requireState(object: string) {
    const state = this.states.get(object.trim());
    if (!state) throw new Error(`对象 ${object} 尚未配置业务动画。`);
    return state;
  }

  private play(state: AnimationState) {
    if (state.status === "running") return;
    if (state.status === "completed") {
      state.elapsedMs = 0;
      state.currentValue = state.from;
      this.writeValue(state.object, state.from);
    }
    state.error = undefined;
    state.status = "running";
    state.startedAt = this.scheduler.now() - state.elapsedMs;
    this.schedule(state);
  }

  private pause(state: AnimationState) {
    if (state.status !== "running") return;
    this.captureElapsed(state);
    this.cancelStateFrame(state);
    state.status = "paused";
  }

  private stop(state: AnimationState) {
    if (state.status === "running") this.captureElapsed(state);
    this.cancelStateFrame(state);
    state.status = "stopped";
  }

  private reset(state: AnimationState) {
    this.cancelStateFrame(state);
    state.elapsedMs = 0;
    state.startedAt = null;
    state.currentValue = state.from;
    state.status = "configured";
    state.error = undefined;
    this.writeValue(state.object, state.from);
  }

  private schedule(state: AnimationState) {
    state.frameHandle = this.scheduler.requestFrame((time) => this.tick(state, time));
  }

  private tick(state: AnimationState, time: number) {
    if (state.status !== "running" || state.startedAt === null) return;
    state.frameHandle = null;
    state.elapsedMs = Math.max(0, time - state.startedAt);
    const progress = progressAt(state.mode, state.elapsedMs, state.durationMs);
    const eased = state.easing === "ease_in_out" ? 0.5 - Math.cos(Math.PI * progress.value) / 2 : progress.value;
    state.currentValue = state.from + (state.to - state.from) * eased;
    try {
      this.writeValue(state.object, state.currentValue);
    } catch (error) {
      state.status = "error";
      state.error = error instanceof Error ? error.message : String(error);
      return;
    }
    if (progress.completed) {
      state.status = "completed";
      state.elapsedMs = state.durationMs;
      state.startedAt = null;
      return;
    }
    this.schedule(state);
  }

  private captureElapsed(state: AnimationState) {
    if (state.startedAt !== null) state.elapsedMs = Math.max(0, this.scheduler.now() - state.startedAt);
    state.startedAt = null;
  }

  private cancel(object: string) {
    const state = this.states.get(object);
    if (state) this.cancelStateFrame(state);
  }

  private cancelStateFrame(state: AnimationState) {
    if (state.frameHandle !== null) this.scheduler.cancelFrame(state.frameHandle);
    state.frameHandle = null;
  }
}

function progressAt(mode: GeoGebraAnimationMode, elapsedMs: number, durationMs: number) {
  if (mode === "once") return { value: Math.min(1, elapsedMs / durationMs), completed: elapsedMs >= durationMs };
  if (mode === "continuous") return { value: elapsedMs / durationMs, completed: false };
  if (mode === "loop") return { value: (elapsedMs % durationMs) / durationMs, completed: false };
  const cycle = durationMs * 2;
  const position = elapsedMs % cycle;
  return { value: position <= durationMs ? position / durationMs : 2 - position / durationMs, completed: false };
}
