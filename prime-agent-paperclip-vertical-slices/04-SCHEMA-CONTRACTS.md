# Schema Contracts

These v1 shapes are planning contracts. Implement them incrementally, but do not create incompatible ad hoc variants in individual slices.

## 1. Organization definition

```yaml
schema: prime.organization/v1
id: paperclip-factory
name: Paperclip Factory
version: 0.1.0
functions:
  - paperclip/function/orchestration
  - paperclip/function/planning
  - paperclip/function/delivery
  - paperclip/function/assurance
  - paperclip/function/release-learning
workflows:
  - paperclip/workflow/factory-run
default_workflow: paperclip/workflow/factory-run
```

## 2. Role definition

```yaml
schema: prime.role/v1
id: paperclip/role/engineering-manager
label: Engineering Manager
description: Produces technical plans and owns Plan → Build readiness.
persona_file: engineering-manager.md
default_methods:
  - pfk-domain-driven-design
  - pfk-system-design
  - pfk-ddia-systems
authority:
  may_approve:
    - plan-to-build
  may_reject:
    - plan-to-build
workspace_policy: planning-artifacts-only
output_contract: paperclip/artifact/engineering-plan/v1
```

## 3. Function definition

```yaml
schema: prime.function/v1
id: paperclip/function/planning
label: Factory Planning
coordinator_template: paperclip/template/planning-synthesizer
lifecycle: retained-per-run
modes:
  compact:
    roles: [engineering-manager]
  standard:
    roles: [product-designer, engineering-manager]
  rigorous:
    roles: [founder-ceo, product-designer, devex-lead, engineering-manager]
conditional_roles:
  devex-lead: task.has_api_or_cli_surface
memory:
  read: [organization, project, function, run]
  write: [function, run]
handoff:
  target: paperclip/function/delivery
  required_artifacts:
    - product-spec
    - engineering-plan
    - build-queue
```

## 4. Agent template definition

```yaml
schema: prime.agent-template/v1
id: paperclip/template/engineering-manager
label: Paperclip Engineering Manager
prompt_append_file: ../../roles/engineering-manager.md
thinking_level: high
active_tools: [ipython]
skills:
  include:
    - pfk-domain-driven-design
    - pfk-system-design
    - pfk-ddia-systems
  expose_selected: true
metadata:
  organization: paperclip-factory
  function: paperclip/function/planning
  role: paperclip/role/engineering-manager
```

## 5. Workflow definition

```yaml
schema: prime.workflow/v1
id: paperclip/workflow/factory-run
initial_state: framing
terminal_states: [completed, cancelled]
states:
  framing: {}
  planning: {}
  building: {}
  assurance: {}
  release-ready: {}
  released: {}
  retrospective: {}
  completed: {}
  blocked: {}
transitions:
  - id: framing-to-planning
    from: framing
    to: planning
    requires:
      artifacts: [company-brief]
  - id: plan-to-build
    from: planning
    to: building
    gate: plan-to-build
    requires:
      artifacts: [engineering-plan, build-queue]
      approvals:
        - role: engineering-manager
  - id: build-to-assurance
    from: building
    to: assurance
    requires:
      artifacts: [implementation-report]
  - id: review-to-release-ready
    from: assurance
    to: release-ready
    gate: review-to-ship
    requires:
      approvals:
        - role: staff-reviewer
        - role: security-officer
        - role: qa-lead
  - id: release-ready-to-released
    from: release-ready
    to: released
    human_approval: required
  - id: released-to-retrospective
    from: released
    to: retrospective
    requires:
      artifacts: [release-record]
  - id: retrospective-to-completed
    from: retrospective
    to: completed
    requires:
      artifacts: [retrospective]
```

## 6. Run projection

```json
{
  "schema": "prime.factory-run/v1",
  "runId": "pfk-20260808-0001",
  "organizationId": "paperclip-factory",
  "workflowId": "paperclip/workflow/factory-run",
  "workflowVersion": "1",
  "state": "planning",
  "entryMode": "brownfield",
  "entryReason": "Clear intent; no approved technical plan",
  "objective": "Add staging support to the monorepo",
  "project": {
    "cwd": "/repo",
    "repositoryRoot": "/repo",
    "head": "abc123",
    "dirtyAtStart": false
  },
  "assignments": [],
  "artifacts": [],
  "gates": [],
  "createdAt": "2026-08-08T00:00:00Z",
  "updatedAt": "2026-08-08T00:00:00Z",
  "sequence": 12
}
```

