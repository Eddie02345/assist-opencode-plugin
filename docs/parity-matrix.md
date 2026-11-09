# Parity matrix

Status of every ported component. Verified against OpenCode `v2.2.6` on 2026-11-09.

## Skills (22)

All 22 skills are copied to `.opencode/skills/`. The four internal skills set
`metadata.opencode/autoinvoke: false`.

| Skill | Status | Notes |
|---|---|---|
| ask | Ported | `/ask` command wrapper |
| branch | Ported | `/branch` |
| bump | Ported | `/bump` |
| clarify | Ported | `/clarify` |
| code | Ported, hidden | preloaded by developer |
| commit | Ported | `/commit` |
| create-test | Ported | `/create-test` |
| debug | Ported | `/debug` |
| deslop | Ported | `/deslop` |
| do | Ported | `/do` |
| gather-requirements | Ported | `/gather-requirements` |
| health | Ported | `/health`; `/assist-health` runs the full self-test |
| integrated-test | Ported, hidden | preloaded by qa |
| map-project | Ported | `/map-project` |
| pentest | Ported, hidden | preloaded by qa |
| pr-review | Ported | `/pr-review` |
| review-md | Ported | `/review-md` |
| run-test | Ported, hidden | preloaded by qa |
| spec-from-requirements | Ported | `/spec-from-requirements` |
| task-plan | Ported | `/task-plan` |
| technical-writing | Ported | `/technical-writing` |
| voice-script | Ported | `/voice-script` |

Tool names in skill prose were converted where they referred to tools: backticked
names, `X tool`, `X command`, and tool lists. Remaining capitalized names are mostly
prose verbs or frontmatter metadata that OpenCode does not enforce.

## Agents (16)

All 16 agents are in `.opencode/agents/`. Each has `mode: subagent`, a model pin, and a
permission allowlist. `PowerShell` and `LSP` were dropped. `code-reviewer` is restored.

| Agent | Role | Model pin | Tools |
|---|---|---|---|
| ask | conversational | `opencode-go/deepseek-v4.1-flash#low` | read, grep, glob, websearch, webfetch |
| developer | implementation | `opencode-go/deepseek-v4.1-flash` | read, edit, grep, glob, shell |
| developer-tester | verification | `opencode-go/glm-5.3-flash#low` | read, edit, grep, glob |
| devops | planning | `opencode-go/glm-5.3-flash` | read, edit, grep, glob, shell |
| explore | scouting | `opencode-go/deepseek-v4.1-flash#low` | read, grep, glob |
| general-purpose | implementation | `opencode-go/deepseek-v4.1-flash` | read, edit, grep, glob, shell |
| intake-reviewer | conversational | `opencode-go/deepseek-v4.1-flash#low` | read, grep, glob |
| planner | planning | `opencode-go/glm-5.3-flash` | read, edit, grep, glob |
| qa | verification | `opencode-go/deepseek-v4-pro` | read, edit, grep, glob, shell |
| requirements-gatherer | conversational | `opencode-go/deepseek-v4.1-flash#low` | read, edit, grep, glob |
| researcher | implementation | `opencode-go/deepseek-v4.1-flash` | read, edit, grep, glob, shell, websearch, webfetch |
| code-reviewer | review | `opencode-go/deepseek-v4-pro` | read, grep, glob |
| reviewer | review | `opencode-go/gpt-6-luna` | read, grep, glob |
| solutions-architect | planning | `opencode-go/glm-5.3-flash` | read, edit, grep, glob, shell |
| task-planner | planning | `opencode-go/glm-5.3-flash` | read, edit, grep, glob |
| worker | implementation | `opencode-go/deepseek-v4.1-flash` | read, edit, grep, glob, shell |

## Hooks (20)

| Hook | OpenCode mechanism | Status |
|---|---|---|
| fsa-write-bar | `tool.execute.before`, throw to deny | Ported, live-tested |
| prose-gate | `tool.execute.before`, throw to deny | Ported, live-tested |
| prose-advisor | `tool.execute.after` | Ported |
| commit-attribution-guard | `permission.evaluate` | Ported, tested |
| doc-cli-guard | `permission.evaluate` | Ported, tested |
| sa-mermaid-only | `permission.evaluate` | Ported |
| pr-post-ask | `permission.evaluate`, effect `ask` | Ported, tested |
| pr-verdict-guard | `permission.evaluate` | Ported |
| phi-outbound-guard | `tool.execute.before` | Ported |
| ferpa-disclosure-guard | `tool.execute.before`, `run` records | Ported |
| injection-filter | prompt, execute.before, execute.after | Ported, tested |
| writing-context | `context` hook, once per session | Ported, tested |
| fsa-log | `execute.after` on `subagent` | Ported, live-tested |
| audit-log | `execute.after` | Ported, tested |
| data-access-log | `execute.before` | Ported |
| gate-evidence | `execute.after` on shell | Ported |
| goal-guard | `execute.after` on web tools | Ported |
| confirmation-record | `prompt` hook | Ported |
| purpose-capture | `prompt` hook | Ported |
| health-check | `/assist-health` command calls the `assist_health` tool | Ported, tested |

## Known gaps

| Gap | Effect | Mitigation |
|---|---|---|
| No `PowerShell` tool | PowerShell-only command paths are not judged | Use `shell`; the legacy PowerShell evaluators remain in the vendored code |
| No `LSP` tool | Agents lose LSP navigation | Use read/grep/glob; OpenCode LSP diagnostics are configured separately |
| `allowed-tools` not enforced | Skill-level tool scoping is advisory | Agent `permissions` are the enforcement point |
| No `skills:` preload | Agents load skills on demand | The agent body names the skills to load first |
| No runtime model override on `subagent` | "Can Override" agents use their pin | Change the pin, or add a command that switches the model |
| No `enabledModels` scope | Model allowlist is not enforced | Use provider configuration or a model transform |
| Plugins cannot add agents | Agents must be files | The installer copies `.opencode/agents` |
| Fail-open default | A crashed guard allows the call | Guards with `guardedClass` fail closed; the rest log and allow |
| Health report names Claude settings | `/assist-health` reports `attribution.commit` and `attribution.pr` from `.claude/settings.json` | Ignore those two lines in OpenCode, or map them to OpenCode config |
| Plugin commands not discovered by `opencode run` | `ctx.command.transform` commands did not appear in a headless run | `/assist-health` and `/assist-audit` are static files in `.opencode/commands/` |
| No native fallback key | The config schema has no `fallback` field | The `retry` hook switches model after two retries; see `docs/fallbacks.md` |
| No native per-agent reasoning key | Effort is selected with the model `#variant` (`#low`) | Six low-effort agents use `#low` pins |
| Write-capable tool aliases | `apply_patch`, `multiedit`, `notebookedit` are not exposed by OpenCode V2 | They are in the guarded set and fail closed if seen |
| Shell writes are scoped to `/do` | Outside `/do`, the main agent edits directly; inside `/do`, the skill forbids implementation and test file shell writes | `/do` keeps its own plan and `DECISIONS.md` writes |
| Profile opt-out uses `.claude/settings.json` | The FERPA/HIPAA opt-out reads the Claude settings path | Keep the file, or adjust `data-class.js` for your layout |
| Legacy skills use `${CLAUDE_PLUGIN_ROOT}` | Shell tools do not inherit the plugin process env | Use `/assist-health` and `/assist-audit`, which call plugin tools |
| `/do` confirmation token uses `${CLAUDE_SESSION_ID}` | The session ID is not exported to shell | Treat the confirmation-token snippet as Claude Code documentation |
