---
name: pcf-develop-deploy
description: >-
  Use when building, versioning, deploying, or binding a PCF (Power Apps Component Framework) control
  with the pac CLI — especially a dataset control hosted full-page as a table's grid. Covers the
  mandatory version bump before every push (stale-bundle cause), the build→push→publish→reload loop, and
  binding via the checked-in solution XML template, with bind-grid.mjs kept as the export-roundtrip
  fallback. Triggers: "pac pcf push", "deploy the control", "PCF version", "stale bundle", "bind the
  control to the table", "binding-template", "customcontroldefaultconfig", "grid control won't show up".
---

# PCF develop & deploy (pac CLI)

## Inner loop
```bash
npm run build                 # webpack the control
pac pcf push --publisher-prefix <prefix>   # push to the org (creates a temp solution wrapper, imports, publishes)
```
Then hard-reload the model-driven app tab (Ctrl+Shift+R).

## RULE 1 — Bump the ControlManifest version before EVERY push

Edit `version` in `<Control>/ControlManifest.Input.xml` (a patch bump is enough) **before every**
`npm run build && pac pcf push`.

**Why:** UCI caches the PCF bundle in the browser and decides whether to re-fetch by the control
**version**. `pac pcf push` updates the org, but without a version bump the app keeps serving the OLD
bundle no matter how many times you push — the #1 cause of "why am I still seeing the old build."

If still stale after a bump+push+hard-reload: maker portal → **Publish all customizations** → wait ~1 min
→ hard-reload.

Changing the `external-service-usage` domain (e.g. a new devtunnel URL) is a **manifest change** → same
rule: edit + version bump + push.

## RULE 1b — Manifest attribute values must be XML-valid AND Dataverse-XSD-valid

`npm run build` (webpack/pcf-scripts) uses a **lenient** parser and will happily compile a manifest that
`pac pcf push` then rejects. Two traps, both in `*-key` attributes (`display-name-key`, `description-key`):

- **No raw `<` `>` `&`** in attribute values — escape as `&lt;` `&gt;` `&amp;` (e.g. write `T_&lt;guid&gt;`,
  not `T_<guid>`). A raw `<` fails XML parse → `pac` dies with `System.Xml.XmlException` while *reading* the
  manifest (before any import).
- **No apostrophes** in those attributes — Dataverse's `noAposStringType` datatype rejects them, so the
  **solution import** fails with `'…' is invalid according to its datatype 'noAposStringType'`. Reword
  (`the server's STATE_KEY` → `the server STATE_KEY`). (Unicode like `↔` is fine.)

## RULE 2 — Binding a dataset PCF as a table's grid control is done via solution XML, not the UI

To host a dataset PCF full-page, it must be set as the **read-only grid control** of a hosting table.
The classic "Add control" customization picker **will not list your PCF dataset control** (a known
classic-editor flakiness) — the built-in Power Apps grid control shows, yours doesn't.

Do **not** fight the UI. Author the binding directly in `CustomControlDefaultConfigs`, on **all three
form factors (0/1/2)**, with the control's static input-property values. Importing a solution
regenerates the `controldescriptionjson` from the XML — patching XML alone (e.g. a raw `update_record`)
leaves stale JSON, so always go through **solution import with `--publish-changes`**.

The classic UI will *still* show "no custom control" afterward — **it is an unreliable mirror; runtime is
the source of truth.** Confirm by opening the table grid directly:
`https://<org>.crm4.dynamics.com/main.aspx?pagetype=entitylist&etn=<table>`.

### Preferred: checked-in binding solution template

Use `pcf-control/binding-template/` plus `apply-grid-binding-template.mjs`. This builds a small
unmanaged solution from repo-native XML, then imports it. It is the best default for this template
because the binding shape is visible in source control and only the table/control/property values vary.

From `pcf-control/`:

```bash
npm run bind -- -- \
  --env https://<org>.crm.dynamics.com \
  --table <prefix>_<table> \
  --table-display-name "<Table Display Name>" \
  --table-collection-name "<Table Display Plural>" \
  --server-base-url https://<id>-3101.euw.devtunnels.ms \
  --state-key <key> \
  --auto-refresh-seconds 30
```

Optional overrides:

```bash
  --control bridge_Bridge.SmokeTestPanel \
  --dataset bridgeGrid \
  --agent-id T_<guid> \
  --solution BridgeGridBinding_<table>
```

Use `--pack-only` to generate and pack the solution without importing it. The script requires
`--table-display-name` so the import does not accidentally relabel the table; pass the existing table
display names.

**Once bound, the binding persists across normal code pushes** — a version bump + push is enough. Only
re-run binding when the hosting table changes, the static property values change, or the manifest
property/data-set names change.

### Fallback: export/patch/import round trip

Use `bind-grid.mjs` only when the template import does not work for an unusual table/solution shape, or
when you must preserve and patch a carrier solution's already-exported table XML instead of importing a
minimal binding solution. It exports a solution containing the table, injects/replaces the binding, and
imports it again.

```bash
npm run bind:roundtrip -- -- \
  --env https://<org>.crm.dynamics.com \
  --table <prefix>_<table> \
  --control <prefix>_<Namespace>.<Constructor> \
  --dataset <manifestDataSetName> \
  --prop serverBaseUrl=https://<id>-3101.euw.devtunnels.ms \
  --prop agentId=T_<guid> \
  --prop stateKey=<key> \
  --prop autoRefreshSeconds=30
```
The doubled `-- --` is intentional for npm argument forwarding on Windows/npm 11.

### Binding gotchas that make it silently fail (symptom: the DEFAULT grid renders, no error)

- **`CustomControlDefaultConfigs` goes on the OUTER `<Entity>`, not the inner `<entity>`.** Modern
  `pac solution unpack` splits each table into `Entities/<table>/Entity.xml`; the block must be a sibling
  of `<FormXml>`/`<SavedQueries>`/`<RibbonDiffXml>` (i.e. right before `</Entity>`), **not** a child of the
  inner `<entity Name="…">`. Put it inside `<entity>` and **import silently drops it** → default grid.
  The checked-in template and both scripts put it in the correct place.
- **Do NOT delete the carrier solution.** The binding rides in whatever unmanaged solution you imported it
  through. Deleting that solution **removes the `CustomControlDefaultConfig`** and the default grid comes
  back. Use a stable solution name with the template path; do not treat it as disposable after import.
- **Verify by export, not by the classic UI.** Re-export the solution, unpack, and confirm a
  `<CustomControlDefaultConfigs>` block sits under the table's outer `<Entity>`. The classic UI lies either
  way; a runtime hard-reload (Ctrl+Shift+R) or **Publish all customizations** shows the real result.
- **Windows:** both scripts shell out to `pac` — on Windows the CLI is `pac.cmd`, which Node can only
  spawn via a shell; the scripts handle this. If they error `spawnSync pac ENOENT`, your `pac` isn't the
  `.cmd` on PATH.

## Prerequisites
- `pac auth create --url https://<org>.crm.dynamics.com` (an expired refresh token → `AADSTS700082`;
  just re-run `pac auth create`).
- The hosting table exists (create it via the **dataverse-mcp-usage** skill). Note its publisher prefix
  may be the environment default (e.g. `cr19f`), not your PCF `--publisher-prefix`.

See also: **xrm-copilot-integration** (the control's runtime bridge), **bridge-troubleshooting**
(stale-bundle / mixed-content symptoms).
