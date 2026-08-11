# VS-13 Execution Prompt

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
docs/plans/paperclip-prime-port/slices/VS-13-RESUMABLE-FIVE-FUNCTION-WORKFLOW.md
```

This is a convergence/release-readiness slice. Do not trade away the non-confusion invariants to finish faster. Preserve deterministic generation, exact role/method scopes, independent gates, active-run version pinning, and data-preserving rollback.

Before coding, enumerate all prerequisite capabilities you verified and any gaps that block this slice. At completion, update `IMPLEMENTATION-STATUS.md`, include exact test/check evidence, and do not publish or begin another slice.
