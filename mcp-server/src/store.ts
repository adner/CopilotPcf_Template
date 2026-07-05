/**
 * Singleton shared state, persisted to a JSON file. In this template it holds a tiny demo state that
 * the smoke test bumps; the PCF reads it over the web plane (GET /state?k=) — the "shared state via
 * the server" half of the bridge. Real demos replace `State` (and the helpers) with their own shape.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

export interface State {
  pings: number; // incremented every time smoke_test runs
  lastMessage: string | null;
  lastTs: string | null; // ISO timestamp of the last ping
}

let state: State = { pings: 0, lastMessage: null, lastTs: null };

function load(): void {
  if (!existsSync(config.stateFile)) return;
  try {
    const parsed = JSON.parse(readFileSync(config.stateFile, "utf-8")) as Partial<State>;
    state = {
      pings: parsed.pings ?? 0,
      lastMessage: parsed.lastMessage ?? null,
      lastTs: parsed.lastTs ?? null,
    };
  } catch {
    // Corrupt state file — start clean rather than crash.
    state = { pings: 0, lastMessage: null, lastTs: null };
  }
}
function save(): void {
  const dir = dirname(config.stateFile);
  if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
  writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
}
load();

export function getState(): State {
  return { ...state };
}

/** Record a smoke-test ping and persist. Returns the new state. */
export function recordPing(message: string, ts: string): State {
  state.pings += 1;
  state.lastMessage = message;
  state.lastTs = ts;
  save();
  return getState();
}
