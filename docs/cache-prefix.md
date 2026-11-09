# Cache prefix hashes

Captured with `opencode debug agents` before and after the cheap-routing change.
The hash is the first 16 hex characters of SHA-256 over each agent's `system` string.

| Agent | Before | After | Result |
|---|---|---|---|
| ask | `dfa0119af45d792c` | `dfa0119af45d792c` | same |
| developer | `b2ae0c6dbbe26cfe` | `b2ae0c6dbbe26cfe` | same |
| developer-tester | `81e91fcbce977628` | `81e91fcbce977628` | same |
| devops | `ebb85674523eff8f` | `ebb85674523eff8f` | same |
| explore | `a67177d1b0851c21` | `a67177d1b0851c21` | same |
| general-purpose | `b6c41bb5f93cd441` | `b6c41bb5f93cd441` | same |
| intake-reviewer | `ca1e53c6165c02fa` | `ca1e53c6165c02fa` | same |
| planner | `6ff6e5d4c542e4f0` | `6ff6e5d4c542e4f0` | same |
| qa | `522cdcb77b492327` | `522cdcb77b492327` | same |
| requirements-gatherer | `43434b749a721a25` | `43434b749a721a25` | same |
| researcher | `078fbb1d5fa023b4` | `078fbb1d5fa023b4` | same |
| reviewer | `eeb56e8780dc7562` | `5cc0810f32d84876` | changed by the merge |
| solutions-architect | `56e818caec85a0df` | `56e818caec85a0df` | same |
| task-planner | `e069f109c2773afa` | `e069f109c2773afa` | same |
| worker | `d57ee5d4289f64c4` | `d57ee5d4289f64c4` | same |
| code-reviewer | `c453e424437c8e9b` | removed | merged into reviewer |

Static instructions file `plugins/assist-plugin/rules/writing-standard-compact.md`:

- before: `b484bf19eb930a7967542671af28d83a520cb16baa4a23def5faf8d6151c587b`
- after: `3e673afa13f7e31f439858abac2316a3853f491a4933f5acca6bdc6176cf64ea`

The change is the appended Orchestrator routing section.

No agent system prompt contains a date, cwd, git status, or counter. The check covered
16 subagent prompts and found no match for date, `/home/Eddie`, `/tmp/opencode`, `git
status`, `git branch`, or `counter`.
