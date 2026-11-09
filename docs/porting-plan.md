> Status: executed. The phase notes and results are in `docs/phases/`.

# Porting assist-plugin to OpenCode V2

The port is feasible. The skills, agents, and command surface move with mechanical
conversion. The governance layer also survives, and in one respect improves: every
OpenCode tool hook carries `sessionID` and `agent`, and `tool.execute.before` can reject
a call. That means the per-event attribution the compliance work depends on is available
without the parent/child workaround the Pi port needed.

The one unproven assumption is whether server-level tool hooks fire for tool calls made
inside a subagent's child session. If they do, the port keeps behavioral parity. If they
do not, `fsa-log` and the FR-227 audit record need a redesign around child-session events.
Phase 0 proves or disproves this before any hook is ported.

Verification basis: OpenCode CLI `v2.2.6`, `@opencode/plugin@2.2.6` type definitions,
`@opencode/schema@2.2.6`, the served OpenAPI document, and the OpenCode V2 docs. Claims
that come only from docs are labeled. Claims verified in package types cite the file.

## 0. Goal and non-goal

Goal: behavioral parity for the 22 skills, 16 agents, `/do` orchestration, and the 20
hook implementations, shipped as an OpenCode plugin package plus agent and skill files.

Non-goal: preserving the Claude Code process model. `hooks.json`, the Node version gate
in `hooks/lib/launch.js`, and the stdin/stdout JSON contract are deleted. Hooks become
in-process TypeScript handlers in one plugin.

## 1. Component mapping

