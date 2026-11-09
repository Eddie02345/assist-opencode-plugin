# Phase 5: packaging and parity

Status: done.

## Scope

- Publishable `package.json` with `@opencode/plugin` as a dependency.
- Local entry at `.opencode/plugins/assist/index.ts`.
- Installer that copies `.opencode/agents`, `.opencode/skills`, and `.opencode/commands`
  into a user's OpenCode config.
- Parity matrix for all 22 skills, 15 agents, and 20 hooks.
- README with install, configure, and test instructions.

## Tasks

- [ ] Add `package.json` exports and scripts.
- [ ] Add `scripts/install.mjs`.
- [ ] Add `test/` smoke tests.
- [ ] Write `docs/parity-matrix.md`.
- [ ] Write `README.md`.
- [ ] Run a clean install into a temp HOME and start OpenCode.

## Verification

1. `npm pack --dry-run` includes the plugin, skills, agents, commands, and docs.
2. `node scripts/install.mjs --target <tmp>` copies the expected files.
3. OpenCode starts with the installed config and lists the assist agents.
4. The parity matrix has no unexplained gaps.

## Notes

OpenCode has no marketplace registry. Distribution is npm plus the installer, or a
project tree committed under `.opencode/`.

## Result

- Installer copied the plugin, vendored hooks, 15 agents, 22 skills, and 20 commands to a
  temp target.
- The generated plugin entry imports `../../assist/src/index.ts`, which is the correct path
  from `<target>/plugins/assist` to `<target>/assist/src`.
- `opencode.json` got `./plugins/assist` in its `plugins` array.
- README and parity matrix written.
- The installer now prompts for a default model, suggests `deepseek/deepseek-flash` and
  `opencode-go/muse-spark-1.3-contributor`, and can apply the choice to all agents.
- Global install verified from `/tmp` and from a separate project: 15 agents, 25 skills
  (22 assist plus 3 existing), 23 commands (20 assist plus 3 existing), and the plugin
  loaded from `~/.config/opencode/plugins/assist`.
- `/assist-audit` and `/assist-health` call the plugin tools `assist_audit` and
  `assist_health`, avoiding shell path assumptions.
