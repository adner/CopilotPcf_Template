import { IInputs, IOutputs } from "./generated/ManifestTypes";

/**
 * Bridge.SmokeTestPanel — a full-page dataset PCF that demonstrates BOTH directions of the
 * bi-directional Xrm.Copilot ↔ MCP bridge. The dataset is ignored (it only hosts the control
 * full-page; never a custom page — that has no window.Xrm).
 *
 *   PCF → Copilot :  the "Send smoke-test prompt" button opens the M365 Copilot pane and submits a
 *                    prompt that the declarative agent routes to the `smoke_test` MCP tool.
 *   Copilot → PCF :  `smoke_test`'s viewer nudges a message back; we receive it via DUAL registration
 *                    and show it. (See the bidirectional-pcf-agent skill.)
 *   Shared state  :  "Fetch state" reads GET /state?k= over HTTP (the reconcile-via-server path).
 *
 * Nudge envelope — MUST match the server viewer (mcp-server/src/mcp-app.ts):
 *   { eventName: "powerapps.copilot.chat.action", action: "template.smoketest.ping",
 *     actionData: { message, ts } }
 */

// window.Xrm.Copilot is ambient in a model-driven app but absent from PCF typings.
interface CopilotApi {
  isM365CopilotEnabled?: () => boolean;
  openM365CopilotPanel?: () => Promise<void> | void;
  sendPromptToM365Copilot?: (text: string, options?: { autoSubmit?: boolean; gptId?: string }) => Promise<void> | void;
  addActionHandler?: (action: string, handler: (data: unknown) => void) => void;
  // Returns a Promise (NOT a sync value). Resolves to { agentId, mode } or undefined when the agent
  // state isn't known yet. agentId is the gptId (T_<guid>) when an agent is active, else null.
  getCurrentAgent?: () => Promise<M365CopilotAgent | undefined>;
}
interface M365CopilotAgent {
  agentId: string | null;
  mode: "agentPage" | "mentioned" | null;
}
function copilotApi(): CopilotApi | undefined {
  return (window as unknown as { Xrm?: { Copilot?: CopilotApi } }).Xrm?.Copilot;
}

const HOST_EVENT = "powerapps.copilot.chat.action";
const HOST_ACTION = "template.smoketest.ping";
const SMOKE_PROMPT = "Run the bridge smoke test";

interface Ping {
  message: string;
  ts: string;
}

