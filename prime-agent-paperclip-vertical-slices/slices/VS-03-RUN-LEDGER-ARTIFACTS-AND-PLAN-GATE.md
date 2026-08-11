# VS-03 — Add a Durable Run Ledger, Typed Artifacts, and the Plan → Build Gate

## Slice status

```text
Prerequisites: VS-02 complete
Core Prime changes: none
Package changes: yes
Primary proof: lifecycle state survives restart and cannot advance from planning to building without host-validated Engineering Manager approval and required artifacts
```

## 1. Observable outcome

The operator can run:

```python
run = await paperclip_factory.create_run(
    objective="Add a project-local staging environment",
    entry_mode="brownfield",
    entry_state="planning",
)
assignment = await paperclip_factory.assign_engineering_manager(run.run_id)
```

After the role submits a plan, the operator can run:

```python
evaluation = await paperclip_factory.evaluate_gate(
    run.run_id,
    gate_id="plan-to-build",
)
```

The gate remains blocked until all of the following are true:

- an accepted `engineering-plan` artifact exists;
- an accepted `build-queue` artifact exists;
- a valid `prime.gate-decision/v1` from `paperclip/role/engineering-manager` says `approve`;
- all records reference the same run and assignment;
- the run is currently in `planning`;
- the decision has not been superseded or rejected by a later valid decision.

Only host code appends the transition event. The model does not edit the run projection directly.

## 2. User story

> As the factory owner, I can resume a planning run after Prime restarts and trust that “ready to build” means required evidence and the correct role decision were validated, not merely stated in prose.

## 3. Why this is still package-only

A run ledger and gate engine are domain/package concerns. Prime core does not need to understand Paperclip workflow states. This slice proves host-authoritative governance before adding generic child-template primitives.

The outcome is usable even if the port stops here: one role can produce a durable gated planning run.

## 4. Storage model

Use project-local storage unless explicitly configured:

```text
.prime/paperclip-factory/
└── runs/
    └── <run-id>/
        ├── run.json
        ├── events.jsonl
        ├── manifest.json
        ├── assignments/
        ├── artifacts/
        ├── decisions/
        ├── evaluations/
        ├── snapshots/
        ├── evidence/
        └── recovery/
```

### 4.1 Event log

Every mutation is an append-only event:

```json
{
  "schema": "prime.factory-event/v1",
  "sequence": 7,
  "eventId": "evt-...",
  "runId": "pfk-...",
  "type": "gate-evaluated",
  "timestamp": "...",
  "actor": {
    "kind": "host",
    "id": "paperclip-factory"
  },
  "payload": {},
  "previousHash": "...",
  "hash": "..."
}
```

Hashing is corruption detection, not a security signature.

### 4.2 Projection

`run.json` is a derived projection following `prime.factory-run/v1`. Models and external tools receive read-only views. Package APIs append events and rewrite the projection atomically.

### 4.3 Atomicity

For each mutation:

1. acquire a run-local lock;
2. load and verify the current event chain;
3. validate expected sequence/state;
4. append and flush the event;
5. write projection to a temporary file;
6. flush when supported;
7. atomic rename;
8. release lock.

If the projection write fails after event append, reload reconstructs from events.

Avoid adding a database dependency in this slice unless current repository conventions require one. JSONL plus atomic projections are sufficient for the first real run.

## 5. Minimal workflow

Implement only:

```text
planning
building
blocked
cancelled
```

Supported transitions:

```text
planning → building  via plan-to-build
planning → blocked   on rejection/recovery failure
blocked  → planning  through explicit operator resume after remediation
planning/building → cancelled through explicit operator action
```

Do not implement assurance, release, or retrospective states yet.

## 6. Artifact contracts

Implement validators for:

### `engineering-plan/v1`

Required semantic sections:

```text
objective
assumptions
current state
architecture boundaries
first vertical slice
detailed change plan
validation
risks
rollback
uncertainties
```

### `build-queue/v1`

Machine-readable task records:

```json
{
  "schema": "paperclip.build-queue/v1",
  "runId": "...",
  "tasks": [
    {
      "taskId": "build-001",
      "title": "...",
      "scope": ["path/or/component"],
      "acceptanceCriteria": ["..."],
      "validationCommands": ["..."],
      "dependencies": [],
      "reviewRequired": true
    }
  ]
}
```

Reject:

- empty queue;
- duplicate task IDs;
- task with no acceptance criteria;
- unsafe absolute paths outside repository when scope is a path;
- commands containing destructive git patterns in canonical validation commands.

### `gate-decision/v1`

Validate exact authority:

```text
gateId=plan-to-build
roleId=paperclip/role/engineering-manager
decision∈approve,reject,abstain
```

`not-applicable` is not valid for Plan → Build.

## 7. Gate evaluation semantics

Pseudocode:

```text
assert run.state == planning
accepted_plan = latest accepted engineering-plan
accepted_queue = latest accepted build-queue
decision = latest valid engineering-manager decision

if any missing:
    outcome=blocked, list missing

if decision=reject:
    outcome=blocked, list rejection

if decision=abstain:
    outcome=blocked, list abstention

if decision=approve and artifacts valid:
    outcome=ready
```

Evaluation is pure: it records an evaluation but does not transition automatically unless the caller explicitly invokes:

```python
await paperclip_factory.advance(run_id, expected_gate="plan-to-build")
```

