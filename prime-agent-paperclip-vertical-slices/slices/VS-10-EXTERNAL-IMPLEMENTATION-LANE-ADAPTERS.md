# VS-10 — Add Optional Claude Code, Codex, and Pi Candidate-Work Lane Adapters

## Slice status

```text
Prerequisites: VS-07 delivery candidate contract complete
Core Prime changes: none expected
Paperclip package changes: yes
Primary proof: external coding agents can be selected explicitly behind one bounded lane interface and remain candidate producers under Prime's ledger and verification
```

## 1. Observable outcome

For an approved delivery task, the operator can choose:

```python
await paperclip_factory.assign_build_task(
    run_id,
    task_id="build-001",
    lane="claude-code",
)
```

with supported lane IDs:

```text
prime-native
claude-code
codex-cli
pi-cli
```

The selected external adapter:

- runs in the leased worktree;
- receives the same task/context/allowed-scope contract;
- writes logs and a candidate report under the run evidence directory;
- cannot call factory lifecycle APIs directly;
- is independently inspected by host git/scope/verification logic from VS-07;
- cannot satisfy assurance/release gates;
- is optional and health-checked.

No lane is auto-selected by vague task semantics in this slice.

## 2. User story

> As an operator with several coding agents, I can explicitly choose the implementation lane best suited to a task while Prime remains the source of truth for scope, evidence, state, and acceptance.

## 3. Lane abstraction

Define a package-internal interface:

```ts
interface CandidateWorkLane {
  id: string;
  label: string;

  detect(ctx: LaneDetectionContext): Promise<LaneAvailability>;
  prepare(input: LaneAssignmentInput): Promise<LaneInvocation>;
  run(invocation: LaneInvocation, signal: AbortSignal): Promise<LaneRawResult>;
  normalize(
    input: LaneAssignmentInput,
    raw: LaneRawResult
  ): Promise<LaneCandidateReport>;
}
```

The host delivery function still owns:

```text
worktree
assignment
scope validation
git observation
canonical verification
candidate status
run events
```

Adapters own only process invocation and raw-output normalization.

## 4. Common lane input

```json
{
  "schema": "paperclip.lane-assignment/v1",
  "runId": "...",
  "assignmentId": "...",
  "taskId": "build-001",
  "laneId": "codex-cli",
  "worktreePath": "...",
  "branch": "...",
  "baseCommit": "...",
  "objective": "...",
  "scope": ["src/staging/**"],
  "acceptanceCriteria": [],
  "validationCommands": [],
  "inputArtifacts": [],
  "artifactDirectory": "...",
  "timeoutMs": 1800000
}
```

Do not pass secrets, full environment dumps, unrelated transcripts, or all run artifacts.

## 5. Common external prompt contract

Every adapter-generated prompt includes:

```text
You are an external implementation lane.
Prime Agent owns lifecycle and acceptance.
Work only in the provided worktree.
Implement exactly the assigned task.
Do not merge, push, deploy, alter factory state, or declare review/security/QA approval.
Stay within allowed scope.
Run requested validation when feasible.
Return a structured candidate report.
```

Include exact paths and IDs. Escape values safely.

The prompt should request:

```text
summary
changed files (advisory)
commands run
test results (advisory)
risks
deviations
unresolved items
```

Host observation remains authoritative.

## 6. Process safety

Use `spawn`/equivalent with argv arrays:

- no shell interpolation;
- canonical cwd;
- explicit timeout and abort;
- bounded live preview;
- full stdout/stderr persisted as artifacts;
- redact known credential patterns from rendered summaries;
- do not log environment values;
- inherit only needed environment;
- record executable path/version;
- capture exit code/signal/duration.

A lane may need the user's existing authentication. Detect its presence without copying credentials into artifacts.

## 7. Claude Code adapter

Detection:

```text
executable found
version command succeeds
noninteractive invocation mode supported
```

Preferred bounded mode should use the installed CLI's current documented print/headless interface. Inspect the actual installed version; do not freeze stale flags from the Hermes plan.

Adapter policy:

- allow only worktree-local file/shell operations where the CLI supports tool restrictions;
- no interactive onboarding in an automated run;
- no hidden telemetry/config changes;
- save prompt and output;
- fail clearly if CLI requires user login.

Do not run a nested long-lived interactive terminal by default.

## 8. Codex CLI adapter

Use the installed Codex CLI's actual current contract.

Requirements:

- bounded one-task invocation;
- worktree cwd;
- output capture;
- no approval bypass;
- no push/merge;
- preserve patch/diff for host validation.

Do not assume a legacy command-line shape; detector records supported flags/version.

## 9. Pi CLI adapter

The user already uses Pi and may have project-specific sessions. Initial adapter supports a fresh bounded CLI/RPC task in the worktree.

Requirements:

- use an explicit isolated Prime/Pi config if needed to avoid recursive self-loading of this package;
- avoid spawning the current Prime Agent binary accidentally when the intention is regular Pi;
- no shared session mutation unless the operator explicitly selects a continuation ID;
- record selected session/continuation metadata without copying transcripts;
- no factory lifecycle calls from the lane.

