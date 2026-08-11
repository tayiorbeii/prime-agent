# Vertical Slice Index

Read the parent bundle documents before any slice. Implement exactly one slice per branch and agent run.

| Slice | Capability | Copy-ready prompt |
|---|---|---|
| [VS-00](VS-00-BOOTSTRAP-PACKAGE-AND-DOCTOR.md) | Bootstrap the Optional Package and Prove a Non-Polluting `doctor()` | [Prompt](../prompts/VS-00-PROMPT.md) |
| [VS-01](VS-01-SOURCE-INVENTORY-AND-COMPATIBILITY-CLASSIFIER.md) | Build a Reproducible Source Inventory and Compatibility Classifier | [Prompt](../prompts/VS-01-PROMPT.md) |
| [VS-02](VS-02-PACKAGE-ONLY-ENGINEERING-MANAGER-PILOT.md) | Package-Only Engineering Manager Role Pilot | [Prompt](../prompts/VS-02-PROMPT.md) |
| [VS-03](VS-03-RUN-LEDGER-ARTIFACTS-AND-PLAN-GATE.md) | Add a Durable Run Ledger, Typed Artifacts, and the Plan → Build Gate | [Prompt](../prompts/VS-03-PROMPT.md) |
| [VS-04](VS-04-GENERIC-AGENT-TEMPLATE-RLM-CONTRACT.md) | Add a Generic Agent Template Registry and `rlm.run(template=...)` | [Prompt](../prompts/VS-04-PROMPT.md) |
| [VS-05](VS-05-SCOPED-CHILD-RESOURCE-LOADER.md) | Add Immutable Child-Scoped Skill Views and Expose Only Selected Methods | [Prompt](../prompts/VS-05-PROMPT.md) |
| [VS-06](VS-06-PLANNING-FUNCTION-FANOUT-AND-SYNTHESIS.md) | Implement the First Real Planning Function with Independent Product and Engineering Roles | [Prompt](../prompts/VS-06-PROMPT.md) |
| [VS-07](VS-07-DELIVERY-FUNCTION-BOUNDED-CANDIDATE-WORK.md) | Implement a Bounded Delivery Function in an Isolated Worktree | [Prompt](../prompts/VS-07-PROMPT.md) |
| [VS-08](VS-08-INDEPENDENT-ASSURANCE-FANOUT-AND-GATE.md) | Fan Out Independent Staff Review, Security, and QA and Enforce Review → Release Readiness | [Prompt](../prompts/VS-08-PROMPT.md) |
| [VS-09](VS-09-RELEASE-RETRO-AND-MEMORY-PROMOTION.md) | Add Release Preparation, Explicit Human Approval, Retrospective, and Memory Proposals | [Prompt](../prompts/VS-09-PROMPT.md) |
| [VS-10](VS-10-EXTERNAL-IMPLEMENTATION-LANE-ADAPTERS.md) | Add Optional Claude Code, Codex, and Pi Candidate-Work Lane Adapters | [Prompt](../prompts/VS-10-PROMPT.md) |
| [VS-11](VS-11-FUNCTION-SPECIFIC-CONTEXT-PROVIDER-POLICY.md) | Add Function-Specific Context Provider Policy for jCodeMunch, Context Mode, and Bounded Native Fallback | [Prompt](../prompts/VS-11-PROMPT.md) |
| [VS-12](VS-12-FULL-SKILL-CORPUS-MIGRATION-AND-QUARANTINE.md) | Migrate the Full Skill and Persona Corpus with Deterministic Generation and Quarantine | [Prompt](../prompts/VS-12-PROMPT.md) |
| [VS-13](VS-13-RESUMABLE-FIVE-FUNCTION-WORKFLOW.md) | Complete a Resumable Five-Function Greenfield/Brownfield Factory Workflow | [Prompt](../prompts/VS-13-PROMPT.md) |
| [VS-14](VS-14-PACKAGING-SYNC-UPGRADE-AND-ROLLBACK.md) | Make the Port Reproducibly Installable, Upgradable, Verifiable, and Rollbackable | [Prompt](../prompts/VS-14-PROMPT.md) |

## Required reading for every slice

1. [`../00-EXECUTION-CONTRACT.md`](../00-EXECUTION-CONTRACT.md)
2. [`../02-NON-CONFUSION-INVARIANTS.md`](../02-NON-CONFUSION-INVARIANTS.md)
3. [`../04-SCHEMA-CONTRACTS.md`](../04-SCHEMA-CONTRACTS.md)
4. [`../IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md)
5. The selected slice

Do not treat later-slice examples as authorization to implement them early.
