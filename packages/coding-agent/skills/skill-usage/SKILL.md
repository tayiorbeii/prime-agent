---
name: skill-usage
description: Activate and disposition host-enforced scoped methods. Use whenever a child template requires deterministic method enforcement; direct SKILL.md reads do not satisfy the contract.
---

# Skill Usage

This built-in Python skill is the only host-attributable way to satisfy a
resolved skill-enforcement contract. It is backed by append-only host entries;
child-authored files and prose are not accepted as proof.

```python
activation = await skill_usage.activate(
    name="selected-method-name",
    intent="bounded reason for consulting this method",
)
print(activation["content"])

await skill_usage.disposition(
    name="selected-method-name",
    status="applied",
    evidence=["artifact:review.md#finding-2", "test:unit/error-path"],
    summary="How the activated method shaped the work.",
)

status = await skill_usage.status()
```

## Rules

- Activate every method named by the current enforcement contract before
  dispositioning it. Arbitrary file reads do not count.
- Use `applied` with at least one concrete evidence reference when the method
  shaped the work.
- Use `not_applicable` only after activation and include a bounded explanation.
- Check `status()` before completing; it lists missing activations,
  dispositions, and invalid records.
- Never invent method names, paths, hashes, or host attestations.
