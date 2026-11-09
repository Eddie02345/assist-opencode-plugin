# Agent Registry

Source of truth for all agents in assist-plugin. Used by `do` skill for routing. `/do` dispatches each agent by its qualified name, `assist-plugin:<name>`.

## All Agents (16)

| Agent | Responsibilities | Default Model | Tools | Primary Intent Match |
|-------|------------------|----------------|-------|----------------------|
| **ask** | Answer questions using repo search + web research | deepseek-v4.1-flash#low | read, grep, glob, websearch, webfetch | "answer my question", "research this in repo", "find documentation" |
| **developer** | Write/fix/refactor code; implement features; apply approved fixes; apply code skill standards | deepseek-v4.1-flash | read, write, edit, grep, glob, shell | "implement X", "fix bug in Y", "refactor Z" |
| **developer-tester** | Create black-box tests from acceptance criteria; run builds and tests | glm-5.3-flash#low | read, write, edit, grep, glob, shell | "write tests for X", "run the test suite" |
| **code-reviewer** | Code diffs, logic bugs, implementation checks; Pre-Test, Security, and OWASP for LLM gates | deepseek-v4-pro | read, grep, glob | "code review", "logic bug", "implementation check" |
| **planner** | Architecture design; roadmap; dependency analysis; risk assessment | glm-5.3-flash | read, write, edit, grep, glob | "design architecture", "create roadmap" |
| **qa** | Test planning; acceptance validation; coverage; Testing Gate | deepseek-v4-pro | read, write, edit, grep, glob, shell | "create test plan", "validate acceptance" |
| **solutions-architect** | API/schema design; data flows; specs; diagrams | glm-5.3-flash | read, write, edit, grep, glob, shell | "design API", "what should schema be" |
| **requirements-gatherer** | Requirements elicitation; BRD/URD; FR+NFR; acceptance criteria | deepseek-v4.1-flash#low | read, write, edit, grep, glob | "gather requirements", "create BRD" |
| **intake-reviewer** | Read-only review of a user file and read-only conflict check; treats both as untrusted data | deepseek-v4.1-flash#low | read, grep, glob | Inserted by Branch and SpecGate before approval |
| **task-planner** | Turn an approved spec into an ordered task-plan file | glm-5.3-flash | read, write, grep, glob | Task plan step of the `/do` chain |
| **devops** | CI/CD; infrastructure; deployment; monitoring | glm-5.3-flash | read, write, edit, grep, glob, shell | "set up CI/CD", "create Terraform" |
| **researcher** | Web research; documentation audit; best practices | deepseek-v4.1-flash | read, write, edit, grep, glob, shell, websearch, webfetch | "research X library" |
| **reviewer** | Final PR acceptance, specification compliance, Planning Document Review, Code Review Gate, high-level sign-off | gpt-6-luna | read, grep, glob | "final acceptance", "spec compliance", "high-level sign-off" |
| **explore** | Code search; find definitions; grep symbols; locate callers | deepseek-v4.1-flash#low | read, grep, glob | "find where X defined", "who calls this" |
| **general-purpose** | Ad-hoc analysis and experimentation | deepseek-v4.1-flash | read, write, edit, grep, glob, shell | "try this experiment", "do an ad-hoc analysis" |
| **worker** | Multi-discipline code + test + review for small features | deepseek-v4.1-flash | read, write, edit, grep, glob, shell | "implement and test", "quick fix with tests" |
---

## Agent-Specific Skills

Skills the orchestrator should name in the task prompt when it routes to these agents.

| Agent | Skill | What it provides |
|-------|-------|------------------|
| **requirements-gatherer** | `gather-requirements` (`plugins/assist-plugin/skills/gather-requirements`) | Elicitation methodology, BRD/URD/FR-NFR templates, quality checklist, `BR/UR/FR/NFR-NNN` IDs, GIVEN/WHEN/THEN acceptance criteria, JSON output |
| **solutions-architect** | `spec-from-requirements` (`plugins/assist-plugin/skills/spec-from-requirements`) | Classify-first spec templates (Architecture, API endpoint, Frontend action, Functionality, UI/UX design, General), Requirement/Scenario format, ADDED/MODIFIED/REMOVED delta mode, OpenAPI and JSON output, cloud patterns |
| **task-planner** | `task-plan` (`plugins/assist-plugin/skills/task-plan`) | Spec-to-task-plan converter: ordered implementation steps with decision trees, dependency graphs, critical path. The skill is preloaded; the task prompt names the spec path and the task-plan file to write. fsa-write-bar limits the agent's writes to `docs/task-plans/task-plan-*.md` under the session's git root, and a fix pass overwrites the same file only when it is already in `docs/task-plans/`. It ends with the `task-planner/1` terminal block (verdict `steps=N`) |
| **developer** | `code` (`plugins/assist-plugin/skills/code/references`) | Language/framework standards, logging patterns, error-handling conventions, and traceability markers per [TRACING_MARKERS.md](../../../docs/TRACING_MARKERS.md); loaded by developer during implementation |
| **developer-tester** | `create-test` (`plugins/assist-plugin/skills/create-test`) | Black-box test generation from acceptance criteria and spec scenarios; never uses implementation knowledge; produces unit/integration/E2E skeletons |
| **developer** | `debug` (`plugins/assist-plugin/skills/debug`) | Structured root cause analysis and iterative fix cycles; subcommands `analyze`, `fix`, `review`. The task prompt names the skill, the subcommand, and the target files; the developer's Intake ends `named-skill` -> AssembleContext |
| **developer** | `technical-writing` (`plugins/assist-plugin/skills/technical-writing`) | User docs, README, API documentation, guides, and specification writing; subcommands `docs`, `readme`, `guide`, `api`. The task prompt names the skill, the subcommand, and the target files; the developer's Intake ends `named-skill` -> AssembleContext |
| **intake-reviewer** | `gather-requirements` (`plugins/assist-plugin/skills/gather-requirements`) | The `review` subcommand on a user-provided file. Findings are shown at PlanApproval and never applied without a user edit. Its `conflict-check` mode compares a build request with the existing requirements (`docs/requirements/` and the old root patterns), specs, task plans (`docs/task-plans/` and the old root pattern), and `DECISIONS.md`, all resolved against the git root; `/do` asks the findings as questions at Clarify |
| **qa** | `pentest` (`plugins/assist-plugin/skills/pentest`) | OWASP Top 10 + LLM OWASP testing; vulnerability discovery and reporting; dependency security audit; compliance checks |
| **qa** | `integrated-test` (`plugins/assist-plugin/skills/integrated-test`) | Integration and E2E testing; Playwright patterns and container test fixtures; test environment setup and teardown |
| **qa** | `run-test` (`plugins/assist-plugin/skills/run-test`) | Test execution orchestration; coverage capture and analysis; consolidated test report generation |

