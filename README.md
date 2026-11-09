# assist-plugin for OpenCode

OpenCode V2 port of [assist-marketplace-plugin](../assist-marketplace-plugin): 22 skills,
16 agents (code-reviewer is restored alongside reviewer), and the 20 governance hooks. The hook logic is the original, vendored
unchanged under `plugins/assist-plugin/`; the new code in `src/` adapts OpenCode events
to it.

Verified on OpenCode `v2.2.6`, Node `v26.8.1`, Linux.

## Status

| Area | State | Evidence |
|---|---|---|
| Skills | 22 loaded, 4 hidden | `ctx.skill.list()` returned 29 with built-ins; 22 assist skills and correct `autoinvoke` |
| Commands | 20 wrappers, including `/assist-health` and `/assist-audit` | `ctx.command.list()` and live `/assist-audit` |
| Agents | 16 loaded | `opencode debug agents` |
| Hooks | 20 wired | 21 adapter tests plus the vendored 2431-test suite |
| Live gates | Prose and subagent write bar deny | em-dash write blocked; `DECISIONS.md` write by a subagent blocked |
| Audit | Five attribution fields | `.agent/logs/governance/audit.jsonl`; chain verified |

See `docs/parity-matrix.md` for the component table and known gaps.

## Layout

```text
.opencode/
  agents/           16 agent Markdown files
  skills/           22 skill directories
  commands/         18 slash-command wrappers
  plugins/assist/   local plugin entry
src/
  index.ts          Plugin.define
  hooks.ts          OpenCode hook registration
  adapter.ts        OpenCode event -> legacy hook input
  legacy.ts         loads the vendored CommonJS modules
  state.ts          child-session and context state
plugins/assist-plugin/
  hooks/            original hook implementations and rule libraries
  rules/            writing standard and governance rules
config/models.json  tier -> model mapping used by the current pins
tests/              original hook regression suite
test/               adapter and integration tests
docs/               porting plan, phase notes, parity matrix
```

## Quick start: use this repository as a project

Open OpenCode in this directory. Skills, agents, commands, and the plugin load from
`.opencode/`.

```sh
cd assist-marketplace-plugin-opencode
opencode
```

Try `/do <task>` or `/ask <question>`.

## Install globally

```sh
node scripts/install.mjs --target ~/.config/opencode
```

With a terminal, the installer asks for the default model and whether all agents
should use it. Suggested defaults: `deepseek/deepseek-flash` and
`opencode-go/muse-spark-1.3-contributor`. Non-interactive form:

```sh
node scripts/install.mjs --model deepseek/deepseek-flash
node scripts/install.mjs --model deepseek/deepseek-flash --all-agents
node scripts/install.mjs --model deepseek/deepseek-flash --yes
```

The installer backs up an existing `opencode.json` or `opencode.jsonc` before writing,
preserves unrelated keys, and merges the agent, skill, and command directories instead
of replacing them.

The installer copies:

- `src/` and `plugins/assist-plugin/` to `<target>/assist/`
- agents, skills, and commands to their global OpenCode directories
- a plugin entry to `<target>/plugins/assist/index.ts`
- `./plugins/assist` into the `plugins` array of `<target>/opencode.json`

Existing files are kept unless you pass `--force`; conflicts are copied with an
`.assist-new` suffix. Use `--dry-run` to inspect the plan.

An `opencode.jsonc` config is not rewritten. The installer writes
`assist-plugin-snippet.jsonc` with the entry to add.

## Commands

| Command | Purpose |
|---|---|
| `/do` | Route a task through requirements, spec, task plan, build, and review |
| `/ask` | Answer a question from the repository, optionally with web research |
| `/debug` | Analyze a bug and produce an RCA |
| `/assist-health` | Run every guard self-test and report failures (plugin tool `assist_health`) |
| `/assist-audit` | Verify the governance audit hash chain (plugin tool `assist_audit`) |

All 18 user-invocable skills have a command wrapper, plus `/assist-health` and `/assist-audit`. The four internal skills (`code`,
`integrated-test`, `pentest`, `run-test`) are hidden from model invocation and loaded by
their agents.

## Models

`config/models.json` records the routing. `config/agents.json` holds the per-agent pin.

| Role | Agents | Model |
|---|---|---|
| Main orchestrator | main session | `opencode-go/qwen3.7-plus` |
| Built-in general | `general` | `opencode-go/deepseek-v4.1-flash` |
| Scouting | `explore` | `opencode-go/deepseek-v4.1-flash#low` |
| Implementation | `developer`, `worker`, `researcher`, `general-purpose` | `opencode-go/deepseek-v4.1-flash` |
| Conversational and triage | `ask`, `intake-reviewer`, `requirements-gatherer` | `opencode-go/deepseek-v4.1-flash#low` |
| Planning and architecture | `planner`, `task-planner`, `devops`, `solutions-architect` | `opencode-go/glm-5.3-flash` |
| Verification | `qa` | `opencode-go/deepseek-v4-pro` |
| Developer tests | `developer-tester` | `opencode-go/glm-5.3-flash#low` |
| General review | `reviewer` | `opencode-go/gpt-6-luna` |
| Critical review and sign-off | `code-reviewer` | `opencode-go/deepseek-v4-pro` |

Only `code-reviewer` and `qa` use `deepseek-v4-pro`. No agent uses `qwen3.7-plus` or `claude-haiku-5-5`.
The six `#low` pins use the provider's supported low reasoning effort.

`code-reviewer` is restored for critical review and sign-off. `reviewer` remains for
general review. The global orchestration mandate dispatches reviews to `@code-reviewer`.

