---
name: bridge-troubleshooting
description: >
  Diagnostic playbook for when the PCF ↔ MCP ↔ M365 Copilot loop misbehaves. Use when "the component is
  blank", "the iframe won't load", "the nudge never arrives", "the pane card doesn't render", "I still see
  the old build", "fetch is blocked / CORS", "the agent won't call my tool", or "it opened the wrong
  agent". Indexed symptom → cause → check/fix, plus where to look. Cross-references bidirectional-pcf-agent,
  pcf-develop-deploy, and declarative-agent-sync.
---

# Bridge troubleshooting playbook

The loop has three hops: **PCF → Copilot** (`Xrm.Copilot.sendPromptToM365Copilot`), **agent → MCP tool**,
**tool/viewer → PCF** (the nudge). Most failures are one specific misconfiguration. Find the symptom.

## Symptom → cause → fix

**Component iframe is blank / nothing loads (often NO console error).**
→ **Mixed content.** The server URL is `http://…` (or `http://localhost`) but the Power App is served over
**HTTPS**, so the browser silently blocks the sub-resource. Fix: run the server behind the **HTTPS
devtunnel** and set `PUBLIC_BASE_URL` (mcp-server `.env`), the PCF `serverBaseUrl` property, **and** the
manifest `external-service-usage` domain **all** to that same `https://…devtunnels.ms` base. See
`bidirectional-pcf-agent` for the coupling.

**You keep seeing the OLD PCF build after pushing.**
→ **ControlManifest version not bumped.** UCI caches the bundle by control **version**. Fix: bump `version`
in `ControlManifest.Input.xml` (patch is fine) **before every** `npm run build && pac pcf push`, then
hard-reload the app (Ctrl+Shift+R); if still stale, Publish all customizations and wait ~1 min. See
`pcf-develop-deploy`.

**Component's own `fetch` of its `/data` (or `/state`) fails with a null-origin / CORS error.**
→ **iframe `sandbox` missing `allow-same-origin`.** A sandboxed iframe without it gets an opaque origin, so
every self-fetch becomes a null-origin CORS failure. Fix: `sandbox="allow-scripts allow-same-origin"` on
the tile iframe.

**`fetch` blocked by the document's own Content-Security-Policy.**
→ The assembled document's `<meta>` CSP lacks `connect-src`. Fix: ensure `connect-src 'self'` (and
`img-src data:` if you embed images) in the doc's META CSP. Framing blocked instead? That's the *tile*
response header `Content-Security-Policy: frame-ancestors …` — it must allow `https://*.dynamics.com`.

**The nudge never arrives at the PCF (agent ran, pane showed the card, but the PCF didn't react).**
→ Two common causes: **(a) frame depth** — the Copilot pane is a nested iframe; the viewer must post the
message to `window.top`, `window.parent`, AND `window.parent.parent`. **(b) single registration** — the
PCF must listen via **BOTH** `Xrm.Copilot.addActionHandler(action, h)` **and** a raw
`window.addEventListener("message", …)` filtering on `eventName` + `action`. Wire only one and it's flaky.
Also confirm the `eventName`/`action` strings match exactly on both ends. See `bidirectional-pcf-agent`.

**The pane card never renders (the tool ran — you see it in the logs — but no UI in Copilot).**
→ **Missing `_meta.ui.resourceUri`** on the tool's entry in the agent's `mcp-tools.json` (it must match the
viewer URI the server registers). This is the easiest sync step to forget. See `declarative-agent-sync`.

**The agent never calls your new tool.**
→ The tool isn't in **`run_for_functions[]`** in `ai-plugin.json`, and/or isn't described in
`instruction.txt`. Re-do the three-file sync (`mcp-tools.json` `tools[]`, `ai-plugin.json` `functions[]` +
`run_for_functions[]`, `instruction.txt`). See `declarative-agent-sync`.

**`sendPromptToM365Copilot` opens the WRONG agent (or a generic Copilot).**
→ **Wrong gptId.** You passed `TEAMS_APP_ID`; it must be **`M365_TITLE_ID`** (`T_<guid>` /
`U_<guid>.declarativeAgentPowerApps`). Verify the live value: open the agent, run
`Xrm.Copilot.getCurrentAgent()` in DevTools.

**A generated widget renders blank even though data is present.**
→ The render code created elements but never `appendChild`'d them, or reached for an external
resource/`eval` that the host CSP blocked (silent). Keep widget code **vanilla-only** and confirm every
created node is attached. See `mcp-apps-tool-dev`.

**`npm run serve` shows a "viewer not built" fallback page.**
→ You didn't `npm run build` first. The viewer is a Vite single-file bundle; build before serve.

## Where to look (observation points)

- **`mcp-server/logs/*.jsonl`** — one file per tool call; the user-facing error carries a `(log: <8char>)`
  handle that matches the filename. Start here for tool failures.
- **VS Code "MCP" output channel** — server stderr mirror / connection status (`.vscode/mcp.json` points
  the client at `http://localhost:3101/mcp`).
- **DevTools inside the Copilot pane** — for `postMessage`/CSP/nudge issues; run `Xrm.Copilot.getCurrentAgent()`
  here to confirm the live gptId, and watch the Console for CSP violations and the Network tab for blocked
  fetches.
- **`npm run probe`** — reproduce a tool host-free before blaming the host. If `probe` is green but Copilot
  fails, the problem is in the agent sync or the bridge, not the tool.

## Rule of thumb

Isolate the hop. If `probe` works, the tool is fine → suspect the **agent sync** (tool not routed) or the
**bridge** (nudge/CSP/sandbox). If the component won't even load, suspect **mixed content** or a **stale
bundle** first — those two account for most "it just doesn't work" reports.
