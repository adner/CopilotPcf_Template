# AGENT.md

Guidance for agents working in this repo. **Authoring rule:** procedural knowledge → a skill in
`.agents/skills/`; always-true, load-bearing facts → this file; human narrative (diagrams, setup
walkthrough) → `README.md`. Keep this file a map, not a manual.

## What this repo is

A **starter template** for demos that show **bi-directional communication** between a model-driven
Power Apps **PCF component** and an **M365 Copilot declarative agent**, brokered by an **MCP (Apps)
server**. It exercises the `Xrm.Copilot` client APIs and the postMessage/nudge bridge. Three
components:

- **`mcp-server/`** — Node + TypeScript MCP (Apps) server, also a plain web server. Ships the
  reusable plumbing + one worked UI tool, **`smoke_test`**.
- **`pcf-control/`** — a full-page dataset PCF (`Bridge.SmokeTestPanel`) pre-wired with the bridge and
  a smoke-test panel.
- **`declarative-agent/`** — empty; scaffold the ATK agent here (see its README + the
  `declarative-agent-sync` skill).

The **"hello world" is the smoke-test loop**: the PCF's *Send smoke-test prompt* button opens M365
Copilot and submits "Run the bridge smoke test" → the agent calls `smoke_test` → its viewer renders a
card **and nudges a message back to the PCF** → the PCF shows "round-trip complete". *Fetch state*
reads the shared counter over HTTP.

## Commands (run in `mcp-server/`)

```bash
npm install
npm run probe smoke   # host-free: run smoke_test, print the nudge payload, write dist/probe-smoke.html
npm run build         # bundle the viewer to dist/mcp-app.html (REQUIRED before serve)
npm run serve         # Streamable HTTP on :3101/mcp  (health: /health)
npm run typecheck     # tsc on BOTH tsconfigs (server + DOM viewer)
```

In `pcf-control/`: `npm install`, `npm run build`, `npm run bind -- -- …` (solution-template grid
binding; see `pcf-develop-deploy`). **No test runner** — verification is `npm run probe` + the manual
loop.

## Always-true conventions

- **ESM throughout** (`"type":"module"`); relative imports use `.js` extensions even from `.ts`.
- **Two tsconfigs** in `mcp-server/`: `tsconfig.server.json` (Node; excludes the DOM viewer) and
  `tsconfig.json` (DOM; for `src/mcp-app.ts`). `typecheck` runs both.
- **`npm run build` before `npm run serve`**, or the viewer resource serves a "not built" fallback.
- **Config is centralized** in `mcp-server/src/config.ts` (`requireConfig`); `mcp-server/.env` is
  gitignored and holds real secrets — never log, echo, or commit it.

## The critical coupling (breaks silently when violated)

`PUBLIC_BASE_URL` (mcp-server/.env)  ==  PCF `serverBaseUrl` property  ==  the manifest
`external-service-usage` domain  ==  **the HTTPS devtunnel base**. An `http://localhost` server URL is
silently blocked as mixed content inside the HTTPS Power App. The **nudge envelope** is likewise
shared and must match on both ends: `mcp-server/src/mcp-app.ts` and `pcf-control/SmokeTestPanel/index.ts`
both use `eventName:"powerapps.copilot.chat.action"`, `action:"template.smoketest.ping"`.

## Skills — invoke the matching one before you act

- Add / change a **server tool** → `mcp-apps-tool-dev`, **then** `declarative-agent-sync`.
- **PCF** build / push / grid-binding → `pcf-develop-deploy` (bump the manifest version every push).
- Query Dataverse / create demo **tables** → `dataverse-mcp-usage`; Dataverse MCP server **not
  connected/configured yet** → `dataverse-mcp-setup`.
- Bridge / nudge / shared-state **design** → `bidirectional-pcf-agent`, `xrm-copilot-integration`.
- **Loop broken** (blank widget, nudge not arriving, mixed content, stale bundle) →
  `bridge-troubleshooting`.

## Fill in as your demo grows

Every clone becomes a different demo. Append the demo-specific, always-true facts here as you build:

- **Data model:** <tables/columns this demo uses; created via the `dataverse-mcp-usage` skill>
- **Tools added:** <name → what it does; each needs the 3-file agent sync>
- **Environment / deployment:** <Dataverse env url, hosting table + publisher prefix, gptId,
  devtunnel base>