`general-purpose` is hidden from the subagent listing because it is an orchestrator
fallback, not a directly dispatched role.

## Delegation boundary

The main `build` agent denies `edit` and `write` at the root and agent level. It must
dispatch `developer`, `developer-tester`, `explore`, or `code-reviewer`. The built-in
`general` subagent keeps `edit`, `write`, and `shell` allows.

`shell` remains allowed for `build`, so a shell redirect can still modify files. Add a
`shell` deny to `agents.build.permissions` if you need a hard file-write boundary.

The `/do` skill still names `reviewer` in its gate tables. The global mandate names
`code-reviewer`. Treat `reviewer` as the general reviewer and `code-reviewer` as the
critical sign-off reviewer.

## Fallbacks

OpenCode V2 has no native `fallback` key in the config schema. The fallback is
programmatic in the `retry` session hook in `src/hooks.ts`.

| From | Fallback |
|---|---|
| `deepseek-v4.1-flash` | `glm-5.3-flash` |
| `glm-5.3-flash` | `deepseek-v4.1-flash` |
| `gpt-6-luna` | `glm-5.3-flash` |

On 429 or 5xx, the hook retries twice with backoff, then switches the session model to
the fallback once. It never loops on the same model and never uses Iceman Contributor
Free.

## Compaction

`opencode.json` sets:

```json
"compaction": { "auto": true, "keep": { "tokens": 120000 }, "buffer": "10%" }
```

Compaction runs near the context limit and keeps a large tail, so it rewrites rarely.
`compaction.prune` is left at its default `false`.

## Prompt cache and context

- The static writing standard loads from `instructions`, not from a per-request hook.
  It stays in the stable system prefix.
- No hook appends timestamps, session IDs, purpose tags, or audit nonces to prompts.
  Audit metadata stays on disk.
- Successful writes do not add advisory text to the tool result. Prose advice, goal
  warnings, and injection warnings go to the server log. The injection filter still
  rewrites a tool result when it matches an injection rule.
- Guarded tools fail closed: `write`, `edit`, `shell`, `webfetch`, and `websearch` are
  denied when the adapter cannot translate the payload, or when a write bar, PHI/FERPA
  guard, or shell permission gate throws.

## Governance

- `fsa-write-bar` and `prose-gate` throw from `tool.execute.before`. OpenCode rejects
  that call only; the model sees the reason and can rewrite.
- Shell guards run in `permission.evaluate`, so `pr-post-ask` uses OpenCode's native
  `ask` effect.
- Attribution comes from `sessionID` and `agent` on every tool hook. Child sessions are
  identified by `session.created.parentID`; the child session ID is the `agent_id`.
- `fsa-log` reads the child's final message from the parent's `subagent` tool result.
- Audit records go to `<project>/.agent/logs/governance/audit.jsonl`.
- Hook failures fail open by default, matching the original design. A guard with a
  `guardedClass` fails closed for that class.

## Tests

```sh
npm test            # adapter and integration tests
npm run test:legacy # original 2431-test hook suite
npm run test:all
```

The legacy suite runs the vendored CommonJS code unchanged. `tests/package.json` marks
that tree as CommonJS because the root package is ESM.

Current results:

- `npm test`: 21 passed, 0 failed.
- `npm run test:legacy`: 2431 passed, 0 failed, 3 skipped.

The 3 skips need `git archive 41034c1`, which is not present in this checkout. They are
counted as skipped, not passed.

## Live verification

1. An em-dash write to a project Markdown file was denied by `prose-gate`; the model
   stopped and the file was not created.
2. A `developer` subagent writing `DECISIONS.md` was denied by `fsa-write-bar`; the
   subagent reported `state: Error` and `error_class: policy-rejection`.
3. The same run produced audit records with `operation`, `path`, `agent_type`,
   `agent_id`, `authorizer`, and `ts`, and an `fsa-log` record with `state: Error`.
4. `node plugins/assist-plugin/scripts/verify-audit-chain.js` reported
   `Audit chain intact: 17 lines verified across 1 segment.`
5. After the global install, an em-dash write in a separate project was blocked with
   the installed rule path, and `/assist-audit` used the `assist_audit` tool.

## Known limitations

- `PowerShell` and the `LSP` tool have no OpenCode equivalent and were dropped.
- Skill `allowed-tools` is not enforced; agent `permissions` are.
- Agents cannot be registered by a plugin; the installer copies Markdown files.
- There is no `enabledModels` scope or per-call model override on `subagent`.
- The `ask`/`do` skill prose was converted for tool names where it referred to a tool;
  review long skill bodies if a tool name matters.
- The legacy `health`, `commit`, and `do` skills contain `${CLAUDE_PLUGIN_ROOT}` and
  `${CLAUDE_SESSION_ID}` shell snippets. OpenCode shell tools do not inherit the
  plugin process environment, so those snippets do not resolve. Use `/assist-health`
  and `/assist-audit`, which call plugin tools, and treat the legacy snippets as
  Claude Code documentation.
- `/assist-health` can fall back to the legacy `health` skill, whose report still names
  two Claude Code attribution settings. Ignore those two lines in OpenCode.
- OpenCode V2 has no native fallback key. The fallback table is implemented in the
  `retry` hook, not in configuration.
- `apply_patch`, `multiedit`, and `notebookedit` are not exposed by OpenCode V2. If a
  provider emits one, the adapter treats it as a guarded tool and denies it.
- `code-reviewer` was merged into `reviewer`; references in the OpenCode skills now
  point at `reviewer`.

## License

AGPL-3.0-or-later, inherited from the upstream project. See `LICENSE` and `NOTICE`.
