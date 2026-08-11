# VS-03 Execution Prompt

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
docs/plans/paperclip-prime-port/slices/VS-03-RUN-LEDGER-ARTIFACTS-AND-PLAN-GATE.md
```

Before coding, state:

- why this slice is eligible;
- its observable end-to-end outcome;
- files you expect to touch;
- focused tests you will add first;
- behavior explicitly deferred.

At completion, update `IMPLEMENTATION-STATUS.md` and return the exact completion report required by `00-EXECUTION-CONTRACT.md`.
