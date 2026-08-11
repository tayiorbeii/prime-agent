# VS-08 — Fan Out Independent Staff Review, Security, and QA and Enforce Review → Release Readiness

## Slice status

```text
Prerequisites: VS-07 has produced a candidate snapshot
Core Prime changes: none expected
Paperclip package changes: yes
Primary proof: three independent assurance authorities inspect the same immutable candidate and all must satisfy a host-computed gate
```

## 1. Observable outcome

For a `candidate-ready` delivery task:

```python
await paperclip_factory.start_assurance(run_id, task_id="build-001")
```

creates three independent assignments:

```text
paperclip/role/staff-reviewer
paperclip/role/security-officer
paperclip/role/qa-lead
```

Each assignment receives the same candidate snapshot identity but a separate workspace and child session.

After their submissions are accepted:

```python
evaluation = await paperclip_factory.evaluate_gate(
    run_id,
    gate_id="review-to-ship",
)
```

returns `ready` only when:

- staff review decision is `approve`;
- security decision is `approve`;
- QA decision is `approve`;
- all required reports and evidence are accepted;
- every decision references the same candidate snapshot;
- no role workspace mutation invalidated its submission;
- no later rejection supersedes an approval.

A synthesis report may summarize findings, but cannot change decisions.

## 2. User story

> As the factory owner, I can trust release readiness because code review, security, and QA were performed independently against the same candidate and no combined reviewer or builder claim can satisfy their gates.

## 3. Candidate snapshot

Assurance must operate against stable bytes.

Create:

```json
{
  "schema": "paperclip.candidate-snapshot/v1",
  "snapshotId": "candidate-...",
  "runId": "...",
  "taskId": "build-001",
  "baseCommit": "...",
  "candidateCommit": null,
  "patchPath": "evidence/candidate.patch",
  "patchSha256": "...",
  "fileManifestPath": "evidence/candidate-files.json",
  "fileManifestSha256": "...",
  "createdAt": "..."
}
```

Support either:

1. a candidate commit on the isolated branch; or
2. base commit plus a binary-safe patch and untracked-file archive/manifest.

Do not silently omit untracked files. The file manifest must account for every candidate file used by QA/review.

### 3.1 Independent assurance workspaces

For each role:

1. create a detached worktree or disposable clone at the base/candidate commit;
2. apply the exact candidate patch if needed;
3. verify resulting file manifest hash;
4. record workspace lease;
5. give the role that workspace as its child cwd;
6. compare the workspace after the role finishes;
7. reject the role result if project files changed.

Separate workspaces prevent one reviewer from changing what another reviews.

Do not mount the same mutable builder worktree concurrently into all three children.

## 4. Staff Reviewer template

Responsibility:

```text
structural correctness
hidden coupling
maintainability
test design
edge cases
scope adherence
consistency with accepted plan
```

Methods:

```text
pfk-clean-code
pfk-clean-architecture
pfk-refactoring-patterns
```

Required `review-report/v1`:

```text
candidate snapshot ID
scope reviewed
findings with severity and evidence
plan/acceptance-criteria trace
test gaps
required fixes
decision
uncertainties
```

The role may approve or reject `review-to-ship` as Staff Reviewer only.

## 5. Security Officer template

Responsibility:

```text
trust boundaries
authentication/authorization
input validation
secrets and sensitive data
dependency/supply-chain changes
network and file-system exposure
abuse and failure modes
rollback/security monitoring
```

Use a compact Prime-native security checklist derived from the source role contract. Do not port a gstack/Claude security workflow unchanged.

Required `security-report/v1`:

```text
candidate snapshot ID
threat surface
changed trust boundaries
findings with severity/exploitability/evidence
secrets scan evidence
dependency review evidence
required mitigations
decision
residual risk
```

All runs receive a Security Officer decision in this first implementation. Do not use `not-applicable` to bypass the role.

## 6. QA Lead template

Responsibility:

```text
acceptance-criteria verification
canonical tests
failure-path behavior
reproducibility
user-visible behavior
regression evidence
```

Required `qa-report/v1`:

```text
candidate snapshot ID
criteria-to-evidence matrix
commands/scenarios
host-observed exit/results
failures
flakiness or environmental limits
decision
```

The host executes or verifies canonical commands. QA prose cannot convert a failed command into approval.

Browser/visual QA may be recorded as unavailable in this slice unless a configured provider exists. The decision must reflect whether required acceptance criteria were actually testable.

## 7. Finding schema

All reports use a shared finding:

```json
{
  "findingId": "finding-...",
  "category": "authorization",
  "severity": "high",
  "title": "Webhook accepts unsigned payloads",
  "description": "...",
  "evidence": [
    {
      "kind": "file-range",
      "path": "src/api/webhook.ts",
      "startLine": 42,
      "endLine": 71,
      "snapshotId": "candidate-..."
    }
  ],
  "required": true,
  "suggestedRemediation": "..."
}
```

Allowed severities:

```text
critical
high
medium
low
info
```

A report decision and findings must be internally consistent:

- critical/high required finding cannot accompany `approve` unless explicitly resolved in the reviewed snapshot;
- report validator rejects contradictory submissions;
- host does not infer severity from prose.

## 8. Gate decisions

Each role submits a separate `prime.gate-decision/v1` with exact role ID and `review-to-ship`.

Authority table:

| Role | Required | Can approve | Can reject |
|---|---:|---:|---:|
| Staff Reviewer | yes | yes | yes |
| Security Officer | yes | yes | yes |
| QA Lead | yes | yes | yes |
| Implementation Engineer | no authority | no | no |
| Assurance Synthesizer | no authority | no | no |

