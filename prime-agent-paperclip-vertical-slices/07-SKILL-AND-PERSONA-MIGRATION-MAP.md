# Skill and Persona Migration Map

## 1. Five function teams and ten atomic roles

| Function | Atomic roles | Durable purpose |
|---|---|---|
| Orchestration | factory coordinator | Own run state, routing, evidence, and gates |
| Planning | founder-ceo, product-designer, devex-lead, engineering-manager | Produce a gate-ready plan and build queue |
| Delivery | implementation-engineer | Produce bounded candidate changes and verification |
| Assurance | staff-reviewer, security-officer, qa-lead | Independently assess quality, safety, and acceptance |
| Release-learning | release-engineer, retro-ops-manager | Prepare approved release and institutional learning |

The five Hermes profile prompts are useful summaries, but they are not sufficient atomic role definitions. When the original source checkout is available, generate role definitions from `agents/*/AGENTS.md`. Until then, use the Hermes profile text plus the detailed port plan as provisional inputs and mark generated roles as `provisional-source`.

## 2. Initial method mapping seed

This seed comes from the Hermes installer. It is not the final classification.

### Orchestration seed

```text
gstack-autoplan
gstack-context-save
gstack-context-restore
gstack-freeze
gstack-unfreeze
gstack-guard
gstack-health
gstack-sync-gbrain
gstack-pair-agent
gstack-office-hours
gstack-cso
gstack-plan-ceo-review
gstack-careful
gstack-learn
```

Most of these are workflow/host integrations, not portable methods. Default classification should be `workflow-rewrite` or `quarantined`.

### Planning seed

Portable method candidates:

```text
inspired-product
jobs-to-be-done
mom-test
lean-startup
lean-ux
continuous-discovery
design-sprint
domain-driven-design
system-design
ddia-systems
blue-ocean-strategy
crossing-the-chasm
obviously-awesome
storybrand-messaging
one-page-marketing
scorecard-marketing
predictable-revenue
traction-eos
hundred-million-offers
influence-psychology
made-to-stick
contagious
drive-motivation
improve-retention
negotiation
```

Harness-specific candidates requiring review:

```text
gstack-plan-ceo-review
gstack-plan-design-review
gstack-plan-devex-review
gstack-plan-eng-review
gstack-plan-tune
gstack-investigate
gstack-browse
gstack-scrape
gstack-benchmark-models
```

### Delivery seed

Portable method candidates:

```text
clean-code
clean-architecture
pragmatic-programmer
refactoring-patterns
software-design-philosophy
domain-driven-design
system-design
ddia-systems
high-perf-browser
web-typography
microinteractions
ios-hig-design
refactoring-ui
top-design
ux-heuristics
```

Workflow/tool candidates requiring adaptation:

```text
gstack-codex
gstack-setup-deploy
gstack-design-html
gstack-design-shotgun
gstack-document-generate
gstack-make-pdf
```

### Assurance seed

Portable method candidates:

```text
clean-code
clean-architecture
pragmatic-programmer
refactoring-patterns
software-design-philosophy
release-it
high-perf-browser
ux-heuristics
```

Workflow candidates requiring adaptation:

```text
gstack-review
gstack-qa
gstack-qa-only
gstack-canary
gstack-benchmark
gstack-devex-review
gstack-design-review
gstack-plan-design-review
gstack-plan-devex-review
gstack-plan-eng-review
gstack-plan-ceo-review
gstack-landing-report
```

### Release-learning seed

Portable method candidates:

```text
release-it
traction-eos
predictable-revenue
storybrand-messaging
one-page-marketing
scorecard-marketing
```

Workflow candidates requiring adaptation:

```text
gstack-ship
gstack-retro
gstack-document-release
gstack-document-generate
gstack-landing-report
gstack-land-and-deploy
gstack-setup-deploy
gstack-health
```

## 3. Classification rules

### `native`

Use when:

- instructions are methodology-focused;
- tool references are generic or absent;
- all referenced files are present;
- no external state mutation is assumed;
- licensing is compatible;
- prompt length and trigger description are bounded.

### `adapter-required`

Use when:

- the core method is portable;
- tool names, paths, or output formats need a small Prime overlay;
- execution remains a single skill, not a multi-stage workflow.

### `workflow-rewrite`

Use when:

- source uses stop points, plan-mode transitions, slash commands, multiple agents, or state mutation;
- source expects a harness-specific lifecycle;
- the correct Prime representation is a workflow/function, not a method.

### `reference-only`

Use when:

- useful conceptual material exists;
- following it directly would conflict with Prime;
- the content may be searched or cited by an adaptation agent.

### `quarantined`

Use when:

- licensing/provenance is missing;
- required files are missing;
- dangerous or opaque commands exist;
- the source assumes unavailable tools and lacks a safe adaptation;
- generation validation fails.

## 4. Method-card generation

Every active method gets a bounded card:

```markdown
---
id: pfk-inspired-product
source: ...
functions: [planning]
roles: [product-designer, founder-ceo]
---

# Inspired Product — Method Card

## Use when
...

## Do not use when
...

## Required questions
...

## Required output evidence
...

## Source sections
- ...
```

Limits:

```text
description ≤ 600 characters
card ≤ 4,000 characters by default
full source loaded only on demand
```

## 5. Role-definition content

A role definition contains:

- purpose;
- responsibility;
- non-responsibilities;
- decision lens;
- authority;
- required inputs;
- required outputs;
- permitted methods;
- workspace policy;
- escalation rules;
- completion checklist.

Do not copy broad profile prose that instructs the role to own other functions.

## 6. Trigger policy

Only the visible control skill uses broad natural-language routing.

Method descriptions should be precise and scoped. Avoid repeated phrases such as “use for planning,” which cause every planning method to match.

Role selection is made by the function manifest, not by independent method-description routing.

## 7. Generated output policy

Generated wrappers must:

- use `pfk-` names;
- preserve original slug in metadata;
- include transformation classification;
- include source commit and SHA-256;
- include license and attribution;
- use `disable-model-invocation: true` until scoped loading is proven;
- never include source telemetry/setup prompts unless intentionally adapted;
- use relative reference paths that exist in the generated package.

## 8. Full-corpus completion report

The migration report must show:

| Metric | Required |
|---|---:|
| Source skill directories discovered | exact source count |
| Classified | 100% |
| Source hash recorded | 100% |
| License recorded or quarantined | 100% |
| Native/adapter output validated | 100% |
| Workflow-rewrite sources not loaded as methods | 100% |
| Missing reference files | 0 for active methods |
| Duplicate generated names | 0 |
| Root-visible imported methods | 0 |
