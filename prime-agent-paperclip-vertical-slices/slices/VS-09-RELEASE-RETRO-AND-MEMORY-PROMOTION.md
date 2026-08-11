# VS-09 — Add Release Preparation, Explicit Human Approval, Retrospective, and Memory Proposals

## Slice status

```text
Prerequisites: VS-08 gate ready and run state release-ready
Core Prime changes: none expected
Paperclip package changes: yes
Primary proof: release actions are bound to explicit human approval, and retrospective learning is proposed before it can affect future agents
```

## 1. Observable outcome

For a run in `release-ready`:

```python
await paperclip_factory.prepare_release(run_id)
```

spawns a Release Engineer child that creates a release plan and record draft.

The operator reviews a bounded summary and explicitly approves an exact action plan:

```python
approval = await paperclip_factory.approve_release(
    run_id,
    plan_digest="sha256:...",
    confirmation="Approve the recorded release plan for this run",
)
```

Only then may the package execute a configured safe release adapter or record an externally performed release.

After a verified release:

```python
await paperclip_factory.start_retro(run_id)
```

spawns a Retro/Ops Manager child that produces:

- a retrospective;
- follow-up task proposals;
- memory proposals.

Memory proposals remain `proposed` until separately approved and applied.

## 2. User story

> As the accountable human, I can see exactly what release action is proposed, approve that immutable plan explicitly, verify the result, and decide which retrospective lessons may affect future factory behavior.

## 3. Release Engineer role

Responsibilities:

```text
release readiness recap
version/change summary
deployment/release commands as a plan
canary/verification plan
rollback plan
observability requirements
release notes
explicit unknowns
```

It must not:

- execute release commands itself;
- create a human approval;
- mark release successful;
- alter assurance decisions;
- write to global memory;
- hide a required rollback step.

Selected methods may include one vetted portable release method such as `pfk-release-it`, after inventory/adaptation. Do not port gstack shipping workflows unchanged.

## 4. Release plan contract

`release-plan/v1`:

```json
{
  "schema": "paperclip.release-plan/v1",
  "runId": "...",
  "candidateSnapshotId": "...",
  "sourceCommit": "...",
  "target": {
    "kind": "local-noop|git-tag|github-release|custom",
    "identifier": "..."
  },
  "actions": [
    {
      "actionId": "release-001",
      "kind": "command",
      "argv": ["./scripts/release.sh", "--dry-run"],
      "cwd": "/canonical/path",
      "reversible": true,
      "requiresApproval": true
    }
  ],
  "preconditions": [],
  "verification": [],
  "rollback": [],
  "risks": [],
  "digest": "sha256:..."
}
```

Canonical digest includes every execution-relevant field. Exclude display-only timestamps from the digest.

Reject shell command strings where safe `argv` can be represented. Do not use `shell: true` for release execution.

## 5. Human approval record

`human-approval/v1`:

```json
{
  "schema": "prime.human-approval/v1",
  "approvalId": "approval-...",
  "runId": "...",
  "scope": "release-plan",
  "subjectDigest": "sha256:...",
  "actor": {
    "kind": "human",
    "display": "local-operator"
  },
  "confirmationHash": "...",
  "createdAt": "...",
  "expiresAt": "...",
  "status": "active"
}
```

Requirements:

- approval subject is the exact plan digest;
- changing plan invalidates approval;
- approval is single-run and single-purpose;
- approval expires;
- approval cannot be created by a child result or free text in an artifact;
- UI/command path must visibly show target, actions, risks, and rollback before confirmation;
- RPC/headless mode requires an explicit structured approval input; it must not auto-approve.

If daemon protocol changes are needed for interactive approval, follow protocol capability rules. Prefer package command/API and existing UI primitives without new wire behavior.

## 6. Release adapters

Implement a provider-neutral interface:

```ts
interface ReleaseAdapter {
  id: string;
  describe(plan: ReleasePlan): ReleasePreview;
  execute(plan: ReleasePlan, approval: HumanApproval): Promise<ReleaseExecutionResult>;
  verify(plan: ReleasePlan, execution: ReleaseExecutionResult): Promise<ReleaseVerificationResult>;
}
```

Initial adapters:

```text
local-noop        required for tests/manual smoke
record-external   records a release performed outside Prime
```

A real deploy/GitHub adapter is optional and should not be required for this slice.

`record-external` still requires human confirmation of the supplied external evidence; it does not execute commands.

## 7. Release record

Host-authoritative `release-record/v1`:

```text
plan digest
approval ID
execution adapter
start/end
per-action result
verification evidence
canary evidence
rollback status
released artifact/version/ref
outcome: success | failed | rolled-back | externally-recorded
```

Only a verified `success` or accepted `externally-recorded` outcome allows:

```text
release-ready → released
```

Failure leaves the run blocked with evidence. It does not automatically retry.

## 8. Retro/Ops Manager role

Inputs:

```text
planning handoff
implementation report
assurance reports
release plan and record
run timeline summary
failures/retries
```

Outputs:

### `retrospective/v1`

```text
intended outcome
actual outcome
what worked
what failed
decision quality
process/tooling gaps
incidents and near misses
follow-up tasks
candidate reusable lessons
```

### `memory-proposal/v1`

Each proposal:

```text
target scope
target namespace
title
content
evidence refs
conflicts
status=proposed
```

