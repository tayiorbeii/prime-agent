# VS-06 — Implement the First Real Planning Function with Independent Product and Engineering Roles

## Slice status

```text
Prerequisites: VS-05 complete
Core Prime changes: no new generic primitive expected
Paperclip package changes: yes
Primary proof: one business function coordinates role-specific children, accepts independent artifacts, and synthesizes a handoff without blending personas or authority
```

## 1. Observable outcome

The operator can run:

```python
run = await paperclip_factory.start(
    objective="Add a shared staging environment for the monorepo",
    entry_mode="brownfield",
    workflow="paperclip/workflow/factory-run",
    planning_mode="standard",
)
await paperclip_factory.advance(run.run_id)
```

The host-authoritative planning function performs a resumable sequence:

```text
Product Designer assignment
  ↓ accepted product-spec
Engineering Manager assignment
  ↓ accepted engineering-plan + build-queue + plan decision
Planning Synthesizer assignment
  ↓ accepted planning-handoff
Plan → Build gate evaluation
```

Children run with exact templates and method scopes. The synthesizer may summarize conflicts but cannot replace the Engineering Manager's gate decision.

At the end, the run is either:

```text
planning + blocked
planning + ready
building after explicit advance
```

## 2. User story

> As a project owner, I can ask the Paperclip planning function to turn a product objective into a product spec, technical plan, build queue, and traceable handoff, with product and engineering perspectives remaining distinct.

## 3. Initial mode

Implement only `planning_mode="standard"` in this slice.

Standard roles:

```text
product-designer
engineering-manager
planning-synthesizer
```

Explicitly reject `compact` and `rigorous` as not yet implemented, while keeping their future schema values reserved. VS-13 may add them after the five-function workflow is proven.

Do not include Founder/CEO or DevEx yet. This avoids expanding role topology before the role-scoping and handoff mechanism is validated.

## 4. Function manifest

Create:

```text
packages/paperclip-factory/functions/planning/function.json
```

Representative shape:

```json
{
  "schema": "prime.function/v1",
  "id": "paperclip/function/planning",
  "label": "Factory Planning",
  "lifecycle": "retained-per-run",
  "modes": {
    "standard": {
      "stages": [
        {
          "id": "product",
          "templateId": "paperclip/template/product-designer"
        },
        {
          "id": "engineering",
          "templateId": "paperclip/template/engineering-manager",
          "dependsOnArtifacts": ["product-spec"]
        },
        {
          "id": "synthesis",
          "templateId": "paperclip/template/planning-synthesizer",
          "dependsOnArtifacts": [
            "product-spec",
            "engineering-plan",
            "build-queue"
          ]
        }
      ]
    }
  }
}
```

The package validates this manifest. Prime core does not parse it.

## 5. Role templates and method scopes

### Product Designer

Role contract:

```text
understand target user/problem
identify value/usability risks
define experience and acceptance criteria
separate evidence, assumption, and decision
avoid architecture ownership
```

Selected methods, using only inventory-approved adapted sources:

```text
pfk-inspired-product
pfk-jobs-to-be-done
pfk-continuous-discovery
```

Required artifact:

```text
product-spec/v1
```

### Engineering Manager

Role contract from VS-02, now informed by accepted product spec.

Methods:

```text
pfk-domain-driven-design
pfk-system-design
pfk-ddia-systems
```

Artifacts:

```text
engineering-plan/v1
build-queue/v1
plan-to-build gate-decision/v1
```

### Planning Synthesizer

This is a coordinator role, not a decision authority.

It receives bounded artifact summaries and exact artifact paths. It produces:

```text
planning-handoff/v1
```

It must:

- preserve unresolved conflicts;
- cite which source artifact supports each decision;
- not generate a new gate approval;
- not change product or engineering artifacts;
- not silently invent consensus;
- list omissions and blockers.

Methods should be empty or limited to one explicitly adapted synthesis method. Do not give it the full planning method set.

## 6. Artifact schemas

### Product spec

Machine-readable header plus Markdown body or pure JSON+Markdown pair. Required fields:

```text
target users
problem statement
desired outcomes
non-goals
value risks
usability risks
constraints
experience scenarios
acceptance criteria
success measures
assumptions
evidence
open questions
```

### Planning handoff

Required:

```text
run ID and source commit
objective
accepted artifact refs and hashes
decisions
unresolved conflicts
first vertical slice
build queue summary
validation strategy
gate status
known risks
```

The handoff's gate status is copied from host evaluation, not authored by the synthesizer.

## 7. Orchestration API

Use explicit operator/coordinator advancement rather than a hidden background loop:

```python
await paperclip_factory.advance(run_id)
```

`advance()`:

1. loads run under lock;
2. accepts any pending valid submissions already written;
3. identifies exactly one next deterministic action set;
4. admits eligible child assignments;
5. records handles;
6. returns a bounded action report.

It may admit independent same-stage assignments concurrently in future. In standard mode the dependency chain is sequential.

Do not hold an IPython call waiting for child completion.

Additional APIs:

```python
await paperclip_factory.pending(run_id)
await paperclip_factory.collect(run_id)
await paperclip_factory.explain_next(run_id)
```

## 8. Context packets

Each child receives a bounded context packet generated by host/package code:

