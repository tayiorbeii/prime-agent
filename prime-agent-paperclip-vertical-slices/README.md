# Prime Agent Paperclip Factory Port — Vertical Slice Planning Bundle

This bundle is an implementation-ready plan for porting the Paperclip Factory Kit method skills, role/persona contracts, workflow stages, and governance gates into a Prime Agent fork without flooding or confusing the root agent.

## Research baseline

The plan is grounded against:

- Prime Agent commit [`a18809e00ea30638584d87b3afea7285a9d7296c`](https://github.com/PrimeIntellect-ai/prime-agent/tree/a18809e00ea30638584d87b3afea7285a9d7296c)
- Paperclip Factory Kit Hermes port commit [`28733e96246d325f3cb9a28225c167ce1c03bf75`](https://github.com/tayiorbeii/paperclip-factory-kit-hermes/tree/28733e96246d325f3cb9a28225c167ce1c03bf75)

The original `tayiorbeii/paperclip-factory-kit` repository was not available through the public GitHub API during preparation. The Hermes port contains the mirrored method-skill corpus, the five-profile role model, and a detailed source-system inventory. The implementation must prefer a user-provided local source checkout when one exists and must preserve provenance for every imported artifact.

## Goal

Produce a Prime-native organization package in which:

```text
one visible control skill
    ↓
a host-authoritative factory run
    ↓
a selected business function
    ↓
one or more isolated role agents
    ↓
only the methods and capabilities required by those roles
    ↓
typed artifacts and independently enforced gates
```

The target is **not** to place five persona prompts and 86 skill descriptions into every Prime session. The target is a generic Agent Template and Function Runtime that lets a Paperclip package selectively compose them.

## How to use this bundle

1. Place this directory in the root of the Prime Agent fork, for example:

   ```text
   docs/plans/paperclip-prime-port/
   ```

2. Give Prime Agent [`10-MASTER-IMPLEMENTATION-PROMPT.md`](10-MASTER-IMPLEMENTATION-PROMPT.md).

3. Prime Agent must read, in order:

   1. [`00-EXECUTION-CONTRACT.md`](00-EXECUTION-CONTRACT.md)
   2. [`01-SOURCE-BASELINE-AND-GAP-ANALYSIS.md`](01-SOURCE-BASELINE-AND-GAP-ANALYSIS.md)
   3. [`02-NON-CONFUSION-INVARIANTS.md`](02-NON-CONFUSION-INVARIANTS.md)
   4. [`03-TARGET-ARCHITECTURE.md`](03-TARGET-ARCHITECTURE.md)
   5. [`04-SCHEMA-CONTRACTS.md`](04-SCHEMA-CONTRACTS.md)
   6. [`05-VERTICAL-SLICE-ROADMAP.md`](05-VERTICAL-SLICE-ROADMAP.md)
   7. [`IMPLEMENTATION-STATUS.md`](IMPLEMENTATION-STATUS.md)
   8. The next incomplete file under [`slices/`](slices/)

4. Implement exactly one slice per branch and per agent run unless a slice explicitly authorizes a paired follow-on.

5. Update a project status file after each slice. A suggested format appears in the execution contract.

## Document map

| Document | Purpose |
|---|---|
| `00-EXECUTION-CONTRACT.md` | Rules Prime Agent must follow while modifying itself |
| `01-SOURCE-BASELINE-AND-GAP-ANALYSIS.md` | Verified source facts, existing seams, and missing primitives |
| `02-NON-CONFUSION-INVARIANTS.md` | Hard constraints preventing persona and skill pollution |
| `03-TARGET-ARCHITECTURE.md` | Package/core boundaries and runtime topology |
| `04-SCHEMA-CONTRACTS.md` | Stable v1 manifests and artifact contracts |
| `05-VERTICAL-SLICE-ROADMAP.md` | Dependency graph and slice summaries |
| `06-PRIME-AGENT-CORE-CHANGE-MAP.md` | Exact Prime files and extension points likely to change |
| `07-SKILL-AND-PERSONA-MIGRATION-MAP.md` | Role/function/method classification and migration policy |
| `08-TEST-AND-ACCEPTANCE-MATRIX.md` | Cross-slice tests, benchmarks, and release gates |
| `09-RISK-AND-ROLLBACK-REGISTER.md` | Risks, containment, rollback, and kill switches |
| `10-MASTER-IMPLEMENTATION-PROMPT.md` | Prompt to give the self-modifying Prime Agent |
| `11-INITIAL-DECISION-LOG.md` | Decisions already made and questions intentionally deferred |
| `12-SOURCE-REFERENCES.md` | Pinned source links used by the plan |
| `13-OPERATOR-RUNBOOK.md` | Controlled handoff, branching, review, interruption, and convergence |
| `IMPLEMENTATION-STATUS.md` | Durable per-slice implementation and measurement ledger |
| `MANIFEST.md` | File inventory and integrity hashes for this bundle |
| `slices/VS-00...VS-14` | End-to-end implementation slices |
| `prompts/` | Copy-ready prompts for individual slices |

## Completion definition

The port is complete only when all of the following are true:

- The root Prime Agent sees one concise Paperclip control skill, not the whole method corpus.
- A child role sees only its selected role contract and methods.
- The five business functions can execute a resumable workflow.
- Staff review, security, and QA remain independent authorities.
- Gate transitions are validated outside model prose.
- Imported gstack workflows are adapted or quarantined; none execute Claude-specific instructions accidentally.
- A complete skill inventory and license/provenance report is generated reproducibly.
- The feature is removable by uninstalling or disabling one package.
- Prime works normally when the Paperclip package is absent or disabled.
