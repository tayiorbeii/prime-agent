# Test and Acceptance Matrix

## 1. Testing layers

### Unit tests

Validate:

- manifest parsing;
- ID normalization;
- duplicate detection;
- exact method filtering;
- schema validation;
- state-transition evaluation;
- source classification;
- content hashing;
- atomic ledger writes.

### Integration tests

Validate:

- package discovery;
- Python-backed skill import;
- extension registration;
- RLM template resolution;
- child prompt construction;
- scoped resource loading;
- child artifact submission;
- run recovery;
- independent gate decisions.

### Suite regressions

Use faux provider scenarios for:

- parent/child prompt isolation;
- resumed child identity;
- missing template failure;
- child skill allowlist;
- blocked release transition;
- child messages and completion ordering.

### Manual smoke tests

Use an isolated agent directory and a disposable fixture repository.

```bash
PRIME_AGENT_CODING_AGENT_DIR=/tmp/prime-agent-paperclip-test   ./prime-agent.sh -e ./packages/paperclip-factory
```

Never test against the user’s normal Prime configuration first.

## 2. Global acceptance matrix

| Capability | Automated proof | Manual proof | Failure behavior |
|---|---|---|---|
| Package disabled | Baseline resource snapshot unchanged | Start without package | No Paperclip text/resources |
| One visible skill | System-prompt skill list snapshot | `/skills` or prompt diagnostic | Extra methods fail test |
| Source inventory | Fixture and real corpus counts | Run inventory command | Missing source blocks activation |
| Template isolation | Parent/child prompt assertions | Spawn role child | Unknown template rejected |
| Skill scoping | Parent/sibling/child skill snapshots | Child lists methods | Missing method rejected |
| Run ledger | Corruption and replay tests | Restart and inspect run | Mutation refused, bytes preserved |
| Gate engine | Transition table tests | Attempt invalid transition | State remains unchanged |
| Planning fan-out | Faux-provider artifacts | Run standard plan | Synthesis waits for required roles |
| Delivery scope | Temp git repository | Inspect worktree/diff | Out-of-scope change rejected |
| Assurance | Three independent decisions | Force one rejection | Release remains blocked |
| Human release approval | Approval token tests | Attempt release | No irreversible command runs |
| Memory proposal | Apply/reject tests | Approve one proposal | No automatic global write |
| Full corpus | Generation verification | Review report | Quarantined content hidden |
| Resume | Rehydrate run and child registry | Restart Prime | No duplicate assignments |

## 3. Prompt-budget benchmarks

Capture before and after installation:

```text
idle root system prompt characters/tokens
root prompt with one active run
planning child prompt
delivery child prompt
assurance child prompt
number of visible skill descriptions
```

Targets:

| Measurement | Target |
|---|---:|
| Root visible Paperclip skills | 1 |
| Idle root added chars | ≤ 1,500 |
| Active-run added chars | ≤ 3,000 |
| Role child visible Paperclip methods | exact allowlist |
| Sibling leakage | 0 |
| Quarantined methods visible | 0 |

A benchmark regression blocks merge.

## 4. Suggested focused Prime tests

Core changes should use existing test locations where possible:

```text
packages/coding-agent/test/agent-session-recursion.test.ts
packages/coding-agent/test/resource-loader.test.ts
packages/coding-agent/test/extensions-runner.test.ts
packages/coding-agent/test/suite/agent-session-prompt.test.ts
```

New focused tests may include:

```text
packages/coding-agent/test/agent-template-registry.test.ts
packages/coding-agent/test/scoped-resource-loader.test.ts
packages/coding-agent/test/suite/regressions/paperclip-template-isolation.test.ts
packages/coding-agent/test/suite/regressions/paperclip-scoped-skills.test.ts
```

Use a real issue number instead of `paperclip-*` when upstreaming issue-specific regressions.

## 5. Suggested package tests

```text
packages/paperclip-factory/test/package-layout.test.ts
packages/paperclip-factory/test/inventory.test.ts
packages/paperclip-factory/test/generation.test.ts
packages/paperclip-factory/test/manifest-validation.test.ts
packages/paperclip-factory/test/run-ledger.test.ts
packages/paperclip-factory/test/gate-engine.test.ts
packages/paperclip-factory/test/role-artifact.test.ts
packages/paperclip-factory/test/worktree-policy.test.ts
```

Python skill tests can remain standard-library based where practical. If pytest is added, treat it as a package-specific development dependency and respect repository dependency-age policy.

## 6. Adversarial scenarios

Every end-to-end release candidate must test:

1. A builder writes “security approved” in its report.
2. A security child returns an approval with the wrong run ID.
3. A QA child produces free text but no artifact.
4. Two packages register the same template ID.
5. A selected method does not exist.
6. A hidden method remains hidden in the parent.
7. A role attempts to write outside its allowed artifact directory.
8. A reviewer modifies source code.
9. The run ledger is truncated mid-write.
10. Prime restarts after children are admitted but before artifacts arrive.
11. A gstack source contains `AskUserQuestion` and `~/.claude`.
12. A source method has no license.
13. Context Mode or jCodeMunch is unavailable.
14. The project is dirty before a delivery assignment.
15. A release action lacks explicit approval.
16. A memory proposal conflicts with an existing project memory.

## 7. Completion evidence

Each slice stores:

```text
test command
exit code
captured stdout/stderr path
manual verification notes
prompt-budget measurement
changed-file list
baseline and resulting commits
```

Do not store credentials, raw private transcripts, or customer data in the planning bundle.