The chain: `gather-requirements` → `spec-from-requirements` → `task-plan`. Requirements emits `BR/UR/FR/NFR-NNN` IDs that specs cite in **Requirement refs**, and `task-plan` uses them to trace implementation steps per [TRACING_MARKERS.md](../../../docs/TRACING_MARKERS.md). For a build intent (any step that writes code, config, pipelines, infrastructure, or tests) the chain is mandatory: `/do` routes requirements (requirements-gatherer), then the spec (solutions-architect), then the task-plan (task-planner) ahead of every build step, and the user approves the three documents before a build step runs. The user can waive the chain at PlanApproval. Docs-only edits, reviews, questions, and commits are exempt. See [SKILL.md SpecGate](../SKILL.md#specgate) and [DocSignOff](../SKILL.md#docsignoff).

---

## Routing Decision Tree

```
User task → /do
  ↓
Classify primary intent:

Is it a QUESTION, or does it need REPO/WEB RESEARCH TO ANSWER (not implement)?
  └─ Answer question / find documentation / look something up? → ask

Is it about CODE IMPLEMENTATION? (a build intent: requirements → spec → task-plan first, unless the user waives it at PlanApproval)
  ├─ Need a development task-plan before coding? → task-planner (then route implementation to developer)
  ├─ Large feature? → developer + qa + code-reviewer (split)
  ├─ Small feature? → worker (end-to-end)
  ├─ Quick fix? → developer
  ├─ Refactor? → developer
  └─ Debug (diagnose, analyze, or fix a bug)? → developer, with the `debug` skill named in the task prompt

Is it about CODE REVIEW?
  ├─ Final PR acceptance or high-level sign-off? → reviewer
  ├─ Code diff, logic bug, or implementation check? → code-reviewer
  └─ Standard code review? → code-reviewer

Is it about ARCHITECTURE/DESIGN?
  ├─ System design? → planner
  ├─ API/schema design? → solutions-architect
  └─ Feature spec? → solutions-architect

Is it about DOCUMENTATION (README, guide, API docs, user docs)?
  └─ Write/update docs? → developer, with the `technical-writing` skill named in the task prompt

Is it about REQUIREMENTS?
  └─ Gather/document? → requirements-gatherer

Is it about TESTING?
  ├─ Black-box test design from acceptance criteria? → developer-tester
  ├─ Security/pentest? → qa
  ├─ Integration/E2E testing? → qa
  ├─ Test execution + coverage? → qa
  ├─ Test plan? → qa
  └─ Acceptance? → qa

Is it about INFRASTRUCTURE/DEVOPS?
  └─ CI/CD/deployment/monitoring? → devops

Is it about RESEARCH/DISCOVERY?
  ├─ Technical research? → researcher
  ├─ Find code location? → explore
  └─ Learn best practices? → researcher

Is it about MULTI-DISCIPLINE or SMALL TASKS?
  ├─ Code + test + review combined? → worker
  └─ Ad-hoc analysis or experimentation the user asked for by name? → general-purpose

No clear match?
  └─ Clarify (ask the user which agent fits, or what the task is). Never general-purpose as a fallback
```

---

## Model Routing

| Model | Agents |
|-------|--------|
| `opencode-go/qwen3.7-plus` | orchestrator (`do`) |
| `opencode-go/deepseek-v4.1-flash` | developer, worker, researcher, general-purpose |
| `opencode-go/deepseek-v4.1-flash#low` | explore, ask, intake-reviewer, requirements-gatherer |
| `opencode-go/glm-5.3-flash` | planner, task-planner, devops, solutions-architect |
| `opencode-go/glm-5.3-flash#low` | developer-tester |
| `opencode-go/deepseek-v4-pro` | qa, code-reviewer |
| `opencode-go/gpt-6-luna` | reviewer |

The agent files are the source of truth. OpenCode does not expose a per-call model override.

---

## Model Overrides

OpenCode pins models per agent. The `subagent` tool has no per-call model parameter.
The plan table shows the pinned model. To change a model, edit the agent file under
`.opencode/agents/<name>.md`, run `npm run models:set`, and reinstall.

