/**
 * Plain-HTTPS web plane — what the PCF (and any served component pages) hit over HTTP.
 *   GET /state?k=<stateKey>  -> the shared state (capability-token gated)
 * (/health is registered in main.ts.) Add your own component-data / served-tile endpoints here per
 * demo — see the mcp-apps-tool-dev and bidirectional-pcf-agent skills. On any page Power Apps will
 * iframe, set `Content-Security-Policy: frame-ancestors ${config.frameAncestors}` and serve the tile
 * with `sandbox="allow-scripts allow-same-origin"` from the PCF side (or its self-fetch 404s on a
 * null origin).
 */
import { Router, type Request, type Response } from "express";
import { config } from "./config.js";
import { tokenOk } from "./security.js";
import { httpLog } from "./logger.js";
import * as store from "./store.js";

function done(req: Request, status: number, start: number, tokenOkFlag?: boolean) {
  httpLog({
    method: req.method,
    path: req.path,
    status,
    ms: Date.now() - start,
    tokenOk: tokenOkFlag,
    origin: req.header("origin"),
  });
}

export function webRouter(): Router {
  const r = Router();

  // Shared-state read — the PCF's "Fetch state" button hits this to see the smoke-test ping counter.
  r.get("/state", (req: Request, res: Response) => {
    const start = Date.now();
    if (!tokenOk(req.query.k, config.stateKey)) {
      done(req, 401, start, false);
      return res.status(401).json({ error: "invalid token" });
    }
    res.setHeader("Cache-Control", "no-store");
    done(req, 200, start, true);
    res.json({ state: store.getState() });
  });

  return r;
}
