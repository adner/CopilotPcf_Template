# declarative-agent/

Scaffold your **M365 Copilot declarative agent** here with the **Microsoft 365 Agents Toolkit (ATK)**
— this folder is intentionally empty so ATK owns its contents.

Two facts to get you started; the rest is a skill:

1. **ATK scaffolds into this folder.** Use the M365 Agents Toolkit (VS Code extension or `teamsapp`
   CLI) to create the declarative agent project.
2. **It reaches the MCP server via a `RemoteMCPServer` runtime** in `appPackage/ai-plugin.json`,
   pointed at your server's `/mcp` endpoint (the HTTPS devtunnel base — same as `PUBLIC_BASE_URL`).

**Everything else — the three-file tool-enumeration sync that must stay aligned every time you add or
rename a server tool (and fails *silently* when it drifts), the `_meta.ui.resourceUri` trap, the
`gptId = M365_TITLE_ID` gotcha, and validation — is in the `declarative-agent-sync` skill.** Run it
whenever you touch the agent.

The one tool this template ships is `smoke_test` (a UI tool → its `mcp-tools.json` entry needs
`_meta.ui.resourceUri: "ui://bridge/viewer.html"`). The prompt that triggers it is
**"Run the bridge smoke test"** (the PCF's send button submits exactly this), so your agent's
`instruction.txt` should route that phrase to `smoke_test`.
