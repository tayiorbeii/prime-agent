# Vertical Slice Roadmap

## 1. Ordering principle

The roadmap moves from package-only proofs to generic core changes only when the package demonstrates the need.

```text
VS-00 package + doctor
   ↓
VS-01 source inventory
   ↓
VS-02 one role child
   ↓
VS-03 run ledger + gate
   ↓
VS-04 generic Agent Template
   ↓
VS-05 scoped child methods
   ↓
VS-06 planning function
   ↓
VS-07 delivery function
   ↓
VS-08 assurance fan-out
   ↓
VS-09 release + retro + memory proposals
   ↓
VS-10 external implementation lanes
   ↓
VS-11 context-provider policy
   ↓
VS-12 full corpus migration
   ↓
VS-13 five-function resumable workflow
   ↓
VS-14 packaging, sync, and release
```

## 2. Slice summary

| Slice | Observable capability | Core change? | Primary risk retired |
|---|---|---:|---|
| VS-00 | Install package and run `doctor()` without prompt pollution | No | Package layout and kill switch |
| VS-01 | Generate complete compatibility inventory | No | Blindly importing incompatible skills |
| VS-02 | Spawn one Engineering Manager child and receive a valid plan artifact | No | Persona prompt isolation is viable |
| VS-03 | Persist a run and block Plan → Build without valid approval | No | Free-text lifecycle claims |
| VS-04 | Select a named generic Agent Template in `rlm.run` | Yes | Persona composition remains ad hoc |
| VS-05 | Child sees only selected methods; parent and siblings do not | Yes | Skill-description and method confusion |
| VS-06 | Product and engineering roles produce independent planning artifacts and synthesis | Limited | Blended planning persona |
| VS-07 | Approved build item creates bounded candidate implementation evidence | Limited | Builder self-approval and scope drift |
| VS-08 | Review, security, and QA independently gate release readiness | Limited | Combined reviewer authority |
| VS-09 | Release record and retro produce explicit memory proposals | Limited | Unsafe deployment and memory pollution |
| VS-10 | Optional Claude/Codex/Pi lanes conform to one candidate-work contract | No/limited | External lane lifecycle confusion |
| VS-11 | Function-specific jCodeMunch/Context Mode routing is bounded and degradable | Limited | Context flooding and global tool policy |
| VS-12 | Every source skill is generated, adapted, or quarantined with provenance | No | Partial/unsafe corpus migration |
| VS-13 | Greenfield and brownfield runs resume through all five functions | Yes | End-to-end orchestration and recovery |
| VS-14 | Reproducible package installation, source sync, upgrade, and rollback | No | Operational drift |

## 3. Merge gates between slices

### After VS-00

Proceed only when:

- package install/uninstall is reversible;
- root prompt delta is measured;
- package disabled mode is indistinguishable from baseline.

### After VS-03

Proceed to core changes only when:

- one real role child can produce and submit an artifact;
- run ledger recovery is tested;
- a gate rejects missing or malformed evidence;
- package-only prototype limitations are documented.

### After VS-05

Proceed to multiple roles only when:

- parent skill list is unchanged;
- sibling skill lists are isolated;
- selected hidden methods can be made visible only in the selected child;
- missing skill IDs fail deterministically;
- daemon-backed and inline children agree.

### After VS-08

Proceed to release behavior only when:

- three assurance decisions remain independent;
- a rejection blocks the workflow;
- reviewer workspace mutation is detected;
- builder cannot satisfy review gates.

### After VS-12

Proceed to default enablement only when:

- inventory coverage is 100%;
- no quarantined workflow is model-invocable;
- license/provenance verification passes;
- prompt-budget benchmarks pass.

## 4. Parallelization policy

Within one slice, parallel agents may work on disjoint tasks only when the integration point is stable.

Safe parallel examples:

- schema fixture creation versus documentation;
- source inventory fixtures versus report renderer;
- independent role prompt adaptation after role schema is fixed;
- method-card generation for disjoint source groups;
- reviewer/security/QA role tests after template APIs stabilize.

Unsafe parallel examples:

- simultaneous changes to `agent-session.ts` child creation;
- simultaneous changes to extension runtime types and loader semantics;
- independent edits to one generated manifest;
- multiple agents modifying package installation behavior;
- parallel work on a schema while consumers are still changing it.

## 5. Release strategy

Feature exposure progresses as follows:

```text
VS-00–VS-03: package installed manually; no core settings
VS-04–VS-05: experimental generic core flags, default off
VS-06–VS-12: package opt-in; core remains inert without template use
VS-13: project-local pilot
VS-14: versioned package release; still opt-in
```

Do not make the factory package a Prime built-in during this roadmap.