## 7. Assignment

```json
{
  "schema": "prime.factory-assignment/v1",
  "assignmentId": "asg-001",
  "runId": "pfk-20260808-0001",
  "functionId": "paperclip/function/planning",
  "roleId": "paperclip/role/product-designer",
  "templateId": "paperclip/template/product-designer",
  "taskId": "planning-product",
  "status": "running",
  "child": {
    "rlmChildId": "sub-12345678",
    "sessionName": "pfk-product-pfk-20260808-0001"
  },
  "expectedArtifactTypes": ["product-spec"],
  "allowedMethods": ["pfk-inspired-product", "pfk-jobs-to-be-done"],
  "createdAt": "..."
}
```

## 8. Role result

```json
{
  "schema": "prime.role-result/v1",
  "resultId": "result-001",
  "runId": "pfk-20260808-0001",
  "assignmentId": "asg-001",
  "functionId": "paperclip/function/planning",
  "roleId": "paperclip/role/product-designer",
  "status": "complete",
  "summary": "Validated product plan produced.",
  "artifactRefs": ["artifact-product-spec-001"],
  "gateClaims": [],
  "evidence": [
    {
      "kind": "source",
      "ref": "docs/product-brief.md"
    }
  ],
  "uncertainties": [],
  "submittedAt": "..."
}
```

## 9. Artifact record

```json
{
  "schema": "prime.factory-artifact/v1",
  "artifactId": "artifact-product-spec-001",
  "runId": "pfk-20260808-0001",
  "type": "product-spec",
  "version": "1",
  "path": "artifacts/planning/product-spec.md",
  "sha256": "...",
  "producerAssignmentId": "asg-001",
  "accepted": true,
  "acceptedAt": "...",
  "metadata": {
    "sourceCommit": "abc123"
  }
}
```

## 10. Gate decision

```json
{
  "schema": "prime.gate-decision/v1",
  "decisionId": "gate-decision-001",
  "runId": "pfk-20260808-0001",
  "gateId": "review-to-ship",
  "roleId": "paperclip/role/security-officer",
  "decision": "reject",
  "reason": "Unsigned webhook ingress remains possible.",
  "evidenceRefs": ["artifact-security-report-001"],
  "submittedAt": "..."
}
```

Allowed decisions:

```text
approve
reject
abstain
not-applicable
```

`not-applicable` requires a predeclared conditional rule. It cannot be selected merely to bypass a role.

## 11. Gate evaluation

```json
{
  "schema": "prime.gate-evaluation/v1",
  "runId": "pfk-20260808-0001",
  "gateId": "review-to-ship",
  "outcome": "blocked",
  "missing": [],
  "rejections": ["gate-decision-001"],
  "evaluatedAt": "..."
}
```

The gate engine computes this record. Agents do not author it.

## 12. Method classification

```yaml
schema: prime.method-classification/v1
id: pfk-inspired-product
source:
  repo: tayiorbeii/paperclip-factory-kit-hermes
  path: skills/paperclip/inspired-product/SKILL.md
  commit: 28733e96246d325f3cb9a28225c167ce1c03bf75
  sha256: ...
license: MIT
kind: method
compatibility: native
functions: [planning]
roles: [founder-ceo, product-designer]
phases: [framing, planning]
generated:
  wrapper: library/generated/methods/pfk-inspired-product/SKILL.md
  card: library/generated/method-cards/pfk-inspired-product.md
```

Compatibility values:

```text
native
adapter-required
workflow-rewrite
reference-only
quarantined
```

## 13. Memory proposal

```json
{
  "schema": "prime.memory-proposal/v1",
  "proposalId": "memory-proposal-001",
  "runId": "pfk-20260808-0001",
  "targetScope": "project",
  "targetNamespace": "paperclip/function/delivery",
  "title": "Staging data sync requires a scrubbed export",
  "content": "...",
  "evidenceRefs": ["artifact-retro-001"],
  "status": "proposed"
}
```

Allowed statuses:

```text
proposed
approved
rejected
applied
superseded
```

## 14. Schema evolution

- Every persisted record has an explicit schema identifier.
- Additive optional fields do not require rewriting old records.
- Semantic changes require a new schema version.
- Loaders reject unknown major versions.
- Migration scripts preserve original bytes and emit a report.
- Generated schemas are checked into source control and validated in tests.