Evaluation:

```text
missing required role → blocked
any reject → blocked
any abstain → blocked
any invalid/mutated workspace → blocked
all three approve → ready
```

No majority voting.

## 9. Assurance synthesis

After all valid reports arrive, an optional `assurance-synthesizer` child or deterministic renderer produces:

```text
assurance-summary/v1
```

It may:

- group duplicate findings;
- show conflicts;
- summarize evidence;
- list required remediation;
- show the host-computed gate outcome.

It may not:

- author a gate decision;
- lower severity;
- mark findings resolved;
- turn a rejection into approval;
- modify source.

Prefer a deterministic host renderer first. Add a synthesis child only if user value is demonstrated and keep its output non-authoritative.

## 10. Remediation loop

When gate is blocked:

```text
assurance reports accepted
  → remediation tasks generated from required findings
  → delivery function receives explicit new/updated build-queue task
  → candidate snapshot version increments
  → all required assurance roles re-run against the new snapshot
```

Do not mutate old reports or decisions. Decisions are snapshot-specific.

This slice may implement generation of remediation task proposals but need not automatically execute the next delivery cycle.

## 11. Run transitions

Supported:

```text
building/candidate-ready
  → assurance (when assignments admitted)
assurance
  → release-ready (only explicit advance after ready gate)
assurance
  → building (explicit remediation transition when blocked)
```

The host re-evaluates under lock before transition.

## 12. Failure behavior

| Failure | Behavior |
|---|---|
| one child fails | other reports may complete; gate blocked |
| report wrong snapshot | reject |
| reviewer modifies workspace | reject report, retain workspace |
| QA command unavailable | evidence records unavailable; decision cannot approve required criterion |
| security report contradictory | reject structurally |
| synthesis says approve despite reject | ignored; summary flags inconsistency |
| candidate bytes drift | invalidate all pending assurance assignments |
| role resubmits | append new decision; do not erase previous |
| package disabled | no transition; reports remain inspectable |

## 13. Non-goals

Do not:

- merge candidate;
- release/deploy;
- ask one combined reviewer to perform all three roles;
- permit builder self-review;
- use majority voting;
- let synthesis own a gate;
- auto-fix findings;
- run assurance against mutable shared workspace;
- add all source review/QA/gstack skills.

## 14. Test-first implementation

### 14.1 Red — snapshot reproducibility

Create candidate snapshot and three assurance workspaces. Assert identical file manifests before roles run.

### 14.2 Red — role isolation

Capture all three contexts:

- unique role prompt only in correct child;
- exact method scope;
- same snapshot ID;
- separate cwd;
- no builder/planner persona.

### 14.3 Red — gate matrix

Test all decision combinations, especially:

```text
approve/approve/approve → ready
reject/approve/approve → blocked
approve/reject/approve → blocked
approve/approve/reject → blocked
missing/approve/approve → blocked
abstain/approve/approve → blocked
```

### 14.4 Red — adversarial authority

- builder submits Staff Reviewer decision;
- synthesizer submits Security decision;
- wrong run/snapshot IDs;
- free-text “all checks passed” without QA report;
- critical unresolved finding plus approve.

All reject.

### 14.5 Red — mutation detection

Each role modifies one source file in its own workspace. Only that role submission invalidates; original candidate snapshot and other role workspaces remain intact.

### 14.6 Red — restart/resume

Restart after admitting one, two, or all three children. Reconcile existing assignments and do not duplicate.

### 14.7 Red — remediation snapshot

A new candidate snapshot invalidates prior gate readiness. Old decisions remain historical and cannot satisfy the new snapshot.

## 15. Focused test commands

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/candidate-snapshot.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/assurance-function.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/assurance-gate.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/assurance-mutation-policy.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/assurance-resume.test.ts
```

Run relevant Prime scoped child/cwd tests if integration changes, then root `npm run check`.

## 16. Manual verification

1. Create one known-good candidate and one candidate with a deliberate security flaw.
2. Start assurance.
3. Inspect three distinct workspaces and children.
4. Collect all reports.
5. Confirm good candidate can become `ready`.
6. Confirm security rejection blocks even when other two approve.
7. Modify reviewer workspace and confirm only that report invalidates.
8. create new candidate snapshot and confirm old approvals no longer count.
9. restart during fan-out and resume without duplicates.
10. inspect bounded assurance summary.

## 17. Acceptance criteria

- [ ] All roles inspect identical candidate bytes.
- [ ] All roles have separate workspaces/sessions.
- [ ] Role/persona/method isolation is exact.
- [ ] Three distinct decisions are required.
- [ ] Builder and synthesizer have no gate authority.
- [ ] Any rejection blocks.
- [ ] Workspace mutation invalidates that role submission.
- [ ] New snapshot invalidates old readiness.
- [ ] Explicit host advance controls release-ready transition.
- [ ] Restart does not duplicate assignments.
- [ ] Focused tests and `npm run check` pass.

## 18. Rollback

Disable the assurance function and leave the run in `building` or `assurance-blocked`. Preserve candidate snapshots, workspaces, reports, and decisions. No source changes are automatically reverted or removed.

## 19. Required completion evidence

Include:

```text
candidate snapshot manifest/hash
three workspace paths/hashes
three captured role contexts
full gate-combination test
wrong-authority rejections
mutation evidence
new-snapshot invalidation
restart reconciliation
```

## 20. Copy-ready implementation prompt

Use [`../prompts/VS-08-PROMPT.md`](../prompts/VS-08-PROMPT.md).
