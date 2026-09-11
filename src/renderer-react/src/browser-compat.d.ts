declare const browser: {
  storage: {
    local: {
      get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
  };
  runtime: {
    sendMessage<T = unknown>(message: unknown): Promise<T>;
  };
};
