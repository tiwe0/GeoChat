import { Effect, Schema } from "effect";
import { handleRequest } from "./http";

const Environment = Schema.Struct({
  GEOCHAT_DESKTOP_BACKEND_PORT: Schema.optionalWith(Schema.NumberFromString, {
    default: () => 17365
  }),
  GEOCHAT_DESKTOP_BACKEND_HOST: Schema.optionalWith(Schema.String, {
    default: () => "127.0.0.1"
  })
});

const env = Schema.decodeUnknownSync(Environment)(Bun.env);

const server = Effect.sync(() =>
  Bun.serve({
    hostname: env.GEOCHAT_DESKTOP_BACKEND_HOST,
    port: env.GEOCHAT_DESKTOP_BACKEND_PORT,
    idleTimeout: 180,
    fetch: handleRequest
  })
);

const instance = Effect.runSync(server);

console.info(`GeoChat backend listening on http://${instance.hostname}:${instance.port}`);
