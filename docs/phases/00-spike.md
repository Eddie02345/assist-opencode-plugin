# Phase 0: compatibility spike

Status: done.

## Purpose

Prove the four assumptions the port depends on before writing any production code:

1. A server-level tool hook fires for tool calls inside a subagent child session.
2. A throw can reject a tool call and prevent the side effect.
3. The tool input shapes match what the legacy hook logic expects.
4. Subagent completion exposes the child's final message.

## Method

Throwaway project at `/tmp/opencode/oc-spike` with one plugin and one child agent.
One live run used `opencode-go/beam-free` with `--auto`.

The plugin logged `execute.before`, `execute.after`, `prompt`, `context`,
`permission.evaluate`, `shell.create.before`, and selected `session.*` events.

## Results

| Assumption | Result | Evidence |
|---|---|---|
| Child-session tool hooks | Confirmed | Child write fired with `sessionID` `ses_e402cd...` and `agent` `spike-child` |
| Blocking | Confirmed | `write` with `BLOCK_ME` threw; file was not created; model saw the reason |
| `write` input | Confirmed | `{ path, content }` |
| `edit` input | Confirmed | `{ path, oldString, newString }` |
| `read` input | Confirmed | `{ path }` |
| `shell` input | Confirmed | `{ command }` |
| `grep` input | Confirmed | `{ pattern, path }` |
| `glob` input | Confirmed | `{ pattern, path }` |
| `webfetch` input | Confirmed | `{ url }` |
| `skill` input | Confirmed | `{ id }` |
| `subagent` input | Confirmed | `{ agent, description, prompt }` |
| Subagent result | Confirmed | `result.output = { sessionID, status, output }`, child text in `output.output` |
| Prompt hook shape | Confirmed | `{ sessionID, messageID, prompt: { text, files }, delivery }` |
| Permission resources | Confirmed | read/edit: relative path; shell: command string; webfetch: URL; skill: ID |
| Child session event | Confirmed | `session.created` carries `parentID`, `agent`, `model` |
| `execute.before` rejection | Confirmed | Rejects that call only, model continues |

## Consequences for the port

- The governance gate can stay server-level. No per-agent extension injection is needed.
- Attribution can use `sessionID` plus `agent`; child sessions are identified by
  `parentID` from `session.created`.
- The adapter must translate `path` to `file_path` and `oldString`/`newString` to
  `old_string`/`new_string` for the legacy rule libraries.
- `fsa-log` can read the child's final message from the parent's `subagent`
  `execute.after` result.

## Artifacts

The spike is disposable. Its findings are encoded in `src/adapter.ts` and in the tests
under `test/`.
