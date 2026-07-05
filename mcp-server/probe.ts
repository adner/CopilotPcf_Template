/**
 * Host-free inner loop — exercise server logic with no MCP client and no Power Apps host.
 *   npm run probe            (defaults to `smoke`)
 *   npm run probe smoke      -> run the smoke_test build; print the nudge payload the viewer would
 *                              fan out to the PCF, and write the widget HTML to dist/probe-smoke.html
 *                              so you can eyeball it in a browser.
 * Probe FIRST — settle server logic here before ever touching Copilot or Power Apps.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { configSummary } from "./src/config.js";
import { buildSmokeTest } from "./src/tools/smoke-test.js";

async function main() {
  const cmd = process.argv[2] ?? "smoke";
  console.log("config:\n" + JSON.stringify(configSummary(), null, 2) + "\n");

  if (cmd === "smoke") {
    const r = buildSmokeTest();
    const nudge = { eventName: "powerapps.copilot.chat.action", action: "template.smoketest.ping", actionData: r.smoke };
    console.log("text     :", r.text);
    console.log("nudge    :", JSON.stringify(nudge));
    console.log("html len :", r.html.length);
    mkdirSync("dist", { recursive: true });
    writeFileSync("dist/probe-smoke.html", r.html);
    console.log("wrote    : dist/probe-smoke.html (open in a browser to eyeball the card)");
    return;
  }

  console.error(`Unknown probe command: ${cmd}. Try: smoke`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