```json
{
  "schema": "paperclip.context-packet/v1",
  "runId": "...",
  "assignmentId": "...",
  "objective": "...",
  "project": {
    "repositoryRoot": "...",
    "head": "..."
  },
  "inputArtifacts": [
    {
      "type": "product-spec",
      "path": "...",
      "sha256": "...",
      "summary": "..."
    }
  ],
  "allowedInputPaths": [],
  "allowedArtifactDirectory": "..."
}
```

Do not inline full prior artifacts into every child prompt. Provide short summaries and paths. A child may read the full accepted artifact when needed.

## 9. Workspace mutation policy

Planning roles are intended read-only with respect to product source.

Before each planning child:

```text
record HEAD
record git status porcelain v2
record existing diff hash
```

After completion:

- compare;
- allow writes only under the run artifact directory;
- reject submission and block run if tracked project files changed;
- do not destroy the changes;
- preserve evidence for user inspection.

This is detection, not a security sandbox.

## 10. Run-ledger events

Add events such as:

```text
function-entered
assignment-created
child-admitted
submission-detected
artifact-accepted
artifact-rejected
role-result-accepted
planning-synthesis-requested
planning-completed
gate-evaluated
```

Every event includes run/assignment IDs and source commit when applicable.

## 11. Failure and disagreement behavior

| Condition | Result |
|---|---|
| Product spec rejected | do not spawn Engineering Manager |
| Product role reports uncertainty | accept if schema valid; carry uncertainty |
| Engineering rejects Plan→Build | synthesize handoff as blocked |
| Synthesis contradicts engineering approval | host gate still follows engineering decision |
| Source HEAD changes between roles | mark context drift; require explicit rebase/replan decision |
| Planning child modifies source | reject and block |
| method unavailable | fail assignment before admission |
| child timeout/cancel | assignment remains retryable with attempt history |
| duplicate role result | accept one version by explicit sequence; preserve conflict |

## 12. Non-goals

Do not:

- implement Founder/CEO;
- implement DevEx;
- write code;
- create worktrees;
- execute build queue;
- add review/security/QA;
- make release decisions;
- use majority voting;
- run automatic continuous polling;
- add all planning methods.

## 13. Test-first implementation

### 13.1 Red — function manifest and stage eligibility

Test deterministic next action at every projection state:

```text
new planning run → product assignment
product admitted → no duplicate
product accepted → engineering assignment
engineering accepted → synthesis assignment
synthesis accepted → gate evaluation
```

### 13.2 Red — role/resource isolation

Capture each child:

- Product sees only its role + product methods.
- Engineering sees only its role + engineering methods.
- Synthesizer sees no product/engineering persona and no broad method set.
- Parent sees none of the role prompts/method descriptions.

### 13.3 Red — accepted handoffs

Fixture artifacts flow through all stages and produce a planning handoff containing exact refs/hashes and host gate result.

### 13.4 Red — disagreement

Engineering decision rejects while synthesis prose says ready. Gate remains blocked and handoff records conflict.

### 13.5 Red — mutation detection

Child modifies a tracked source fixture. Submission rejects, source changes remain untouched, evidence records paths.

### 13.6 Red — restart/resume

Stop after each stage, reconstruct package/runtime, call `advance()`, and assert exactly the next stage is admitted with no duplication.

### 13.7 Green/refactor

Keep stage selection as a pure reducer/planner:

```text
projection → proposed deterministic actions
```

Separate action planning from side-effect execution.

## 14. Focused test commands

Package:

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/planning-function.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/planning-role-isolation.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/planning-resume.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/planning-mutation-policy.test.ts
```

Run Prime recursion/scoped-loader focused tests only if integration code changes. Then root `npm run check`.

## 15. Manual verification

Use a disposable project containing a concise product brief and architecture notes.

Run the function across separate Prime turns:

1. start run;
2. advance to Product;
3. receive and collect Product;
4. restart Prime;
5. advance to Engineering;
6. collect;
7. advance to Synthesis;
8. collect;
9. evaluate gate;
10. inspect bounded timeline and handoff;
11. repeat with an Engineering rejection.

Inspect parent/child prompt and skill views.

## 16. Acceptance criteria

- [ ] Standard planning mode is end-to-end usable.
- [ ] Product and Engineering remain distinct children.
- [ ] Exact method scopes are enforced.
- [ ] Synthesis has no approval authority.
- [ ] Accepted artifact hashes flow into later assignments.
- [ ] Planning source mutations are detected and block acceptance.
- [ ] Restart at every stage resumes without duplicate assignments.
- [ ] Engineering rejection cannot be overwritten.
- [ ] Explicit advance controls the transition.
- [ ] Root prompt remains bounded.
- [ ] Focused tests and `npm run check` pass.

## 17. Rollback

Disable the planning function in the package manifest. Existing run records remain readable through generic run APIs. VS-03 single Engineering Manager planning remains available as a fallback if explicitly retained.

## 18. Required completion evidence

Include:

```text
function manifest
three captured role contexts
artifact chain with hashes
planning handoff
approve and reject gate paths
mutation rejection
restart-after-each-stage matrix
prompt/method visibility measurements
```

## 19. Copy-ready implementation prompt

Use [`../prompts/VS-06-PROMPT.md`](../prompts/VS-06-PROMPT.md).