The Retro child may propose; it cannot approve or apply.

## 9. Project factory memory

Do not write directly into Prime's global harness in this slice.

Use package-owned project memory:

```text
.prime/paperclip-factory/memory/
├── proposals/
├── approved/
├── index.json
└── audit.jsonl
```

Supported scopes:

```text
project
function
role
```

Run-local context remains in the run ledger.

APIs:

```python
await paperclip_factory.list_memory_proposals(run_id)
await paperclip_factory.approve_memory(proposal_id)
await paperclip_factory.reject_memory(proposal_id, reason="...")
await paperclip_factory.apply_memory(proposal_id)
```

`approve` and `apply` are separate.

Apply:

- checks proposal still matches evidence;
- detects conflict with existing memory ID/title/namespace;
- writes versioned record atomically;
- appends audit event;
- marks proposal applied.

Future role context packets may include bounded approved memory summaries. Root prompt must not receive the whole memory store.

## 10. Follow-up task proposals

Retro may produce tasks, but they enter the run/project backlog as `proposed`. No new code work launches automatically.

Each includes:

```text
source run
problem
recommended owner function
acceptance criteria
priority rationale
evidence
```

## 11. Run transitions

```text
release-ready
  → release-executing  after active exact approval and execution start
release-executing
  → released           after verified success
release-executing
  → blocked            after failure/rollback
released
  → retrospective      after retro assignment admitted
retrospective
  → completed          after accepted retro; memory may still be proposed
```

Run completion does not imply memory application.

## 12. Failure behavior

| Failure | Behavior |
|---|---|
| plan changed after approval | approval invalid; execution blocked |
| approval expired | execution blocked |
| child claims human approval | ignored |
| action exits nonzero | release failed; verify/rollback per plan |
| verification fails | do not mark released |
| rollback succeeds | outcome rolled-back; run blocked |
| retro proposes unsafe/global memory | proposal may be rejected; run can still complete |
| memory conflict | do not overwrite; require explicit resolution |
| package disabled mid-release | do not start new action; preserve state; surface recovery |
| no real adapter | local-noop/record-external remain test paths |

## 13. Non-goals

Do not:

- auto-approve;
- execute a real deployment in automated tests;
- write global harness memory;
- let retro modify skills automatically;
- retry release commands automatically;
- treat a successful command as sufficient without verification;
- make release adapter selection fuzzy;
- hide the exact command plan.

## 14. Test-first implementation

### 14.1 Red — digest-bound approval

- approve plan A;
- mutate one argv/target field to plan B;
- execution rejects approval;
- display-only field change follows documented canonicalization.

### 14.2 Red — approval authority

- child result contains approval;
- free-text user prompt says “approved” without API record;
- approval wrong run/scope/expired.

All reject.

### 14.3 Red — release outcomes

Using fake/noop adapter:

```text
execute success + verify success → released
execute failure → blocked
execute success + verify failure → blocked
rollback path recorded
```

### 14.4 Red — retro isolation

Retro role sees release/run artifacts but no release-execution capability. It cannot create approval through supported APIs.

### 14.5 Red — memory proposal lifecycle

Test:

```text
proposed → approved → applied
proposed → rejected
approved but evidence changed → apply blocked
conflict → apply blocked
run complete with unapplied proposals
```

### 14.6 Red — restart recovery

Restart in `release-executing`. Loader must show whether action completion is known. Never repeat an uncertain irreversible action automatically. Mark `manual-reconciliation-required`.

### 14.7 Green/refactor

Keep approval validation and adapter execution separate. Use typed argv and canonical digests.

## 15. Focused test commands

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/release-approval.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/release-function.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/release-recovery.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/retro-function.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/memory-proposals.test.ts
```

Then root `npm run check`.

## 16. Manual verification

Use `local-noop`:

1. prepare release;
2. inspect preview;
3. attempt execution without approval;
4. approve exact digest;
5. change plan and confirm invalidation;
6. approve unchanged plan;
7. execute/verify noop;
8. restart at each release state;
9. run retro;
10. approve one memory proposal, reject another, leave a third proposed;
11. verify root prompt remains bounded.

## 17. Acceptance criteria

- [ ] Release execution requires exact active human approval.
- [ ] Plan mutation invalidates approval.
- [ ] Child/free-text claims cannot create approval.
- [ ] Verified result, not command exit alone, controls transition.
- [ ] Uncertain restart never repeats action automatically.
- [ ] Retro cannot release or approve memory.
- [ ] Memory proposals are explicit and versioned.
- [ ] Apply is separate from approve.
- [ ] Conflicts never overwrite silently.
- [ ] Run can complete with unapplied proposals.
- [ ] Focused tests and `npm run check` pass.

## 18. Rollback

Disable release execution adapters while retaining prepare/record/read APIs. Runs remain `release-ready` or blocked. Memory proposals remain ordinary project files. No applied memory is deleted automatically.

## 19. Required completion evidence

Include:

```text
release plan and digest
approval record
plan-mutation rejection
fake success/failure/verify-failure paths
restart uncertain-action behavior
retro artifact
memory proposal lifecycle and conflict
root prompt measurement
```

## 20. Copy-ready implementation prompt

Use [`../prompts/VS-09-PROMPT.md`](../prompts/VS-09-PROMPT.md).
