# Phase 2: agents

Status: done.

## Scope

- Convert 16 agent Markdown files to `.opencode/agents/`, then merge `reviewer` and `code-reviewer` into 15.
- Remove `type: agent`; set `mode: subagent`.
- Map model tiers to concrete `provider/model` pins.
- Map `tools:` to ordered `permissions:` rules.
- Replace `skills:` preload with an explicit instruction in the agent body.
- Drop `PowerShell` and `LSP`, which have no OpenCode tool equivalent.

## Model mapping

| Role | Pin |
|---|---|
| Main and `general` | `opencode-go/deepseek-v4.1-flash` |
| Scouting (`explore`) | `opencode-go/deepseek-v4.1-flash#low` |
| Implementation (`developer`, `worker`, `researcher`, `general-purpose`) | `opencode-go/deepseek-v4.1-flash` |
| Conversational (`ask`, `intake-reviewer`, `requirements-gatherer`) | `opencode-go/deepseek-v4.1-flash#low` |
| Planning (`planner`, `task-planner`, `devops`) | `opencode-go/glm-5.3-flash` |
| Verification (`qa`, `developer-tester`) | `opencode-go/glm-5.3-flash#low` |
| Review (`reviewer`, `solutions-architect`) | `opencode-go/gpt-6-luna` |

## Tool mapping

| Claude | OpenCode permission |
|---|---|
| Read | `read` |
| Grep | `grep` |
| Glob | `glob` |
| Write, Edit, MultiEdit | `edit` |
| Bash | `shell` |
| WebSearch | `websearch` |
| WebFetch | `webfetch` |

An allowlist is a catch-all deny followed by explicit allows.

## Tasks

- [ ] Generate the 16 files.
- [ ] Verify each agent appears in `opencode debug agents`.
- [ ] Verify a read-only agent cannot edit.
- [ ] Verify a subagent launched from `build` carries the agent ID into hooks.

## Verification

1. `opencode debug agents` lists all 16 assist agents.
2. `opencode run --agent explore` can read but a write is denied.
3. The Phase 0 plugin log shows `agent` equal to the agent ID for a child call.

## Notes

OpenCode cannot register agents from a plugin. The Markdown files are the only mechanism,
so the installer must copy this directory.

## Result

- 16 agent files written and listed by `opencode debug agents`.
- The cheap-routing refactor uses only `deepseek-v4.1-flash`, `glm-5.3-flash`, and
  `gpt-6-luna`.
- `reviewer` and `code-reviewer` were merged, so the port has 15 agents.
- `general-purpose` is hidden from the subagent listing.
- Every agent has the Handback Rules section at the end of its prompt.
- Each agent has a catch-all deny followed by explicit allows.
