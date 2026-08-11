# Non-Confusion Invariants

These invariants are more important than feature breadth. A slice that violates one must not merge.

## 1. Root-agent prompt budget

The root agent may receive:

- one concise `paperclip-factory` skill description;
- a compact active-run summary when a run exists;
- explicit alerts for blocked gates.

The root agent must not receive:

- 86 method descriptions;
- five full profile prompts;
- ten atomic role prompts;
- full workflow bodies;
- gstack onboarding, telemetry, or upgrade instructions;
- every run artifact.

Target budget added to an idle root system prompt:

```text
≤ 1,500 characters
```

Target budget added for one active run:

```text
≤ 3,000 characters
```

## 2. One concept, one representation

Do not encode the same responsibility in conflicting layers.

| Concept | Authoritative representation |
|---|---|
| Role voice and decision lens | Role definition/template |
| Reusable methodology | Method skill/library entry |
| Business responsibility | Function definition |
| Sequence and gates | Workflow definition |
| Current progress | Run ledger |
| Approval | Typed gate decision |
| Durable lesson | Approved memory proposal |
| Code/environment access | Capability/workspace policy |

A method must not silently acquire authority. A persona must not silently change workflow state.

## 3. Namespacing

Use stable prefixes:

```text
paperclip/
paperclip-factory/
pfk-
```

Suggested IDs:

```text
paperclip/role/engineering-manager
paperclip/function/planning
paperclip/workflow/factory-run
pfk-system-design
```

Never publish generic names such as `planner`, `reviewer`, or `system-design` when they can collide with existing user resources. Preserve original slugs in metadata.

## 4. Global visibility

Only control surfaces are globally visible.

Globally visible:

```text
paperclip-factory
```

Hidden or scoped:

```text
role definitions
method skills
workflow internals
lane adapters
gate implementation details
```

An explicit `/skill:pfk-*` escape hatch may remain available for advanced users, but imported methods must not compete in ordinary root routing.

## 5. Persona isolation

A role prompt is applied only to the child created for that role.

Tests must prove:

- parent prompt lacks the role text;
- sibling prompts lack the role text;
- a resumed child retains its own role;
- changing one role definition does not mutate an existing unrelated child;
- role text is not written into project `AGENTS.md`.

## 6. Method isolation

A role receives an exact allowlist.

Rules:

- Unknown method IDs fail.
- Empty method sets are valid.
- No wildcard `*` in production manifests.
- “All methods” is forbidden outside inventory/debug commands.
- Methods may be shared by multiple roles, but selection is explicit.
- A selected method may be represented by a bounded method card plus targeted references rather than its entire source body.

## 7. Independent assurance

Staff review, security, and QA are separate decisions.

Forbidden:

- one combined `reviewer` decision satisfying all gates;
- a synthesis agent overwriting a rejection;
- majority voting that converts a security rejection into approval;
- builder self-approval.

Allowed:

- a synthesis artifact summarizing the three reports;
- de-duplication of identical findings;
- conditional QA/security scopes recorded before execution.

## 8. Candidate work versus accepted work

Child and external-lane outputs are candidate work until the coordinator validates:

- artifact schema;
- expected run/role/task IDs;
- allowed workspace;
- changed-file scope;
- required verification;
- git metadata;
- gate ownership.

The run ledger records both submission and acceptance.

## 9. Prompt versus policy

Prompt instructions are advisory. Critical policy must be checked outside prompts.

Host-enforced examples:

- gate prerequisites;
- human approvals;
- role ownership;
- artifact existence;
- source hashes;
- workspace mutation checks for read-only roles;
- release action allowlist.

## 10. gstack quarantine

A source is quarantined when it contains unresolved assumptions such as:

```text
AskUserQuestion
ExitPlanMode
~/.claude
~/.gstack
native Claude slash commands
Claude-specific tool names
automatic config mutation
telemetry or upgrade prompts
```

Quarantined sources:

- are indexed and reported;
- are not loaded as skills;
- cannot be selected by templates;
- may be used as reference material by an adaptation task;
- require a compatibility test before activation.

## 11. Memory discipline

Run observations do not become global facts automatically.

Flow:

```text
observation
  → memory proposal
  → evidence and target scope
  → coordinator/user approval
  → explicit write
```

A rejected or superseded decision must not remain as an active memory.

## 12. Failure behavior

- Missing context helper: fall back to bounded native inspection and report degradation.
- Missing optional role: record skip reason when workflow permits it.
- Missing required role/artifact: block transition.
- Corrupt run ledger: refuse mutation and preserve original bytes.
- Duplicate template ID: fail package load with source paths.
- Unknown workflow version: refuse execution.
- Package disabled: Prime behaves as if the port is absent.
