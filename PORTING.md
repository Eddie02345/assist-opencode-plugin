# OpenCode V2 port changes

Base: assist-marketplace-plugin v1.13.1, commit `7604417`.
Port date: 2026-11-09.

## Added

- `src/` OpenCode plugin adapter and hook registration.
- `.opencode/agents/` 15 OpenCode agents. `reviewer` and `code-reviewer` are merged.
- `.opencode/skills/` 22 skills with OpenCode frontmatter.
- `.opencode/commands/` 20 command wrappers and health/audit commands.
- `.opencode/plugins/assist/` local plugin entry.
- `opencode.json`, `package.json`, `config/`, `scripts/`, `test/`.
- `docs/porting-plan.md`, `docs/phases/`, `docs/parity-matrix.md`,
  `docs/fallbacks.md`, `docs/cache-prefix.md`.

## Changed from upstream

- `plugins/assist-plugin/package.json` added with `"type": "commonjs"` so the vendored
  hook modules load from the ESM root package.
- `plugins/assist-plugin/rules/writing-standard-compact.md` has an appended
  Orchestrator routing section. No dates, cwd, counters, or per-request data.
- `tests/package.json` added with `"type": "commonjs"` so the original tests run under
  the ESM root package.
- Root `README.md` replaced with the OpenCode port README. The upstream README is
  `README.upstream.md`.
- Model routing uses `deepseek-v4.1-flash`, `glm-5.3-flash`, and `gpt-6-luna`.
- The OpenCode hook layer adds fail-closed payload handling, a dispatch gate, a block
  loop breaker, tool-output truncation, and a retry fallback.

## Unchanged

- `LICENSE` and `NOTICE`.
- The original hook implementations and rule libraries under
  `plugins/assist-plugin/hooks/`, except for the added CommonJS package marker.
- The original hook regression suite under `tests/`, except for the added CommonJS
  package marker.
- `CHANGELOG.md`, `DECISIONS.md`, `MARKETPLACE.md`, `CLAUDE.md`, and `specs/`.
