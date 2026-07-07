import { backendHttpContext } from "./http/context";
import {
  createBackendHttpHandler,
  type BackendHttpHandler
} from "./http/handler";

const defaultBackendHttpHandler = createBackendHttpHandler(backendHttpContext);

export { createBackendHttpHandler };
export type { BackendHttpHandler };

export const handleRequest = defaultBackendHttpHandler.handleRequest;
export const getConversationPersistenceDiagnostics = defaultBackendHttpHandler.getConversationPersistenceDiagnostics;
