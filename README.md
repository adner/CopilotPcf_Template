# Xrm.Copilot ↔ PCF bridge — starter template

A starter template for demos that showcase **bi-directional communication** between a model-driven
Power Apps **PCF component** and an **M365 Copilot declarative agent**, brokered by an **MCP (Apps)
server**. It illustrates the Power Apps `Xrm.Copilot` client APIs
([reference](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference/xrm-copilot),
[agent APIs](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/bring-intelligence-using-agent-apis))
and the postMessage/nudge bridge between them.

Out of the box, one button proves **both directions of the loop**.

## The loop (the "hello world")

```
   ┌────────────────────────┐   sendPromptToM365Copilot(gptId, autoSubmit)   ┌──────────────┐
   │  PCF: SmokeTestPanel    │ ─────────────────────────────────────────────▶│  M365 Copilot │
   │  (model-driven app)     │                                                │  + declarative│
   │                         │                                                │    agent      │
   │  ▲  "✓ round-trip       │        nudge postMessage (dual-registered)     └──────┬───────┘
   │  │   complete"          │◀───────────────────────────────────────────────       │ calls
   │  │                      │                                                        ▼
   │  └─ Fetch state ──HTTP──┼──▶ GET /state?k= ◀── shared state ──┐          ┌──────────────┐
   └────────────────────────┘                                     └──────────│  smoke_test   │
                                                                   viewer     │   MCP tool    │
                                                                   renders +   └──────────────┘
                                                                   fans nudge (agent → PCF hop)
```

1. **PCF → Copilot.** The panel's *Send smoke-test prompt* button calls
   `Xrm.Copilot.openM365CopilotPanel()` + `sendPromptToM365Copilot("Run the bridge smoke test",
   { autoSubmit:true, gptId })`.
2. **Copilot → PCF.** The agent routes that prompt to the `smoke_test` MCP tool. Its viewer renders a
   confirmation card in the pane **and fans a nudge back** to the host on render (a server tool can't
   `postMessage` — the fan-out is client-side).
3. The PCF receives via **dual registration** (`Xrm.Copilot.addActionHandler` **and** a raw `window`
   `message` listener) and shows the round-trip. *Fetch state* reads the shared ping counter over HTTP.

## Components

| Folder | What it is |
|---|---|
| `mcp-server/` | Node + TS MCP (Apps) server + plain web server. Reusable plumbing + the worked `smoke_test` tool + `src/tools/example-tool.stub.ts`. |
| `pcf-control/` | Full-page dataset PCF `Bridge.SmokeTestPanel` — the bridge send/receive + smoke-test panel. |
| `declarative-agent/` | Empty — scaffold the ATK agent here (see its README + `declarative-agent-sync` skill). |
| `.claude/skills/` | Seven bundled skills carrying the hard-won lessons (see below). |

## Quick start (host-free, ~2 min)

```bash
cd mcp-server
cp .env.example .env          # set STATE_KEY; PUBLIC_BASE_URL can stay localhost for the probe
npm install
npm run probe smoke           # runs smoke_test, prints the nudge payload, writes dist/probe-smoke.html
npm run build && npm run serve # MCP on http://localhost:3101/mcp  (health: /health)
```

Open `mcp-server/dist/probe-smoke.html` in a browser to eyeball the card.

## Full loop (deployed)

You need: an HTTPS **devtunnel** (localhost is blocked as mixed content in the HTTPS Power App),
`pac` CLI, and the M365 Agents Toolkit.

1. **Tunnel + serve.** `devtunnel host -p 3101 --allow-anonymous`; set `PUBLIC_BASE_URL` in
   `mcp-server/.env` to the `https://…devtunnels.ms` base; `npm run build && npm run serve`.
2. **PCF.** In `pcf-control/`: set the manifest `external-service-usage` domain to the tunnel base
   (bump the control version), `npm install && npm run build`, `pac pcf push --publisher-prefix <p>`,
   then bind it as a table's read-only grid control with `npm run bind -- …` (see the
   `pcf-develop-deploy` skill — the classic picker won't list a dataset PCF, so this is scripted).
   Set the control's `serverBaseUrl` = the tunnel base, `stateKey` = your `STATE_KEY`, `agentId` =
   the agent's gptId.
3. **Agent.** Scaffold the declarative agent with ATK in `declarative-agent/`, point its
   `RemoteMCPServer` runtime at `<tunnel>/mcp`, and run the three-file tool-enumeration sync so it can
   call `smoke_test` (see the `declarative-agent-sync` skill). Publish it.
4. **Run it.** Open the PCF page, click **Send smoke-test prompt ✨** → the Copilot pane shows the
   `smoke_test` card → the panel shows **"✓ round-trip complete"**; **Fetch state** shows the ping
   counter climb.

## Bundled skills (`.claude/skills/`)

Claude Code loads these on demand while you build a demo from this template:

- **xrm-copilot-integration** — the `Xrm.Copilot` API surface from both a PCF and an MCP Apps widget; the gptId gotcha.
- **pcf-develop-deploy** — pac dev/deploy, the version-bump rule, and the scripted grid-binding (`bind-grid.mjs`).
- **dataverse-mcp-usage** — query Dataverse + create supporting demo tables via the Dataverse MCP server.
- **dataverse-mcp-setup** — enable the Dataverse MCP server on an environment and connect a non-Microsoft client (Entra app, mcp.tools, PKCE).
- **bidirectional-pcf-agent** — the nudge protocol, dual registration, shared state, and the HTTPS/CSP/sandbox constraints.
- **mcp-apps-tool-dev** — adding/modifying tools on the server (the core loop of every new demo).
- **declarative-agent-sync** — the ATK flow + the three-file tool-enumeration sync that fails silently.
- **bridge-troubleshooting** — symptom → cause → fix for every loop failure mode.

## Make it your own

1. Add a real tool in `mcp-server/src/tools/` (copy `example-tool.stub.ts`) and register it in
   `server.ts`; re-run the agent sync.
2. Replace the smoke-test panel in `pcf-control/` with your component; keep the bridge wiring.
3. Create supporting Dataverse tables via the Dataverse MCP server.
4. Fill in the "fill in as your demo grows" section of `CLAUDE.md`.
