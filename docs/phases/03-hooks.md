# Phase 3: hooks

Status: done.

## Scope

- Vendor the original hook implementations and rule libraries under
  `plugins/assist-plugin/` unchanged so the original regression suite still runs.
- Add `src/adapter.ts`, which maps OpenCode events to the Claude-shaped input the legacy
  `evaluate(input, options)` functions expect.
- Add `src/hooks.ts`, which registers the 20 hooks on the OpenCode plugin API.
- Keep fail-open behavior with a per-hook try/catch, except where `guardedClass` says the
  hook must fail closed.

## Mapping

| Legacy hook | OpenCode registration | Action |
|---|---|---|
| `fsa-write-bar` | `tool.execute.before` | throw on deny |
| `prose-gate` | `tool.execute.before` | throw on deny |
| `prose-advisor` | `tool.execute.after` | log additional context |
| `commit-attribution-guard` | `permission.evaluate` (shell) | deny or ask |
| `doc-cli-guard` | `permission.evaluate` (shell) | deny or ask |
| `sa-mermaid-only` | `permission.evaluate` (shell) | deny or ask |
| `pr-post-ask` | `permission.evaluate` (shell) | ask |
| `pr-verdict-guard` | `permission.evaluate` (shell) | deny |
| `phi-outbound-guard` | `tool.execute.before` | throw on deny |
| `ferpa-disclosure-guard` | `tool.execute.before` | throw on deny |
| `injection-filter` | `prompt`, `execute.before`, `execute.after` | rewrite |
| `writing-context` | `session.created` + `context` | inject once |
| `fsa-log` | `execute.after` on `subagent` | append record |
| `audit-log` | `execute.after` | append record |
| `data-access-log` | `execute.before` | append record |
| `gate-evidence` | `execute.after` | append record |
| `goal-guard` | `execute.after` | log warning |
| `confirmation-record` | `prompt` | append record |
| `purpose-capture` | `prompt` | append record |
| `health-check` | `/assist-health` command | run self-test |

## Tasks

- [ ] Write the adapter and its unit tests.
- [ ] Register the hooks in one plugin entry.
- [ ] Preserve fail-open and fail-closed behavior.
- [ ] Run the vendored 2431-test suite.
- [ ] Run adapter tests.
- [ ] Live-test three gates: prose, write bar, injection.

## Verification

1. `node --test tests/hooks/` stays green.
2. `node --test test/` is green.
3. A live run blocks an em dash write and a protected-path write.
4. A live run allows the same write after the offending text is removed.

## Notes

The legacy modules are CommonJS. `plugins/assist-plugin/package.json` sets
`"type": "commonjs"` so the root package can stay ESM.

## Result

- All 20 hooks registered through one plugin.
- 21 adapter and integration tests pass.
- The vendored suite passes: 2431 passed, 0 failed, 3 skipped.
- Live checks: prose gate denied an em-dash write; the write bar denied a subagent
  write to `DECISIONS.md`.