`advance()` re-evaluates under the same lock and appends the transition only if still ready. This avoids time-of-check/time-of-use races.

## 8. Integrate VS-02 pilot

Replace or wrap pilot storage with normal run/assignment APIs. Preserve a migration/read path for any VS-02 pilot fixtures used in tests, but do not build a general backward-compatibility framework.

The Engineering Manager child now writes:

```text
engineering-plan.md
build-queue.json
gate-decision.json
role-result.json
```

The coordinator accepts each through a package API. Do not let the child append directly to `events.jsonl`.

## 9. Read APIs

Provide bounded views:

```python
await paperclip_factory.get_run(run_id)
await paperclip_factory.list_runs(status=None, limit=20)
await paperclip_factory.timeline(run_id, limit=50)
await paperclip_factory.evaluate_gate(run_id, "plan-to-build")
await paperclip_factory.advance(run_id, expected_gate="plan-to-build")
```

Default rendering must not print full artifacts. Return refs, summaries, hashes, and paths.

## 10. Recovery behavior

On load:

- verify event sequences are contiguous;
- verify previous-hash chain;
- compare projection sequence/hash;
- if projection is stale, reconstruct and write a new projection;
- if the log is truncated or invalid, copy originals to `recovery/<timestamp>/`;
- reconstruct only through the last valid event;
- mark the run `blocked` with a recovery event in a new recovered log or sidecar;
- never overwrite the only corrupt evidence.

A missing final newline alone must be handled intentionally. Distinguish a complete JSON record without newline from a truncated JSON object.

## 11. Scope

Implement:

- run ID generation;
- event schema and append;
- projection reducer;
- run-local lock;
- atomic projection writes;
- artifact acceptance;
- Engineering Manager decision acceptance;
- plan gate evaluator;
- explicit advance;
- recovery;
- bounded read APIs;
- integration with VS-02 assignment.

## 12. Non-goals

Do not:

- add generic Prime workflow state;
- add product/planning fan-out;
- add delivery execution;
- add other gates;
- add human approval UI;
- implement package sync/upgrades;
- let models mutate event logs;
- use majority voting;
- infer approval from plan prose.

## 13. Test-first implementation

### 13.1 Red — run creation/reload

Create a run, dispose package objects, reload from disk, and assert the same projection and sequence.

### 13.2 Red — missing evidence blocks

Test every missing combination:

```text
no plan, no queue, no decision
plan only
queue only
decision only
plan + queue
plan + decision
queue + decision
```

All remain blocked with exact missing IDs.

### 13.3 Red — approval and transition

With all valid records:

- evaluate returns `ready`;
- run remains `planning`;
- explicit `advance()` transitions to `building`;
- second advance with same expected state fails idempotently rather than appending a duplicate transition.

### 13.4 Red — free-text and wrong authority

Test:

- role result says “approved” but no decision file;
- builder submits an approve decision;
- Engineering Manager decision references another run;
- malformed artifact hash;
- stale decision followed by reject;
- approve followed by reject;
- reject followed by new approve after replacement artifacts.

Define “latest valid decision” through sequence, and preserve all prior decisions.

### 13.5 Red — concurrent advance

Two concurrent `advance()` calls must yield one transition event. The loser receives a deterministic state/sequence conflict.

### 13.6 Red — recovery

Fixtures:

- stale projection;
- projection missing;
- duplicated sequence;
- invalid previous hash;
- truncated final event;
- valid final event without newline.

Assert preservation and blocking semantics.

### 13.7 Green/refactor

Implement each path minimally. Keep the reducer pure and test it with in-memory events.

## 14. Focused test commands

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/run-ledger.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/gate-engine.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/run-recovery.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/engineering-manager-run.test.ts
```

Then:

```bash
cd <prime-repo-root>
npm run check
```

## 15. Manual verification

1. Create a planning run.
2. Restart Prime.
3. Load the run and confirm sequence/state.
4. Attempt advance with no evidence; inspect missing list.
5. Add plan and queue but no decision; confirm blocked.
6. submit a builder-authored approval; confirm rejected.
7. submit valid Engineering Manager approval; evaluate ready.
8. call explicit advance; confirm building.
9. restart and confirm building state.
10. inspect event log and bounded timeline.
11. make a copy, truncate its final event, and verify recovery preserves originals and blocks the recovered run.

## 16. Acceptance criteria

- [ ] Run state survives process and Prime restart.
- [ ] Models cannot mutate projections through supported APIs.
- [ ] Gate evaluation is derived from typed accepted records.
- [ ] Free-text approval has zero authority.
- [ ] Wrong-role decisions reject.
- [ ] Explicit advance re-evaluates under lock.
- [ ] Concurrent advances produce one transition.
- [ ] Event/projection inconsistency is recoverable and evidence-preserving.
- [ ] Read APIs are bounded.
- [ ] Root prompt visibility remains one control skill.
- [ ] Focused tests and `npm run check` pass.

## 17. Rollback

Disable run creation/advance entry points while retaining the ledger reader. Existing runs stay inspectable. Since this is package-owned storage, no Prime core rollback is required.

## 18. Required completion evidence

Include:

```text
sample event chain
reloaded projection
blocked evaluation with missing fields
ready evaluation
single transition under concurrency
wrong-role rejection
recovery directory contents
root skill/prompt measurements
```

## 19. Copy-ready implementation prompt

Use [`../prompts/VS-03-PROMPT.md`](../prompts/VS-03-PROMPT.md).
