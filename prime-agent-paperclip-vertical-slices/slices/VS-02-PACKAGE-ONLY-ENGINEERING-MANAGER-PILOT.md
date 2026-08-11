# VS-02 — Package-Only Engineering Manager Role Pilot

## Slice status

```text
Prerequisites: VS-01 complete
Core Prime changes: none
Package changes: yes
Primary proof: one atomic persona can be isolated in one RLM child and return a typed artifact without making the parent that persona
```

## 1. Observable outcome

The operator can create a disposable planning assignment:

```python
run = await paperclip_factory.pilot_engineering_plan(
    objective="Add a project-local staging environment",
    context_paths=["docs/current-architecture.md"],
)
print(run)
```

The package:

1. validates the request;
2. creates one assignment ID and artifact directory;
3. builds a bounded Engineering Manager task prompt;
4. spawns one ordinary RLM child using currently supported `name` and optional `model`;
5. returns an admission handle immediately;
6. allows the child to submit an `engineering-plan` artifact and role-result file;
7. validates the files when the parent calls `collect()`.

The root agent must not receive the Engineering Manager persona in its system prompt. No method skill is exposed yet.

## 2. User story

> As a Prime user, I can delegate technical planning to an explicitly selected Paperclip Engineering Manager child and receive a machine-checkable plan, while my root agent remains an orchestrator rather than becoming the Engineering Manager.

## 3. Why Engineering Manager is the pilot

This role has:

- a clear bounded responsibility;
- a concrete artifact;
- no need to modify code;
- ownership of the first governance gate in later slices;
- enough structure to reveal whether persona isolation and handoff work.

Do not pilot a blended `factory-planner` persona. The purpose is to prove one atomic role.

## 4. Package-only constraint

Current `rlm.run` supports only `name` and `model`. This slice must not add unsupported kwargs.

The control Python skill may call:

```python
handle = await rlm(prompt, name=session_name)
```

The role contract is compiled into the child task prompt. This is intentionally a temporary package-level adapter. Record its limitations:

- child still inherits the parent resource loader;
- child tool set is inherited;
- role identity is task-prompt based;
- role retention relies on the child transcript;
- no method allowlist is visible to the child;
- no generic Agent Template ID exists.

These limitations justify VS-04/VS-05 only after this pilot proves useful.

## 5. Role source and adaptation

Generate a compact Prime role file from the source role contract:

```text
packages/paperclip-factory/roles/engineering-manager.md
```

It must contain:

```text
identity
responsibility
inputs
non-goals
decision lens
authority claims the role may submit
artifact contract
uncertainty policy
handoff requirements
Prime-specific operating rules
```

It must not contain:

- Hermes Kanban tool names;
- Claude plan-mode terms;
- instructions to edit global configuration;
- a full catalog of method skills;
- permission to approve its own artifact in the host ledger;
- release/deploy instructions.

Keep the role file concise enough to fit the child prompt budget. Prefer under 6,000 characters for the role section. Put longer source/reference material in non-injected provenance files.

## 6. Assignment and artifact layout

Use a package-owned project-local directory:

```text
.prime/paperclip-factory/
└── pilots/
    └── <pilot-id>/
        ├── assignment.json
        ├── prompt.md
        ├── artifacts/
        │   └── engineering-plan.md
        ├── submissions/
        │   └── role-result.json
        └── validation.json
```

Do not use the future event-sourced run ledger yet. Keep the layout explicitly marked `pilot/v1`.

The assignment includes:

```json
{
  "schema": "prime.factory-assignment/v1",
  "assignmentId": "asg-...",
  "runId": "pilot-...",
  "functionId": "paperclip/function/planning",
  "roleId": "paperclip/role/engineering-manager",
  "templateId": null,
  "taskId": "engineering-plan",
  "status": "admitted",
  "expectedArtifactTypes": ["engineering-plan"],
  "allowedMethods": []
}
```

## 7. Child task contract

The generated child prompt must include:

```text
[task from Paperclip Factory]
assignment and run IDs
objective
absolute artifact directory
allowed input paths
role contract
required output sections
role-result schema summary
explicit instruction to send a short parent message only after files are written
statement that the child cannot transition workflow state
```

Required plan sections:

```text
Objective and assumptions
Current-state observations
Architecture boundaries
Proposed first vertical slice
Detailed change plan
Acceptance criteria
Validation commands
Risks and mitigations
Rollback strategy
Open uncertainties
Build queue
Plan→Build recommendation: approve | reject | abstain
```

The recommendation is a claim only. VS-03 will introduce host-authoritative evaluation.

## 8. Submission API

Provide bounded APIs:

```python
pilot = await paperclip_factory.pilot_engineering_plan(...)
status = await paperclip_factory.pilot_status(pilot.pilot_id)
result = await paperclip_factory.collect_pilot(pilot.pilot_id)
```