| assist-plugin concept | Repo evidence | OpenCode V2 mechanism | Effort | Verification |
|---|---|---|---|---|
| Plugin package | `plugins/assist-plugin/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | npm package with a server part exporting `Plugin.define({ id, setup })`; or a local `.opencode/plugins/<name>/index.ts` | Low | Docs, /build/plugins |
| 22 skills | 22 `plugins/assist-plugin/skills/*/SKILL.md` | `.opencode/skills/<id>/SKILL.md`, `skills` config entries, or `ctx.skill.transform` | Low | Docs, /skills; `Skill.Info` in `@opencode/schema` |
| `user-invocable: false` on 4 skills | `skills/code`, `skills/run-test`, `skills/pentest`, `skills/integrated-test` | `metadata.opencode/autoinvoke: false` or `disable-model-invocation: true` | Low | Docs, /skills |
| 16 agents | `plugins/assist-plugin/agents/*.md` | `.opencode/agents/<id>.md` or `agents` config; body becomes the system prompt | Low | Docs, /agents |
| `model: haiku\|sonnet\|opus` | all agent frontmatter | per-agent `model: provider/model#variant` | Low, config decision | Docs, /agents; `Agent.Info.model` |
| `effort: low\|medium\|high\|xhigh` | all agent frontmatter | model variant suffix when the provider defines one; otherwise drop | Low | `Model.VariantID` in `@opencode/schema` |
| `tools: [Read, Write, ...]` | all agent frontmatter | ordered `permissions` rules; no direct tools allowlist | Medium | Docs, /agents and /permissions |
| `skills:` preload on an agent | `agents/developer.md`, `agents/qa.md` | no preload field; instruct the agent in its prompt or inject via `session.hook("context")` | Medium | Docs, /agents |
| `/do`, `/ask`, `/debug` slash UX | skill names | `.opencode/commands/<name>.md`, or `ctx.command.transform` with `prompt.skills` | Low | Docs, /commands; `CommandDefinition` |
| `rules/*.md` | `plugins/assist-plugin/rules/` | `instructions` config entries or `AGENTS.md` | Low | Docs, /instructions |
| `output-styles/terse.md` | `plugins/assist-plugin/output-styles/terse.md` | fold into agent system prompt or an `instructions` entry; no output-style concept | Low | Docs |
| 20 hook implementations | `plugins/assist-plugin/hooks/impl/*.js` | one server plugin registering `tool.hook`, `session.hook`, `permission.hook`, `shell.hook`, and `event.subscribe` | Medium-High | `@opencode/plugin@2.2.6` types |
| `hooks.json` + per-hook Node launchers | `hooks/hooks.json`, `hooks/lib/launch.js` | deleted | Low | n/a |
| Pure rule libraries | `hooks/lib/prose-rules.js`, `injection-rules.js`, `shell-lex.js`, `fsa-paths.js`, `attribution-rules.js`, etc. | port to TypeScript nearly unchanged | Low-Medium | source inspection |
| Marketplace listing | `.claude-plugin/marketplace.json` | npm publish plus an install step that copies agent files; OpenCode has no marketplace registry | Medium | Docs, /build/plugins |

## 2. Skills

Near-direct. OpenCode implements the same Agent Skills format and discovers
`.opencode/skills`, `~/.config/opencode/skills`, and the compatibility roots
`.claude/skills` and `.agents/skills`. Directory-form skills are recommended because the
base directory is passed to the model with a sample of supporting files.

Frontmatter changes:

- `user-invocable: false` becomes `metadata.opencode/autoinvoke: false`. The skill stays
  loadable by ID, which preserves the preload-by-agent behavior the four internal skills
  depend on.
- `allowed-tools` is accepted but not enforced. Tool scoping has to move to the agent's
  `permissions`.
- `argument-hint` has no meaning. Move it into the command wrapper's `description`.
- `name` is a display label only. The skill ID comes from the directory, so keep
  directory and ID aligned.

What does not port: a skill body that says `Bash`, `Read`, `Write`, or `Glob` now points
at OpenCode tools named `bash`, `read`, `write`, and `glob`. Audit skill bodies for
hard-coded Claude tool names, especially the command examples in `skills/do`,
`skills/commit`, `skills/bump`, and `skills/health`.

## 3. Agents and model routing

Each of the 16 agents becomes a Markdown file under `.opencode/agents/`. The body is the
system prompt. Frontmatter carries `description`, `mode: subagent`, `model`, and
`permissions`.

Field mapping:

| Claude Code field | OpenCode field | Note |
|---|---|---|
| `type: agent` | `mode: subagent` | OpenCode has no `type` field |
| `model: haiku\|sonnet\|opus` | `model: provider/model` | Pin a real model ID per agent |
| `effort: low\|medium\|high\|xhigh` | `model: provider/model#variant` | Variant is a free-form `Model.VariantID`; only works if the provider defines it |
| `tools: [...]` | `permissions:` | Emulate an allowlist with a catch-all deny followed by allows |
| `skills: [...]` | none | State the skill in the system prompt, or inject it per session |
| `description` | `description` | Direct |

Tool-name remap:

| Claude tool | OpenCode action or tool | Note |
|---|---|---|
| `Read` | `read` | direct |
| `Grep` | `grep` | direct |
| `Glob` | `glob` | direct |
| `Write`, `Edit`, `MultiEdit` | `edit` | one action covers write/patch |
| `Bash` | `shell` | permission action is `shell`; tool hook name is `bash` |
| `WebSearch` | `websearch` | direct |
| `WebFetch` | `webfetch` | direct |
| `PowerShell` | none | drop |
| `LSP` | none | OpenCode has LSP diagnostics config, not an agent tool; drop |

Allowlist emulation for a read-only agent such as `explore`:

```yaml
permissions:
  - { action: "*", resource: "*", effect: deny }
  - { action: read, resource: "*", effect: allow }
  - { action: grep, resource: "*", effect: allow }
  - { action: glob, resource: "*", effect: allow }
```

Notes that change behavior:

- Agent files are the only way to add an agent. The V2 `AgentEditor` has `update`,
  `remove`, and `default`, but no `add` (`@opencode/plugin@2.2.6`,
  `dist/promise/agent.d.ts`). A published plugin cannot register new agents at runtime.
  The installer must copy agent Markdown into `~/.config/opencode/agents/`, or the repo
  must ship a project `.opencode/agents/` tree.
- There is no `enabledModels` scope. If the routing policy must be enforced, a plugin can
  prune the model list with `ctx.model.transform`, or a permission layer can reject a
  session switch.
- The `do` routing table's "Can Override" column has no direct equivalent. The
  `subagent` tool does not document a model parameter, so a caller cannot repoint an
  agent at runtime the way `/do` does in Claude Code. Either accept the pin or register
  custom commands that switch the model first.

## 4. Hooks and governance

All hooks become one in-process plugin. The rule libraries are pure logic and port to
TypeScript with little change. The Node launchers and `hooks.json` disappear.

Verified hook capabilities:

- `ctx.tool.hook("execute.before", event)` receives `tool`, `sessionID`, `agent`,
  `messageID`, `id`, and mutable `input`. Throwing rejects that call alone.
  Verified: `@opencode/plugin@2.2.6` `dist/promise/tool.d.ts`; comment at
  `dist/promise/adapter.js:492`, "Only execute.before may reject a call".
- `ctx.tool.hook("execute.after", event)` receives the same fields plus either a
  completed result or an error. A completed `result` is mutable.
- `ctx.permission.hook("evaluate", event)` receives `sessionID`, `agent`, `action`,
  `resources`, `metadata`, and `source`, and may set `effect` to `allow`, `ask`, or
  `deny`. Verified: `dist/promise/permission.d.ts`.
- `ctx.shell.hook("create.before", event)` receives `command`, `cwd`, `timeout`, `shell`,
  and `env`, but no session or agent and no reject verdict. Use it for rewriting only.
  Verified: `dist/promise/shell.d.ts`.
- `ctx.session.hook("prompt", event)` can rewrite prompt text and add files or skills.
- `ctx.session.hook("context", event)` can append system instructions on every model
  request. Child sessions run their own agent loop, so the hook should apply there too;
  Phase 0 confirms the ordering.
- `ctx.event.subscribe({ types: [...] })` delivers the public event stream.
  `session.created` data includes `parentID`, `agent`, `model`, and `permissions`;
  `session.tool.called` includes `sessionID`, `assistantMessageID`, `id`, `input`, and
  `executed`. Verified: served OpenAPI schema.

Per-hook mapping:

| Hook | OpenCode mechanism | Notes |
|---|---|---|
| `fsa-write-bar` | `tool.execute.before` on `write`/`edit`/`bash`, throw to reject | path and content rules port directly |
| `prose-gate` | `tool.execute.before` on `write`/`edit`, throw to reject | content is on `event.input` |
| `prose-advisor` | `tool.execute.after` on `write`/`edit` | advisory only, never reject |
| `commit-attribution-guard` | `permission.hook("evaluate")` on `shell`; `shell.create.before` for rewrite | permission hook sees the command string |
| `doc-cli-guard` | `permission.hook("evaluate")` on `shell` | same |
| `sa-mermaid-only` | `permission.hook("evaluate")` on `shell` | same |
| `pr-post-ask` | `permission.hook("evaluate")` on `shell`, set `effect: "ask"` | native ask verdict, no emulation needed |
| `pr-verdict-guard` | `permission.hook("evaluate")` or `tool.execute.before` on `shell` | |
| `injection-filter` | `session.hook("prompt")`, `tool.execute.after` result mutation, `tool.execute.before` on `subagent` input | the Agent-path becomes the `subagent` tool |
| `writing-context` | `event.subscribe` on `session.created` then `ctx.session.instructions.entry.put`; or `session.hook("context")` | the event path injects once per session, including children |
| `fsa-log` | `tool.execute.after` on the `subagent` tool in the parent, plus `session.created`/`execution.*` events | terminal block comes from the subagent tool result |
| `health-check` | plugin `setup` plus a `/health` command | |
| `audit-log` | `tool.execute.after` plus event subscription | append to `audit.jsonl` with `sessionID` and `agent` |
| `data-access-log` | `tool.execute.after` on read/grep/glob/write/edit | |
| `gate-evidence` | `tool.execute.after` on `shell` | success and failure paths |
| `goal-guard` | `tool.execute.after` on `webfetch`/`websearch`/MCP tools | |
| `phi-outbound-guard` | `tool.execute.before` on `webfetch`/`websearch`/`shell` | inspect outbound payload before it leaves |
| `ferpa-disclosure-guard` | `tool.execute.before` on `webfetch`/`websearch`/`shell` | |
| `confirmation-record` | `session.hook("prompt")` | record the confirmation text and session |
| `purpose-capture` | `session.hook("prompt")` | |

Attribution: every tool hook already carries `sessionID` and `agent`, which is stronger
than the Claude Code payload that needed `agent_id` only inside a subagent. The remaining
question is whether those hooks fire for child-session tool calls. Phase 0 answers it.

Preserve these behavioral contracts:

- Fail open unless a gate is deliberately upgraded. The current design is a guardrail,
  not a security boundary (`rules/assist-plugin-rule.md`, Hook Fail-Open Rule). Wrap each
  handler in try/catch that logs and returns without rejecting. Decide gate by gate
  whether audit-critical hooks should fail closed instead, and record the decision.
- Block only on a positive match. `prose-gate` judges only newly added text; never the
  existing file. `injection-filter` rewrites only matched spans and never blocks.
- Keep the self-test and auto-disable path for `injection-filter`.

## 5. Packaging and install

Proposed layout for the ported package:

```text
assisst-marketplace-plugin-opencode/
├── package.json                  # type: module, dependency @opencode/plugin
├── opencode.json                 # plugins, instructions, skills, commands, permissions
├── src/
│   ├── index.ts                  # Plugin.define, setup, cleanup
│   ├── hooks/                    # one module per hook group
│   ├── rules/                    # ported pure rule libraries
│   └── provenance.ts             # audit chain helpers
├── skills/                       # 22 skill directories, converted frontmatter
├── agents/                       # 16 agent Markdown files, converted frontmatter
├── commands/                     # /do, /ask, /debug, /health, ...
├── rules/                        # instructions entries
└── docs/
    ├── porting-plan.md
    └── parity-matrix.md
```

Local development: put the plugin under `.opencode/plugins/assist/index.ts`, or list it in
`plugins` as `"./assisst-marketplace-plugin-opencode"`. Config changes reload without a
restart.

Publishing: npm package with `@opencode/plugin` as a dependency and the server entry in
`exports`. Because agents cannot be registered by a plugin, the package needs an install
step that copies `agents/*.md` into `~/.config/opencode/agents/` or into a project
`.opencode/agents/`. Document that step instead of pretending the plugin is self-contained.

## 6. Risks and gaps

### 6.1 Child-session hooks (main risk, unproven)

The compliance work needs one attribution record per governed event, including events
inside a subagent. OpenCode gives every tool hook a `sessionID` and `agent`, but the docs
do not state whether a server-level hook registered in the parent location also fires for
child-session tool calls. Pi did not, which forced the previous plan to load the gate into
each child session. OpenCode's hooks are registered on the server, not per session, so
they should fire everywhere. Phase 0 must prove it.

If child calls are visible, attribution is direct: `sessionID` identifies the child,
`session.created.parentID` identifies the parent, and `agent` identifies the agent type.
If they are not visible, `fsa-log` and the five-field FR-227 record must be built from
`session.tool.*` events and child session creation events, which is a different code path
with different ordering guarantees.

### 6.2 Agent registration is not programmable

`AgentEditor` has no `add` (`dist/promise/agent.d.ts`). Agents must be files or config.
This constrains packaging and means an "install" command is unavoidable.

### 6.3 Skill preload semantics

Claude Code lets an agent preload a skill through `skills:` frontmatter. OpenCode has no
preload field. The four internal skills (`code`, `run-test`, `pentest`,
`integrated-test`) relied on preload. Options: tell the agent to load the skill first via
its system prompt, inject the skill body through `session.hook("context")` when the agent
is that agent, or accept on-demand loading.

### 6.4 Model override semantics

Per-agent model pins port. Runtime override does not, because the `subagent` tool has no
documented model parameter. The "Can Override: Yes" rows in
`skills/do/references/model-routing.md` lose their mechanism unless `/do` switches the
session model first or a custom command does it.

### 6.5 Enforced tool scoping

OpenCode permissions operate on actions and resources, not on a named tool list.
Emulating `tools: [Read, Grep, Glob]` requires a catch-all deny plus allows, and the
ordering is last-match-wins. Audit every agent's permission list; a wrong order silently
grants access.

### 6.6 In-process trust

Plugins run inside the OpenCode server with read access to prompts, tool calls, files,
and session history. The governance plugin is high-privilege code. Review and sign it,
and treat third-party plugins as part of the trust boundary.

### 6.7 Hook fail-open versus fail-closed

The current hooks fail open by design. OpenCode's permission layer is authoritative once a
rule or hook denies. Decide explicitly per hook, and for the audit and disclosure gates
document any change to fail-closed.

### 6.8 Smaller gaps

- `PowerShell` and the `LSP` tool have no equivalent.
- `allowed-tools` in skills is not enforced.
- The `subagent` tool name and result shape need confirmation in Phase 0.
- Model variant names depend on the provider; `#high` is not universal.

## 7. Phased roadmap

### Phase 0: compatibility spike (0.5 to 1 day)

Build a throwaway plugin that:

1. Registers `tool.execute.before` and logs `tool`, `sessionID`, `agent`. Run a parent
   agent, launch a subagent, and run a tool inside it. Confirm the child call appears with
   a distinct `sessionID` and the child `agent`.
2. Throws `new Tool.Error({ message })` from `execute.before` on `write` with forbidden
   content. Confirm the file is not written and the model sees the reason.
3. Subscribes to `session.created`. Confirm child sessions carry `parentID` and the agent
   ID, and confirm which event marks child completion.
4. Confirms the `subagent` tool name and the shape of its `execute.after` result, including
   whether the child's final message is present.
5. Confirms a command template containing `@do` loads the skill, and that a plugin command
   can set `prompt.skills`.
6. Confirms `permission.hook("evaluate")` fires for `shell` with the full command string
   and can return `ask` and `deny`.

Stop and redesign section 4 if items 1 or 4 fail.

### Phase 1: skills and commands (1 to 2 days)

Convert frontmatter, fix tool names in prose, add `autoinvoke: false` to the four internal
skills, and add command wrappers. Verify all 22 skills appear with
`ctx.skill.list()`.

### Phase 2: agents (1 to 2 days)

Convert the 16 agents, pin models, translate tools to permission lists, and decide the
skill-preload strategy. Verify each agent launches and that a read-only agent cannot edit.

### Phase 3: hooks (3 to 5 days)

Port the rule libraries first, then register handlers group by group. Keep fail-open
try/catch. Verify each gate blocks and allows the same cases as the current hook tests.

### Phase 4: governance and audit (2 to 4 days, depends on Phase 0)

Wire the attribution record, port `fsa-log` against the subagent tool result, add the audit
chain and export scripts, and run the compliance scenarios from
`docs/requirements/FR-NFR-harness-governance.md`.

### Phase 5: packaging and parity matrix (1 day)

Publishable package, install step for agents, `opencode.json` defaults, parity matrix, and
a migration note for users of the Claude Code plugin.

## 8. Definition of done

- All 22 skills load and the four internal skills stay hidden from model invocation.
- 16 agents launch with the intended model pins and cannot exceed their permission sets.
- `/do` completes a requirements to task-plan flow end to end.
- Every ported hook has a test that proves both the block and the allow path.
- A subagent tool call produces an attribution record with session, agent, operation, and
  timestamp, and the terminal block is logged.
- The package installs into a clean OpenCode profile with one documented command.

## Sources

OpenCode V2 docs:

- Plugins: https://opencode.ai/docs/build/plugins
- Server plugins and hooks: https://opencode.ai/docs/build/plugins/server
- Agents: https://opencode.ai/docs/agents
- Skills: https://opencode.ai/docs/skills
- Commands: https://opencode.ai/docs/commands
- Permissions: https://opencode.ai/docs/permissions

Local type evidence:

- `@opencode/plugin@2.2.6`: `dist/promise/tool.d.ts`, `dist/promise/permission.d.ts`,
  `dist/promise/shell.d.ts`, `dist/promise/agent.d.ts`, `dist/promise/adapter.js:492`
- `@opencode/schema@2.2.6`: `dist/agent.d.ts`, `dist/skill.d.ts`
- Served OpenAPI: `components.schemas["session.created"]`,
  `components.schemas["session.tool.called"]`
- Installed CLI: `opencode v2.2.6`
