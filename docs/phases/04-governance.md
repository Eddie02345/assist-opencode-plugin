# Phase 4: governance

Status: done.

## Scope

- Verify attribution on every governed event: session, agent, operation, path, timestamp.
- Confirm the audit chain writes under `<project>/.agent/logs/governance/`.
- Confirm the subagent report log receives the terminal block from the child result.
- Wire the purpose and confirmation records to the prompt hook.
- Document which gates fail open and which fail closed.

## Tasks

- [ ] Add an attribution test using a child-session event.
- [ ] Assert `audit.jsonl` contains the five fields.
- [ ] Assert `fsa-log.jsonl` contains the child agent and report.
- [ ] Assert a blocked write is not recorded as a successful access.
- [ ] Document the fail-open matrix.

## Verification

1. A live subagent run writes one audit record with `agent_type`, `agent_id`,
   `operation`, `path`, and `ts`.
2. The same run writes one `fsa-log.jsonl` record with the child's report.
3. `scripts/verify-audit-chain.js` passes on the produced log.
4. A denied write produces no success record.

## Notes

This phase depends on Phase 0 item 1. If child tool calls were invisible, this phase
would need a redesign. They are visible, so the design stands.

## Result

- `audit.jsonl` records carry `ts`, `operation`, `path`, `data_class`, `agent_type`,
  `agent_id`, `authorizer`, and `prev`.
- `fsa-log.jsonl` records carry the child `agent_id`, `state`, `error_class`, and trace.
- `scripts/verify-audit-chain.js` reported "Audit chain intact: 17 lines verified across
  1 segment."
- A blocked write produced no success record.
