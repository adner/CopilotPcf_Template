#!/usr/bin/env node
/**
 * Build and import a small Dataverse solution from pcf-control/binding-template to bind a PCF
 * dataset control as a table's read-only grid control.
 *
 * This is the preferred path for this repo because the solution XML is checked in and easy to diff.
 * Keep bind-grid.mjs as the fallback when the target org needs an export/patch/import round-trip.
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const out = { prop: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (key === "dry-run" || key === "pack-only" || key === "keep-workdir") {
      out[key] = true;
      continue;
    }
    const val = argv[++i];
    if (val === undefined) fail(`Missing value for --${key}.`);
    if (key === "prop") out.prop.push(val);
    else out[key] = val;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

function fail(msg) {
  console.error(`\napply-grid-binding-template: ${msg}\n`);
  process.exit(1);
}

function required(name) {
  if (!args[name]) fail(`Missing --${name}.`);
  return args[name];
}

function xmlEscape(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[c]);
}

function validateXmlName(name, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) {
    fail(`${label} "${name}" is not safe as an XML element/name.`);
  }
}

function solutionSafeName(name) {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function readTemplate(templateDir, rel) {
  return readFileSync(join(templateDir, rel), "utf8");
}

function render(text, values) {
  return text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (!(key in values)) fail(`Template placeholder {{${key}}} has no value.`);
    return values[key];
  });
}

function parseProp(spec) {
  const eq = spec.indexOf("=");
  if (eq < 1) fail(`Bad --prop "${spec}" (expected name=value or name=value:Type).`);
  const name = spec.slice(0, eq);
  validateXmlName(name, "Property name");
  let value = spec.slice(eq + 1);
  let type = "SingleLine.Text";
  const colon = value.lastIndexOf(":");
  if (colon > 0 && /^[A-Za-z.]+$/.test(value.slice(colon + 1))) {
    type = value.slice(colon + 1);
    value = value.slice(0, colon);
  }
  return { name, value, type };
}

function upsertProp(props, name, value, type = "SingleLine.Text") {
  if (value === undefined || value === null || value === "") return;
  const existing = props.find((p) => p.name === name);
  if (existing) {
    existing.value = value;
    existing.type = type;
  } else {
    props.push({ name, value, type });
  }
}

const table = required("table");
validateXmlName(table, "Table logical name");

const control = args.control || "bridge_Bridge.SmokeTestPanel";
const dataset = args.dataset || "bridgeGrid";
validateXmlName(control, "Control name");
validateXmlName(dataset, "Dataset name");

const tableDisplayName = required("table-display-name");
const tableCollectionName = args["table-collection-name"] || `${tableDisplayName}s`;
const solutionUniqueName = solutionSafeName(args.solution || `BridgeGridBinding_${table}`);
const solutionDisplayName = args["solution-display-name"] || `${tableDisplayName} Grid Binding`;

const props = args.prop.map(parseProp);
upsertProp(props, "serverBaseUrl", args["server-base-url"]);
upsertProp(props, "agentId", args["agent-id"]);
upsertProp(props, "stateKey", args["state-key"]);
upsertProp(props, "autoRefreshSeconds", args["auto-refresh-seconds"], "Whole.None");
if (!props.some((p) => p.name === "serverBaseUrl")) {
  fail("Missing serverBaseUrl. Pass --server-base-url <url> or --prop serverBaseUrl=<url>.");
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../../..");
const templateDir = resolve(args["template-dir"] || join(repoRoot, "pcf-control", "binding-template"));
if (!existsSync(templateDir)) fail(`Template directory not found: ${templateDir}`);

const workRoot = resolve(args["workdir"] || join(tmpdir(), `bridge-grid-binding-${Date.now()}`));
const solutionDir = join(workRoot, "solution");
const zipPath = resolve(args.zip || join(workRoot, `${solutionUniqueName}.zip`));
mkdirSync(workRoot, { recursive: true });
cpSync(templateDir, solutionDir, { recursive: true });

const tablePlaceholderDir = join(solutionDir, "Entities", "__TABLE_LOGICAL_NAME__");
const tableDir = join(solutionDir, "Entities", table);
renameSync(tablePlaceholderDir, tableDir);

const propertyTemplate = readTemplate(templateDir, "fragments/property.xml");
const customControlTemplate = readTemplate(templateDir, "fragments/customControl.xml");
const configsTemplate = readTemplate(templateDir, "fragments/CustomControlDefaultConfigs.xml");

const propertyElements = props
  .map((p) => render(propertyTemplate, {
    PROPERTY_NAME: p.name,
    PROPERTY_TYPE: xmlEscape(p.type),
    PROPERTY_VALUE: xmlEscape(p.value),
  }))
  .join("\n");

const customControls = [0, 1, 2]
  .map((formFactor) => render(customControlTemplate, {
    FORM_FACTOR: String(formFactor),
    CONTROL_NAME: xmlEscape(control),
    DATASET_NAME: xmlEscape(dataset),
    PROPERTY_ELEMENTS: propertyElements,
  }))
  .join("\n");

const customControlDefaultConfigs = render(configsTemplate, {
  CUSTOM_CONTROLS: customControls,
});

const common = {
  TABLE_LOGICAL_NAME: xmlEscape(table),
  TABLE_DISPLAY_NAME: xmlEscape(tableDisplayName),
  TABLE_COLLECTION_NAME: xmlEscape(tableCollectionName),
  CONTROL_NAME: xmlEscape(control),
  SOLUTION_UNIQUE_NAME: xmlEscape(solutionUniqueName),
  SOLUTION_DISPLAY_NAME: xmlEscape(solutionDisplayName),
  SOLUTION_VERSION: xmlEscape(args["solution-version"] || "1.0.0.0"),
  PUBLISHER_NAME: xmlEscape(args["publisher-name"] || "bridgebinding"),
  PUBLISHER_DISPLAY_NAME: xmlEscape(args["publisher-display-name"] || "Bridge Binding"),
  PUBLISHER_PREFIX: xmlEscape(args["publisher-prefix"] || "bridge"),
  PUBLISHER_OPTION_VALUE_PREFIX: xmlEscape(args["publisher-option-value-prefix"] || "10000"),
  CUSTOM_CONTROL_DEFAULT_CONFIGS: customControlDefaultConfigs,
};

for (const rel of ["Other/Solution.xml", `Entities/${table}/Entity.xml`]) {
  const p = join(solutionDir, rel);
  writeFileSync(p, render(readFileSync(p, "utf8"), common));
}
rmSync(join(solutionDir, "fragments"), { recursive: true, force: true });

function runPac(subargs) {
  const isWin = process.platform === "win32";
  const pac = isWin ? "pac.cmd" : "pac";
  console.error(`pac ${subargs.join(" ")}`);
  execFileSync(pac, subargs, { stdio: "inherit", shell: isWin });
}

runPac(["solution", "pack", "--zipfile", zipPath, "--folder", solutionDir, "--packagetype", "Unmanaged", "--allowWrite", "true"]);
if (!existsSync(zipPath)) fail(`pac solution pack did not create ${zipPath}.`);

if (!args["pack-only"] && !args["dry-run"]) {
  const importArgs = ["solution", "import", "--path", zipPath, "--force-overwrite", "--publish-changes"];
  if (args.env) importArgs.splice(2, 0, "--environment", args.env);
  runPac(importArgs);
}

console.error(`\nCreated binding solution: ${zipPath}`);
console.error(`Generated source: ${solutionDir}`);
if (args.env) {
  const host = args.env.replace(/\/+$/, "");
  console.error(`Verify runtime grid: ${host}/main.aspx?pagetype=entitylist&etn=${table}`);
}
console.error(`Generated source can be inspected or removed at: ${workRoot}`);