The parent must not poll in a tight loop. The normal operating pattern is:

1. spawn;
2. end the turn;
3. receive child message later;
4. collect explicitly.

`collect_pilot()` validates:

- pilot and assignment IDs match;
- expected artifact exists;
- artifact remains under the assigned directory;
- SHA-256 is recorded;
- role result parses;
- role ID is Engineering Manager;
- result references the artifact;
- artifact contains all required headings;
- no source-code path was modified by package code.

It does not judge plan quality beyond structural requirements.

## 9. Failure behavior

| Failure | Behavior |
|---|---|
| RLM depth exhausted | fail before creating assignment status `running`; record `blocked` |
| child admission fails | record error; no phantom running assignment |
| child sends message without files | `collect()` returns incomplete |
| wrong IDs | reject submission and preserve evidence |
| artifact outside directory | reject |
| malformed JSON | reject with path and parse message |
| duplicate submission | first accepted version remains; later version recorded as conflict |
| child never completes | pilot remains admitted/running; user may delete child through normal RLM controls |

## 10. Scope

Implement:

- Engineering Manager role adapter;
- pilot assignment writer;
- prompt compiler;
- RLM spawn wrapper;
- artifact/result validator;
- status/collect APIs;
- bounded parent notification guidance;
- package tests with fake RLM host.

## 11. Non-goals

Do not:

- add generic templates;
- expose method skills;
- create a workflow/gate engine;
- implement a product role;
- let the child edit source;
- add worktrees;
- synthesize multiple roles;
- make this role globally persistent;
- auto-approve the plan;
- add polling workers.

## 12. Test-first implementation

### 12.1 Red — prompt isolation

Create a test with a faux provider that captures parent and child contexts.

Assert:

- parent system prompt does not contain a unique Engineering Manager sentinel;
- child task contains the sentinel exactly once;
- child name is deterministic and bounded;
- sibling/second unrelated child prompt lacks the sentinel.

Confirm failure before prompt compiler/spawn wrapper exists.

### 12.2 Red — admission behavior

Mock or exercise the RLM host bridge:

- valid request returns an admission handle;
- handle is persisted into assignment;
- admission failure produces `error` and no running child metadata;
- method allowlist is empty.

### 12.3 Red — valid submission

Use a fixture child response that writes a valid plan and result. `collect()` must return:

```text
accepted=true
artifact hash
structural checks pass
gate claim retained but not evaluated
```

### 12.4 Red — adversarial submissions

Test:

- child writes “approved” only in free text;
- result points to `../../outside.md`;
- wrong role ID;
- wrong run ID;
- missing build queue;
- artifact symlink escapes the pilot directory;
- duplicate artifact ID.

All must reject without deleting evidence.

### 12.5 Green and refactor

Implement the minimum. Extract reusable path-containment and schema-validation helpers only when used at least twice.

## 13. Focused test commands

Expected package tests:

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/engineering-manager-pilot.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/pilot-artifact-validation.test.ts
```

Run the existing Prime recursion test only if this slice touches Prime recursion code, which it should not:

```bash
cd packages/coding-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/agent-session-recursion.test.ts
```

Then run `npm run check`.

## 14. Manual verification

Use a small disposable repository with a short architecture document and a configured faux/local model if available.

Verify:

1. root remains general-purpose;
2. child is clearly Engineering Manager;
3. child writes only under the pilot artifact directory;
4. result collection works after ending and returning to a later turn;
5. deleting/disabling package prevents new pilot starts but does not corrupt existing files;
6. no role text appears in project `AGENTS.md`.

Record child prompt length and parent prompt delta.

## 15. Acceptance criteria

- [ ] One Engineering Manager child can be admitted using existing `rlm()` options.
- [ ] Parent and unrelated child do not receive the role persona.
- [ ] No Paperclip method becomes root-visible.
- [ ] Assignment/prompt/artifact/result files use contained paths.
- [ ] A structurally valid plan is accepted by `collect()`.
- [ ] Free-text approval alone has no effect.
- [ ] Wrong IDs/path escapes/malformed results reject deterministically.
- [ ] Pilot can be inspected after child completion or Prime restart.
- [ ] Parent prompt budget remains within the invariant.
- [ ] Focused tests and `npm run check` pass.

## 16. Rollback

Disable pilot entry points in the control skill or remove the package. Existing pilot directories remain ordinary readable files. No Prime core rollback is needed.

## 17. Required completion evidence

Include:

```text
captured parent prompt assertion
captured child prompt assertion
child admission handle fixture
valid artifact/result example
three rejected adversarial examples
artifact-path containment proof
prompt character counts
```

## 18. Copy-ready implementation prompt

Use [`../prompts/VS-02-PROMPT.md`](../prompts/VS-02-PROMPT.md).
