# Model Routing

> OpenCode pins models in `.opencode/agents/*.md`. This file mirrors the current pins.
> Do not override them at dispatch time; the OpenCode `subagent` tool has no per-call model parameter.

| Agent | Model | Role |
|---|---|---|
| orchestrator (`do`) | `opencode-go/qwen3.7-plus` | main session |
| `developer` | `opencode-go/deepseek-v4.1-flash` | implementation |
| `worker` | `opencode-go/deepseek-v4.1-flash` | implementation |
| `researcher` | `opencode-go/deepseek-v4.1-flash` | implementation and research |
| `general-purpose` | `opencode-go/deepseek-v4.1-flash` | generalist fallback |
| `explore` | `opencode-go/deepseek-v4.1-flash#low` | scouting |
| `ask` | `opencode-go/deepseek-v4.1-flash#low` | questions and triage |
| `intake-reviewer` | `opencode-go/deepseek-v4.1-flash#low` | intake |
| `requirements-gatherer` | `opencode-go/deepseek-v4.1-flash#low` | requirements |
| `planner` | `opencode-go/glm-5.3-flash` | planning |
| `task-planner` | `opencode-go/glm-5.3-flash` | task plans |
| `devops` | `opencode-go/glm-5.3-flash` | operations |
| `solutions-architect` | `opencode-go/glm-5.3-flash` | architecture |
| `developer-tester` | `opencode-go/glm-5.3-flash#low` | acceptance tests and test runs |
| `qa` | `opencode-go/deepseek-v4-pro` | Testing Gate |
| `code-reviewer` | `opencode-go/deepseek-v4-pro` | code diffs, logic bugs, implementation checks |
| `reviewer` | `opencode-go/gpt-6-luna` | final PR acceptance, specification compliance, high-level sign-off |

## Review split

- `code-reviewer` handles Pre-Test Code Review, Security, and OWASP for LLM gates.
- `reviewer` handles Planning Document Review, Code Review sign-off, final PR acceptance, and specification compliance.
- `qa` handles the Testing Gate only.