export class SmokeTestPanel implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private root!: HTMLDivElement;
  private gptInput!: HTMLInputElement;
  private statusEl!: HTMLDivElement;
  private receivedEl!: HTMLDivElement;
  private stateEl!: HTMLDivElement;

  private serverBaseUrl = "";
  private agentId = "";
  private stateKey = "";
  private pollSeconds = 0;
  private pollHandle: number | undefined;

  private onWindowMessage = (e: MessageEvent): void => this.handleHostMessage(e);

  public init(
    context: ComponentFramework.Context<IInputs>,
    _notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement,
  ): void {
    this.readConfig(context);
    this.buildChrome(container);

    // Nudge receive — DUAL registration (the Copilot pane is a nested iframe; addActionHandler
    // routing can be unreliable there, so the raw message listener is the load-bearing path).
    copilotApi()?.addActionHandler?.(HOST_ACTION, (data) => this.onNudge(data));
    window.addEventListener("message", this.onWindowMessage);

    this.applyPolling();
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    const before = `${this.serverBaseUrl}|${this.stateKey}|${this.pollSeconds}|${this.agentId}`;
    this.readConfig(context);
    if (`${this.serverBaseUrl}|${this.stateKey}|${this.pollSeconds}|${this.agentId}` !== before) {
      if (this.gptInput && !this.gptInput.value) this.gptInput.value = this.agentId;
      this.applyPolling();
    }
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    window.removeEventListener("message", this.onWindowMessage);
    if (this.pollHandle !== undefined) window.clearInterval(this.pollHandle);
  }

  // --- config ---------------------------------------------------------------
  private readConfig(context: ComponentFramework.Context<IInputs>): void {
    const p = context.parameters;
    this.serverBaseUrl = (p.serverBaseUrl.raw ?? "").replace(/\/+$/, "");
    this.agentId = p.agentId.raw ?? "";
    this.stateKey = p.stateKey.raw ?? "";
    this.pollSeconds = Math.max(0, p.autoRefreshSeconds.raw ?? 0);
  }

  private applyPolling(): void {
    if (this.pollHandle !== undefined) {
      window.clearInterval(this.pollHandle);
      this.pollHandle = undefined;
    }
    if (this.pollSeconds > 0 && this.serverBaseUrl && this.stateKey) {
      this.pollHandle = window.setInterval(() => void this.fetchState(true), this.pollSeconds * 1000);
    }
  }

  // --- DOM ------------------------------------------------------------------
  private buildChrome(container: HTMLDivElement): void {
    this.root = document.createElement("div");
    this.root.className = "bsp-root";

    const title = document.createElement("div");
    title.className = "bsp-title";
    title.textContent = "Xrm.Copilot ↔ MCP bridge — smoke test";

    const sub = document.createElement("div");
    sub.className = "bsp-sub";
    sub.textContent =
      "Send a prompt to M365 Copilot; the agent's smoke_test tool nudges a message back here. One button proves both directions of the loop.";

    // gptId row
    const row = document.createElement("div");
    row.className = "bsp-row";
    this.gptInput = document.createElement("input");
    this.gptInput.className = "bsp-input";
    this.gptInput.placeholder = "gptId (T_<guid>) — from getCurrentAgent()";
    this.gptInput.value = this.agentId;
    const reveal = document.createElement("button");
    reveal.className = "bsp-btn";
    reveal.textContent = "Reveal current agent";
    reveal.addEventListener("click", () => this.revealAgent());
    row.append(this.gptInput, reveal);

    // action buttons
    const actions = document.createElement("div");
    actions.className = "bsp-row";
    const sendBtn = document.createElement("button");
    sendBtn.className = "bsp-btn bsp-btn--primary";
    sendBtn.textContent = "Send smoke-test prompt ✨";
    sendBtn.addEventListener("click", () => void this.sendToCopilot());
    const stateBtn = document.createElement("button");
    stateBtn.className = "bsp-btn";
    stateBtn.textContent = "Fetch state";
    stateBtn.addEventListener("click", () => void this.fetchState(false));
    actions.append(sendBtn, stateBtn);

    this.statusEl = document.createElement("div");
    this.statusEl.className = "bsp-status";

    this.receivedEl = document.createElement("div");
    this.receivedEl.className = "bsp-received";
    this.receivedEl.textContent = "Waiting for a nudge from the agent…";

    this.stateEl = document.createElement("div");
    this.stateEl.className = "bsp-state";

    this.root.append(title, sub, row, actions, this.statusEl, this.receivedEl, this.stateEl);
    container.appendChild(this.root);
  }

  private setStatus(msg: string, kind: "" | "ok" | "err" | "busy" = ""): void {
    this.statusEl.textContent = msg;
    this.statusEl.className = "bsp-status" + (kind ? " bsp-status--" + kind : "");
  }

  // --- PCF → Copilot --------------------------------------------------------
  private async sendToCopilot(): Promise<void> {
    const copilot = copilotApi();
    if (!copilot?.sendPromptToM365Copilot || !copilot.openM365CopilotPanel) {
      this.setStatus("Open this inside the model-driven app to use Copilot (window.Xrm.Copilot absent).", "err");
      return;
    }
    const gptId = this.gptInput.value.trim() || this.agentId || undefined;
    this.setStatus("Opening Copilot…", "busy");
    try {
      await copilot.openM365CopilotPanel();
      await copilot.sendPromptToM365Copilot(SMOKE_PROMPT, { autoSubmit: true, gptId });
      this.setStatus("Prompt sent — waiting for the agent to run smoke_test…", "busy");
    } catch (err) {
      this.setStatus("Could not open Copilot: " + this.msg(err), "err");
    }
  }

  private async revealAgent(): Promise<void> {
    try {
      // getCurrentAgent() returns a Promise — must await, or JSON.stringify(<Promise>) prints "{}".
      const agent = await copilotApi()?.getCurrentAgent?.();
      if (agent == null) {
        this.setStatus("getCurrentAgent() returned nothing (open the Copilot pane first).", "err");
        return;
      }
      if (!agent.agentId) {
        // Resolved, but on mainline Copilot (mode null) — no agent to reveal.
        this.setStatus("On mainline M365 Copilot — no active agent (open an agent first).", "err");
        return;
      }
      this.gptInput.value = agent.agentId;
      this.setStatus(`Filled gptId from getCurrentAgent() (mode: ${agent.mode ?? "?"}).`, "ok");
    } catch (err) {
      this.setStatus("getCurrentAgent() failed: " + this.msg(err), "err");
    }
  }

  // --- Copilot → PCF (nudge) ------------------------------------------------
  private handleHostMessage(e: MessageEvent): void {
    const d = e.data as { eventName?: string; action?: string; actionData?: unknown } | null;
    if (!d || d.eventName !== HOST_EVENT || d.action !== HOST_ACTION) return;
    this.onNudge(d.actionData);
  }

  private onNudge(actionData: unknown): void {
    const a = (actionData ?? {}) as Partial<Ping>;
    // Smoke-test exception: rendering straight from actionData proves payload delivery IS the point
    // here. Real demos reconcile via the server (GET /state), never render from actionData.
    const when = a.ts ? new Date(a.ts).toLocaleTimeString() : new Date().toLocaleTimeString();
    this.receivedEl.textContent = `✓ Round-trip complete — received "${a.message ?? "(no message)"}" at ${when}`;
    this.receivedEl.classList.add("bsp-received--ok");
    this.setStatus("Nudge received from the agent.", "ok");
    void this.fetchState(true);
  }

  // --- shared state ---------------------------------------------------------
  private async fetchState(quiet: boolean): Promise<void> {
    if (!this.serverBaseUrl || !this.stateKey) {
      if (!quiet) this.setStatus("Set Server Base URL and State Key on the control.", "err");
      return;
    }
    try {
      const res = await fetch(`${this.serverBaseUrl}/state?k=${encodeURIComponent(this.stateKey)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { state?: { pings?: number; lastMessage?: string; lastTs?: string } };
      const s = body.state ?? {};
      this.stateEl.textContent = `Shared state — pings: ${s.pings ?? 0}, last: ${s.lastMessage ?? "—"}`;
    } catch (err) {
      if (!quiet) this.setStatus("Could not read /state: " + this.msg(err), "err");
    }
  }

  private msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
