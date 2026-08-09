---
name: persona-team
description: Compose isolated Prime Agent role personas with child-scoped method skills and typed workflow evidence. Use when coordinating planning, delivery, assurance, release, or retrospective specialists without exposing the persona and method corpus to the root agent.
---

# Persona Team

Prime-native role and skill orchestration. No external lifecycle runtime is required or called.

## First use

Run:

```python
report = persona_team.doctor()
```

Do not start work when `report["ready"]` is false.

## Invariants

- Role prompts are injected only into selected child sessions.
- Method skills are hidden at the root and exposed only by exact child template selection.
- Role output is candidate evidence; typed host validation controls workflow state.
- Review, security, and QA decisions remain independent.
- Irreversible release actions require explicit human approval.

## Spawn a role

Use the native RLM callable with an exact template ID. Admission returns a handle; the child must report through `agent_message` or an agreed artifact path.

```python
child = await rlm(
    "State the bounded assignment, inputs, output path, and acceptance evidence.",
    name="unique-readable-name",
    template="prime/persona-team/engineering-manager",
)
```

Choose the narrowest role:

- strategic framing: `prime/persona-team/founder-ceo`
- product contract: `prime/persona-team/product-designer`
- developer experience: `prime/persona-team/devex-lead`
- technical plan: `prime/persona-team/engineering-manager`
- bounded implementation: `prime/persona-team/implementation-engineer`
- independent staff review: `prime/persona-team/staff-reviewer`
- independent security review: `prime/persona-team/security-officer`
- independent QA: `prime/persona-team/qa-lead`
- approved release preparation: `prime/persona-team/release-engineer`
- retrospective learning proposal: `prime/persona-team/retro-ops-manager`

Do not include persona text or method bodies in the parent prompt. Do not ask one child to approve its own work. Use separate assurance children and treat every reply as candidate evidence until independently checked.
