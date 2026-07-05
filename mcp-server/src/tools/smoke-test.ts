/**
 * The bridge smoke test — the template's "hello world" for the agent → PCF direction.
 *
 * buildSmokeTest() records a ping in shared state and assembles the confirmation widget. The MCP tool
 * (../../server.ts) returns { html, smoke } and the viewer (../mcp-app.ts) fans the `smoke` payload
 * out to the PCF as a nudge ON RENDER (a server tool cannot postMessage). Kept separate from
 * server.ts so `npm run probe smoke` can drive it host-free.
 */
import { assembleDocument } from "../assemble-document.js";
import * as store from "../store.js";

export interface SmokePayload {
  message: string;
  ts: string;
}
export interface SmokeResult {
  html: string;
  smoke: SmokePayload;
  text: string;
}

/**
 * Vanilla render() for the confirmation card. Note it APPENDS every node it creates — a
 * created-but-never-appended element renders nothing (a silent blank). See mcp-apps-tool-dev.
 */
function smokeRenderCore(): string {
  return `function render(container, rows){
    container.innerHTML='';
    var d=(rows&&rows[0])||{};
    var card=document.createElement('div');
    card.style.cssText='padding:20px;border-radius:12px;background:var(--panel);border:1px solid var(--border);text-align:center';
    var h=document.createElement('div');
    h.textContent='\\u2713 smoke_test ran';
    h.style.cssText='font-size:18px;font-weight:700;color:var(--accent);margin-bottom:8px';
    var m=document.createElement('div');
    m.textContent=d.message||'';
    m.style.cssText='font-size:14px;color:var(--fg)';
    var t=document.createElement('div');
    t.textContent=d.ts||'';
    t.style.cssText='font-size:12px;color:var(--muted);margin-top:10px';
    card.appendChild(h); card.appendChild(m); card.appendChild(t);
    container.appendChild(card);
    if(window.__measure) window.__measure();
  }`;
}

export function buildSmokeTest(now: string = new Date().toISOString()): SmokeResult {
  const message = "Round-trip OK — hello from smoke_test";
  const s = store.recordPing(message, now);
  const html = assembleDocument(
    smokeRenderCore(),
    { mode: "inline", rows: [{ message, ts: now }] },
    { title: "Bridge smoke test" },
  );
  return { html, smoke: { message, ts: now }, text: `smoke_test ran (ping #${s.pings}).` };
}
