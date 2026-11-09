# Phase 1: skills and commands

Status: done.

## Scope

- Copy the 22 skills into `.opencode/skills/`.
- Convert frontmatter:
  - `user-invocable: false` -> `metadata.opencode/autoinvoke: false`
  - drop `argument-hint` from the skill and put it in the command
  - keep `allowed-tools` as documentation; it is not enforced by OpenCode
- Create `.opencode/commands/<id>.md` wrappers for user-invocable skills. The body is
  `@<skill-id> $ARGUMENTS`.
- Keep the four internal skills hidden from model invocation.

## Tasks

- [ ] Copy skill directories with supporting files.
- [ ] Convert the 22 `SKILL.md` frontmatter blocks.
- [ ] Audit skill prose for Claude tool names (`Read`, `Write`, `Edit`, `Bash`, `Glob`).
- [ ] Add command wrappers for user-invocable skills.
- [ ] Verify all skill IDs load.

## Verification

1. `ctx.skill.list()` returns 22 IDs.
2. The four internal skills have `autoinvoke: false`.
3. A live run loads `spike-skill` through `@spike-skill`.
4. `opencode` starts in the port directory without skill warnings.

## Notes

The skill ID is path-derived. Keep directory names lowercase kebab-case and identical to
the intended ID.

## Result

- 22 skills loaded; `autoinvoke` is false for `code`, `integrated-test`, `pentest`, `run-test`.
- 20 static command files: 18 skill wrappers plus `/assist-health` and `/assist-audit`.
- Tool references were converted in backticked names, `X tool`, `X command`, and tool lists.
- `ctx.skill.list()` returned the 22 assist skills beside the built-ins.
