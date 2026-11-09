# Port phases

Status is updated as each phase is executed. Every phase has its own file with scope,
tasks, and the exact verification run.

| Phase | File | Status | Verification |
|---|---|---|---|
| 0 | `00-spike.md` | Done | Live OpenCode run against a throwaway plugin |
| 1 | `01-skills-commands.md` | Done | `ctx.skill.list()`, live skill load |
| 2 | `02-agents.md` | Done | `opencode debug agents`, live subagent run |
| 3 | `03-hooks.md` | Done | Vendored hook suite plus adapter tests |
| 4 | `04-governance.md` | Done | Attribution and audit log assertions |
| 5 | `05-packaging.md` | Done | Clean install and smoke run |

Environment used for verification: OpenCode `v2.2.6`, Node `v26.8.1`, Linux.
