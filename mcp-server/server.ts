/**
 * MCP plane — the viewer resource + tools. This template ships ONE worked UI tool (`smoke_test`)
 * that proves the agent → PCF direction of the bridge, plus `src/tools/example-tool.stub.ts` showing
 * the pattern for real demo tools. Add tools here (see the mcp-apps-tool-dev skill), then re-run the
 * 3-file DashboardAgent sync (declarative-agent-sync skill) so Copilot can call them.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { startCallLog } from "./src/logger.js";
import { buildSmokeTest } from "./src/tools/smoke-test.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// The viewer resource URI. The smoke_test tool's mcp-tools.json entry MUST carry this same value in
// `_meta.ui.resourceUri` or the pane card never renders (declarative-agent-sync skill).
const VIEWER_URI = "ui://bridge/viewer.html";
const VIEWER_BUILT = resolve(HERE, "dist", "mcp-app.html");
const FALLBACK_VIEWER = `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:16px;color:#a32d2d">
Viewer bundle not built. Run <code>npm run build</code> in mcp-server/, then reconnect.</body>`;

function shortId(id: string) {
  return id.slice(0, 8);
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "bridge-template-mcp", version: "0.1.0" });

  // --- smoke_test (UI tool): the agent → PCF direction of the bridge --------------------------
  registerAppTool(
    server,
    "smoke_test",
    {
      title: "Bridge smoke test",
      description:
        "Runs the bridge smoke test: renders a confirmation card in the Copilot pane and nudges a " +
        "message back to the host PCF component (the agent → app direction of the bi-directional " +
        "bridge). Call this when the user asks to 'run the bridge smoke test'.",
      // Read-only + closed-world: mutates only the local demo state, calls no external service.
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: {},
      _meta: { ui: { resourceUri: VIEWER_URI } },
    },
    async () => {
      const runId = randomUUID();
      const clog = startCallLog("smoke_test", runId);
      try {
        const r = buildSmokeTest();
        clog.close({ ok: true });
        return {
          content: [{ type: "text" as const, text: r.text }],
          // `smoke` is what the viewer fans out to the PCF as a nudge ON RENDER — a server tool
          // cannot postMessage (see the bidirectional-pcf-agent skill).
          structuredContent: { html: r.html, smoke: r.smoke },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        clog.close({ ok: false, error: msg });
        return { isError: true, content: [{ type: "text" as const, text: `${msg} (log: ${shortId(runId)})` }] };
      }
    },
  );

  // --- viewer resource -------------------------------------------------------
  registerAppResource(
    server,
    "Bridge viewer",
    VIEWER_URI,
    { description: "Renders a tool's structuredContent.html in a sandboxed iframe and fans nudges to the host." },
    async () => {
      let text = FALLBACK_VIEWER;
      try {
        text = readFileSync(VIEWER_BUILT, "utf-8");
      } catch {
        /* not built — serve the fallback (run `npm run build`) */
      }
      return { contents: [{ uri: VIEWER_URI, mimeType: RESOURCE_MIME_TYPE, text }] };
    },
  );

  return server;
}
