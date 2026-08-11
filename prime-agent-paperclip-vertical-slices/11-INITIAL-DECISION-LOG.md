# Initial Decision Log

## ADR-001 — Package first

**Decision:** Prove the port in an opt-in package before adding core primitives.

**Rationale:** Most source conversion, run schemas, and orchestration can be validated without increasing upstream fork divergence.

## ADR-002 — One globally visible control skill

**Decision:** Only `paperclip-factory` is visible to the root model.

**Rationale:** The root should route by function and exact manifests, not choose among 86 similar method descriptions.

## ADR-003 — Five functions, ten atomic roles

**Decision:** Preserve the five broad business functions while restoring independent atomic roles inside functions.

**Rationale:** Five durable boundaries are operationally manageable; independent role outputs preserve useful disagreement and authority separation.

## ADR-004 — Methods are not personas

**Decision:** Method skills, role lenses, function responsibilities, workflows, and gates remain separate artifacts.

**Rationale:** Combining them causes instructions to acquire unintended authority.

## ADR-005 — gstack defaults to quarantine

**Decision:** gstack-derived sources are inactive until classified and adapted.

**Rationale:** They contain Claude/gstack-specific paths, tools, state, prompts, and lifecycle semantics.

## ADR-006 — Typed artifacts and host evaluation

**Decision:** Role outputs are schema-validated artifacts; gate outcomes are computed outside model prose.

**Rationale:** Self-reported completion is not trustworthy enough for lifecycle authority.

## ADR-007 — Named generic Agent Templates

**Decision:** The first core primitive is a generic template registry selectable by `rlm.run`.

**Rationale:** This codifies role configuration without hard-coding Paperclip into Prime.

## ADR-008 — Scoped resource-loader wrapper

**Decision:** Filter an existing `ResourceLoader` for a child instead of implementing separate skill discovery.

**Rationale:** Prime already has discovery, precedence, diagnostics, and overrides. A wrapper minimizes divergence and mutation.

## ADR-009 — Human release approval

**Decision:** Irreversible release actions always require explicit human approval.

**Rationale:** No persona or gate approval replaces user authorization for deployment.

## ADR-010 — Memory promotion is explicit

**Decision:** Retrospectives create proposals; they do not automatically mutate global/project memory.

**Rationale:** Durable memory needs evidence, scope, conflict handling, and approval.

## Deferred decisions

- Final package publication name and registry.
- Whether Agent Templates become a new package resource type or remain extension-registered.
- Whether run/gate mechanics later move into Prime core.
- Strong process sandboxing for read-only roles.
- Server-backed organization memory.
- UI visualization of function teams and gates.
- Per-child MCP grants beyond capability aliases.
- Template inheritance and composition.
