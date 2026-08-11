# VS-09 Execution Prompt

You are modifying the Prime Agent fork from its repository root.

Read in full before editing:

1. `AGENTS.md`
2. `docs/plans/paperclip-prime-port/README.md`
3. `docs/plans/paperclip-prime-port/00-EXECUTION-CONTRACT.md`
4. `docs/plans/paperclip-prime-port/02-NON-CONFUSION-INVARIANTS.md`
5. `docs/plans/paperclip-prime-port/04-SCHEMA-CONTRACTS.md`
6. `docs/plans/paperclip-prime-port/IMPLEMENTATION-STATUS.md`
7. the slice named below

Implement exactly that slice. Use red → green → refactor. Do not begin a later slice. Follow the repository's focused-test and git-safety rules. Keep imported Paperclip methods hidden from the root model and keep Paperclip-specific semantics out of generic Prime core.


## Selected slice

Read and implement:

```text
docs/plans/paperclip-prime-port/slices/VS-09-RELEASE-RETRO-AND-MEMORY-PROMOTION.md
```

Preserve the candidate-work versus accepted-work boundary. Treat run state, artifact acceptance, role authority, human approval, and gate evaluation as host-owned. Use fake external providers/processes in tests; never spend paid model tokens or execute a real deployment.

Before coding, state the end-to-end user path, authoritative records, red tests, and rollback. At completion, update `IMPLEMENTATION-STATUS.md` and return the required report. Do not begin another slice.
