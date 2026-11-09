# OpenCode V2 port changes

Base: assist-marketplace-plugin v1.13.1, commit `7604417`.
Port date: 2026-11-09.

## Added

- `src/` OpenCode plugin adapter and hook registration.
- `.opencode/agents/` 16 OpenCode agents. `code-reviewer` is restored for critical sign-off.
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
- Model routing uses `qwen3.7-plus` for the main orchestrator, `deepseek-v4.1-flash`, `glm-5.3-flash`, `gpt-6-luna`, and `deepseek-v4-pro` for `code-reviewer` and `qa`.
- The OpenCode hook layer adds fail-closed payload handling, a dispatch gate, a block
  loop breaker, tool-output truncation, and a retry fallback.

## Unchanged

- `LICENSE` and `NOTICE`.
- The original hook implementations and rule libraries under
  `plugins/assist-plugin/hooks/`, except for the added CommonJS package marker.
- The original hook regression suite under `tests/`, except for the added CommonJS
  package marker.
- `CHANGELOG.md`, `DECISIONS.md`, `MARKETPLACE.md`, `CLAUDE.md`, and `specs/`.

## Delegation

Outside `/do`, the main `build` agent edits files directly. The global orchestration
mandate is not in the global `AGENTS.md`.

The `/do` skill carries the scoped mandate: delegate implementation to `@developer` and
testing to `@developer-tester`. It also forbids shell redirects for implementation and
test files during `/do`; `/do` keeps its own plan and `DECISIONS.md` writes.

Child write-capable agents keep `edit`, `write`, and `shell` allows.

## Review gates

`/do` uses `code-reviewer` (`deepseek-v4-pro`) for code diffs, logic bugs, implementation
checks, Pre-Test, Security, and OWASP for LLM. It uses `reviewer` (`gpt-6-luna`) for final
PR acceptance, specification compliance, Planning Document Review, and Code Review
sign-off. The global orchestration mandate uses the same triggers.

The global mandate also forbids shell redirects and heredocs for file writes. The
`shell` permission remains allowed for `build`, so that boundary is instruction-level.
