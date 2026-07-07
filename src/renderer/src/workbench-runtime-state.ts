import { createResource } from "solid-js";
import { fetchRuntimeInfo } from "./platform";
import {
  fetchCloudModelRegistrySchema,
  fetchHealth
} from "./workbench-api";

export function createWorkbenchRuntimeState() {
  const [runtime, { refetch: refetchRuntime }] = createResource(fetchRuntimeInfo);
  const [modelRegistrySchema] = createResource(fetchCloudModelRegistrySchema);
  const [health] = createResource(runtime, fetchHealth);

  return {
    runtime,
    refetchRuntime,
    modelRegistrySchema,
    health,
    backendAuthToken: () => runtime()?.backendAuthToken,
    backendAvailable: () => Boolean(runtime()?.backendBaseUrl)
  };
}