Continuation support can be a later enhancement within this adapter only after exact session identity is explicit.

## 10. Lane availability report

`doctor()` and:

```python
await paperclip_factory.list_lanes()
```

return:

```text
available
unavailable
misconfigured
disabled
```

with:

```text
version
executable path (bounded display)
supported mode
auth readiness as yes/no/unknown
reason
```

Never expose token values.

## 11. Explicit selection and policy

Task selection precedence:

```text
explicit API argument
  > exact task lane field in accepted build queue
  > project default lane
  > prime-native
```

No model-based lane router in this slice.

Allowed lanes can be restricted in project settings. Unknown or disabled lane fails before assignment admission.

## 12. Result normalization

Normalize external output into the same `implementation-report/v1` used by prime-native delivery.

Add lane metadata:

```text
lane ID/version
raw output refs
exit status
prompt hash
adapter version
```

Host then performs the normal:

```text
changed-file observation
scope enforcement
canonical validation
candidate snapshot creation
```

External success is neither necessary nor sufficient for candidate acceptance. A nonzero process may still leave useful inspectable work but defaults to blocked.

## 13. Failure behavior

| Failure | Behavior |
|---|---|
| executable missing | lane unavailable; no assignment |
| auth missing | actionable blocked state; no secret prompt capture |
| timeout | terminate process tree safely; preserve logs/worktree |
| output malformed | normalize minimal failure report; host still inspects diff |
| CLI modifies global config | report detected when possible; do not treat as candidate evidence |
| lane pushes/merges | detect repository refs/remotes change; block |
| scope violation | VS-07 policy blocks |
| lane claims review approval | ignored |
| Prime/package restart | invocation becomes reconciliation-required; do not blindly rerun |

## 14. Non-goals

Do not:

- automatically choose a lane with an LLM;
- install or update external CLIs;
- copy authentication state;
- create a generic process-orchestration subsystem in Prime core;
- let an external lane call package lifecycle APIs;
- continue arbitrary prior sessions by fuzzy name;
- run several lanes competitively for the same task by default;
- treat external output as accepted evidence without host inspection;
- merge, push, open a PR, or deploy;
- make any external lane required for the factory package.

## 15. Test-first implementation

Use fake executables/scripts; never invoke real paid agents in automated tests.

### 14.1 Red — adapter contract

For each fake lane:

- detector returns version/availability;
- argv/cwd/prompt are exact;
- stdout/stderr persisted;
- timeout/abort handled;
- no shell interpolation.

### 14.2 Red — normalization

Different lane outputs normalize to the same candidate report schema.

### 14.3 Red — authority and scope

Fake lane prints “approved and shipped” and changes out-of-scope file. Host blocks exactly as for prime-native.

### 14.4 Red — secrets

Fixture env contains fake token. Ensure:

- not written to prompt;
- not in report;
- not in rendered logs after redaction;
- raw process environment is never serialized.

### 14.5 Red — restart

Persist invocation start, simulate process loss/restart, and require manual reconciliation instead of duplicate invocation.

### 14.6 Green/refactor

Share process runner and normalization helpers. Keep lane-specific flag generation isolated.

## 16. Focused test commands

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lane-contract.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lane-claude.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lane-codex.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lane-pi.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/lane-secrets-and-recovery.test.ts
```

Then root `npm run check`.

## 17. Manual verification

Use one tiny task per installed lane with a disposable repository and no production credentials.

For each:

1. inspect detector;
2. preview invocation;
3. run bounded task;
4. inspect raw artifacts and normalized report;
5. verify host diff/tests;
6. confirm no merge/push/gate approval;
7. test missing-auth and timeout paths;
8. disable lane and confirm prime-native remains.

Do not commit raw private agent outputs to a public repository.

## 18. Acceptance criteria

- [ ] One common lane contract covers all adapters.
- [ ] Selection is exact and operator-controlled.
- [ ] Missing/misconfigured lanes fail before admission.
- [ ] Real credentials are not captured.
- [ ] Worktree/scope/verification remain host-authoritative.
- [ ] External claims cannot transition gates.
- [ ] No adapter merges, pushes, or deploys by design.
- [ ] Timeouts preserve candidate work and logs.
- [ ] Restart does not duplicate uncertain work.
- [ ] Package works with no external CLI installed.
- [ ] Focused tests and `npm run check` pass.

## 19. Rollback

Disable external lanes in package settings. Prime-native delivery remains. Existing lane worktrees/logs stay inspectable and are never deleted automatically.

## 20. Required completion evidence

Include:

```text
availability report for each lane
fake executable argv/cwd capture
normalized report parity
timeout and restart behavior
secret non-disclosure assertion
out-of-scope/authority rejection
proof no merge/push/release event occurred
```

## 21. Copy-ready implementation prompt

Use [`../prompts/VS-10-PROMPT.md`](../prompts/VS-10-PROMPT.md).
