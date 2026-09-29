import { Effect, Schema } from "effect";
import { createBackendHttpContext } from "./http/context";
import { createBackendHttpHandler } from "./http";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";

const logger = createStructuredLogger("backend.lifecycle");

const Environment = Schema.Struct({
  GEOCHAT_DESKTOP_BACKEND_PORT: Schema.optionalWith(Schema.NumberFromString, {
    default: () => 17365
  }),
  GEOCHAT_DESKTOP_BACKEND_HOST: Schema.optionalWith(Schema.String, {
    default: () => "127.0.0.1"
  }),
  GEOCHAT_DESKTOP_BACKEND_AUTH_MODE: Schema.optional(Schema.String),
  GEOCHAT_DESKTOP_BACKEND_AUTH_TOKEN: Schema.optional(Schema.String)
});

const env = Schema.decodeUnknownSync(Environment)(Bun.env);
const context = createBackendHttpContext({ reconcileInterruptedRuntimeState: true });
const handler = createBackendHttpHandler(context);

const server = Effect.sync(() =>
  Bun.serve({
    hostname: env.GEOCHAT_DESKTOP_BACKEND_HOST,
    port: env.GEOCHAT_DESKTOP_BACKEND_PORT,
    idleTimeout: 180,
    fetch: handler.handleRequest
  })
);

let instance: ReturnType<typeof Bun.serve>;
try {
  instance = Effect.runSync(server);
} catch (error) {
  context.close();
  throw error;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  instance.stop();
  context.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

logger.info("server_listening", "BACKEND_SERVER_LISTENING", { hostname: instance.hostname, port: instance.port });
