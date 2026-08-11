# Master Prompt for Prime Agent

Copy the prompt below into a Prime Agent session running from the fork root.

---

You are modifying the Prime Agent repository to implement the Paperclip Factory vertical-slice plan supplied under `docs/plans/paperclip-prime-port/`.

Your job is to implement **exactly one next eligible vertical slice**, not the whole roadmap.

## Read first

Read in full:

1. the repository root `AGENTS.md`;
2. `CONTEXT.md` and relevant ADRs if present;
3. `docs/plans/paperclip-prime-port/README.md`;
4. `00-EXECUTION-CONTRACT.md`;
5. `01-SOURCE-BASELINE-AND-GAP-ANALYSIS.md`;
6. `02-NON-CONFUSION-INVARIANTS.md`;
7. `03-TARGET-ARCHITECTURE.md`;
8. `04-SCHEMA-CONTRACTS.md`;
9. `05-VERTICAL-SLICE-ROADMAP.md`;
10. `IMPLEMENTATION-STATUS.md` if it exists;
11. the next incomplete `slices/VS-*.md` whose prerequisites are complete.

Read the relevant Prime source files in full before broad edits. Do not rely only on snippets.

## Select the slice

Choose the lowest-numbered slice that:

- is not complete;
- has all prerequisites complete;
- is not explicitly blocked.

If no status file exists, create it from the template in `00-EXECUTION-CONTRACT.md` and select VS-00.

State the selected slice and why it is eligible before making changes.

## Work rules

- Create or use a dedicated feature branch for this slice.
- Implement no behavior reserved for later slices.
- Follow red → green → refactor.
- Add focused tests first and confirm the intended failure.
- Run only the exact focused tests required by the slice.
- If you create or modify a test, run it until green.
- Run `npm run check` after code changes.
- Do not run `npm run dev`, `npm run build`, or unbounded `npm test`.
- Do not use paid provider calls.
- Do not modify unrelated files.
- Do not use destructive git commands or broad staging.
- Keep Paperclip-specific concepts out of Prime core unless the slice introduces a generic primitive.
- Preserve source provenance and licensing.
- Keep all imported methods hidden from the root agent.
- Never add an “install all skills into every agent” mode.
- Never let free-text model output transition a gate.
- Never let builder output satisfy review/security/QA approval.
- Keep all new generic core behavior inert when unused.
- Add a changelog entry only when the slice changes user-visible behavior.

## Decision policy

Make the best technically grounded decision when details are not specified. Prefer:

1. package-level implementation over core modification;
2. exact IDs over fuzzy routing;
3. immutable wrappers over shared mutation;
4. additive optional fields over breaking changes;
5. fail-closed governance gates;
6. fail-open optional context helpers;
7. explicit schemas over prose conventions;
8. reversible, feature-flagged behavior.

Do not pause for minor taste decisions. Stop only for:

- an actual safety concern;
- missing source that prevents the slice’s acceptance criteria;
- an unavoidable breaking public API choice not covered by the plan;
- a conflict with current repository rules.

## Completion

Do not mark the slice complete until every required acceptance criterion is verified.

Update `IMPLEMENTATION-STATUS.md`.

Return the completion report required by `00-EXECUTION-CONTRACT.md`, including exact test commands and results, `npm run check`, manual verification, deviations, risks, and rollback.

Do not begin the next slice in the same run.

---
