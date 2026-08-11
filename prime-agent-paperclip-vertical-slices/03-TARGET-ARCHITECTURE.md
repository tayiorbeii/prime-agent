# Target Architecture

## 1. Boundary decision

The port is split into three layers.

```text
Prime Agent core
  generic child-template and scoped-resource primitives
        ↓
Prime organization runtime
  generic function/run/gate/artifact mechanics
        ↓
Paperclip organization package
  five functions, ten roles, method library, workflows, schemas
```

Paperclip-specific names and methods do not belong in Prime core.

## 2. Package location

Prototype in:

```text
packages/paperclip-factory/
```

Suggested package shape:

```text
packages/paperclip-factory/
├── package.json
├── README.md
├── CHANGELOG.md
├── extensions/
│   └── paperclip-factory.ts
├── skills/
│   └── paperclip-factory/
│       ├── SKILL.md
│       ├── pyproject.toml
│       └── src/paperclip_factory/
│           ├── __init__.py
│           ├── inventory.py
│           ├── ledger.py
│           ├── artifacts.py
│           └── orchestration.py
├── organization/
│   ├── organization.yaml
│   ├── functions/
│   ├── roles/
│   ├── workflows/
│   └── schemas/
├── library/
│   ├── source/
│   │   └── paperclip-skills/
│   ├── generated/
│   │   ├── methods/
│   │   ├── method-cards/
│   │   └── classification.json
│   └── quarantined/
├── scripts/
│   ├── inventory-paperclip.ts
│   ├── generate-methods.ts
│   ├── verify-generated.ts
│   └── sync-source.ts
└── test/
```

The explicit `pi` package manifest should load only:

- `extensions/paperclip-factory.ts`
- `skills/paperclip-factory/SKILL.md`

Generated methods should be registered through controlled paths only after child scoping exists. If they must appear in the package manifest, they remain hidden with `disable-model-invocation: true`.

## 3. Runtime topology

```text
User
  ↓
Root Prime Agent
  ├── paperclip_factory.start(...)
  ├── paperclip_factory.status(...)
  └── paperclip_factory.advance(...)
       ↓
Host-authoritative run ledger
       ↓
Function selection
       ↓
Agent Template resolution
       ↓
RLM children with scoped resources
       ├── founder-ceo
       ├── product-designer
       ├── devex-lead
       ├── engineering-manager
       ├── implementation-engineer
       ├── staff-reviewer
       ├── security-officer
       ├── qa-lead
       ├── release-engineer
       └── retro-ops-manager
       ↓
Typed role artifacts
       ↓
Gate validator
       ↓
Next workflow state or blocked state
```

## 4. Five functions

### 4.1 Orchestration

Responsibilities:

- create/resume runs;
- select entry mode;
- create role assignments;
- validate artifact submissions;
- apply gate transitions;
- summarize status;
- never treat external self-report as evidence.

Default lifecycle:

```text
singleton per run
```

### 4.2 Planning

Atomic roles:

- founder-ceo;
- product-designer;
- DevEx lead when APIs/CLIs/SDKs are in scope;
- engineering-manager;
- planning synthesizer.

Default lifecycle:

```text
retained per run
```

Execution modes:

| Mode | Roles |
|---|---|
| compact | engineering-manager |
| standard | product-designer + engineering-manager |
| rigorous | founder-ceo + product-designer + conditional devex-lead + engineering-manager |

### 4.3 Delivery

Atomic role:

- implementation-engineer.

Responsibilities:

- execute an approved queue item;
- remain within allowed files/worktree;
- report diffs and verification;
- never approve its own work.

Default lifecycle:

```text
retained per task/worktree
```

### 4.4 Assurance

Atomic roles:

- staff-reviewer;
- security-officer;
- qa-lead;
- assurance summarizer.

Responsibilities:

- independent inspection;
- independent decisions;
- reproducible evidence;
- no implementation except explicitly approved remediation.

Default lifecycle:

```text
ephemeral independent children
```

### 4.5 Release and learning

Atomic roles:

- release-engineer;
- retro-ops-manager.

Responsibilities:

- prepare release evidence;
- require human approval for irreversible actions;
- record canary/rollback outcome;
- create memory/skill/workflow improvement proposals.

Default lifecycle:

```text
retained per run
```

## 5. Generic Agent Template v1

The smallest useful generic template should control:

```ts
interface AgentTemplateDefinitionV1 {
  schema: "prime.agent-template/v1";
  id: string;
  label: string;
  description: string;
  promptAppend: string;
  thinkingLevel?: ThinkingLevel;
  activeToolNames?: string[];
  allowedToolNames?: string[];
  skills?: {
    include: string[];
    exposeSelected?: boolean;
  };
  metadata?: Record<string, unknown>;
}
```

Intentionally deferred:

- arbitrary environment variables;
- daemon wire exposure;
- per-template credentials;
- general sandbox profiles;
- model fallback lists;
- template inheritance.

Add only after a slice proves the need.

## 6. Scoped resource loader

Create a wrapper, not a second discovery implementation.

```ts
class ScopedResourceLoader implements ResourceLoader {
  constructor(
    private readonly base: ResourceLoader,
    private readonly scope: ResourceScope,
  ) {}

  getSkills() {
    // Return exact selected skills, cloning selected hidden methods
    // as model-visible only inside this child when requested.
  }

  // Delegate other resources initially.
}
```

Requirements:

- does not mutate base skill objects;
- preserves diagnostics;
- exact canonical-name matching;
- reports missing requested skills;
- parent/siblings remain unchanged;
- Python-backed skill bootstrap uses the scoped list;
- reload creates a new consistent scope rather than mutating a running child.

## 7. Run ledger

Early slices may use a file-backed implementation under the session artifact directory:

```text
<RLM_SESSION_DIR>/paperclip-factory/runs/<run-id>/
├── run.json
├── events.jsonl
├── assignments/
├── artifacts/
├── submissions/
└── snapshots/
```

Later host code may own writes, but the format remains stable.

Principles:

- append events before mutating current projection;
- atomic file replacement;
- monotonic sequence numbers;
- content hashes for artifacts;
- schema version on every record;
- no secrets or raw private transcripts;
- recover current state from event log plus snapshots.

## 8. Method library

A method record has three representations:

```text
source copy        exact provenance-preserving input
generated wrapper Prime-compatible skill, possibly hidden
method card        bounded routing/application summary
```

Role children should usually receive a method card and exact reference pointers. They load deeper sections only when the task requires them.

## 9. Context providers

Represent context needs as capabilities:

```text
code.structure
content.index
output.materialization
web.research
browser.validation
```

Resolve capabilities at runtime:

```text
code.structure         → jCodeMunch when available
content.index          → Context Mode when available
output.materialization → Prime context artifact store
```

The Paperclip manifest must not hard-code vendor details into role identity.

## 10. Authority boundary

```text
Role child:
  generates candidate artifact

Coordinator:
  validates schema, scope, provenance, and evidence

Gate engine:
  validates prerequisites and authority

Human:
  approves irreversible release action

Run ledger:
  records the authoritative outcome
```
