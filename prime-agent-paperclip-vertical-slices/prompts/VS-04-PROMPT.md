# VS-04 Execution Prompt

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
docs/plans/paperclip-prime-port/slices/VS-04-GENERIC-AGENT-TEMPLATE-RLM-CONTRACT.md
```

This slice may touch Prime core. Before editing, read every affected core file and adjacent test in full. Explain why each core change is generic and inert when unused. Preserve existing RLM behavior when the new option is omitted.

Before coding, state the selected red tests and the expected failure reason. At completion, update `IMPLEMENTATION-STATUS.md` and return the required slice completion report. Do not begin the next slice.
