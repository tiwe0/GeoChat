import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readConfig } from "./config";
import { createDesktopDebugActionQueue, type DesktopDebugActionQueue } from "./debug-actions";
import { registerDesktopDebugTools } from "./tools";

export function createGeoChatDesktopDebugServer(options: { actions?: DesktopDebugActionQueue } = {}) {
  const config = readConfig();
  const actions = options.actions ?? createDesktopDebugActionQueue();
  const server = new McpServer({
    name: "geochat-desktop-debug-mcp",
    version: "0.1.0"
  });

  registerDesktopDebugTools(server, { config, actions });

  return { server, config, actions };
}

if (import.meta.main) {
  const { server } = createGeoChatDesktopDebugServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
}
