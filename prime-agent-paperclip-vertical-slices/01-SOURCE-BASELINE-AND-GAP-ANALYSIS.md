# Source Baseline and Gap Analysis

## 1. Pinned baselines

### Prime Agent

Commit: `a18809e00ea30638584d87b3afea7285a9d7296c`

Relevant verified behavior:

- Prime packages can bundle extensions, skills, prompts, and themes.
- Skills are progressively disclosed: descriptions appear in the system prompt, full bodies load on demand.
- `disable-model-invocation: true` hides a skill from the startup list while preserving explicit invocation.
- Python-backed skills install into the persistent IPython kernel.
- RLM children are real `AgentSession` instances.
- `rlm.run` currently supports `name` and `model`; unknown kwargs fail.
- A child inherits the parent model unless overridden.
- Child creation already carries model, thinking level, active tools, allowed tools, custom tools, and depth internally.
- Child creation currently reuses the parent `ResourceLoader`.
- `DefaultResourceLoader` already supports `skillsOverride`, `agentsFilesOverride`, and other resource overrides.
- Extensions can mutate the per-turn system prompt through `before_agent_start`.
- The continual harness stores prompt, memory, skill, and subagent records, but is not itself an execution engine.

### Paperclip Factory Kit Hermes port

Commit: `28733e96246d325f3cb9a28225c167ce1c03bf75`

Relevant verified behavior and design intent:

- The source model contains ten atomic roles.
- The Hermes prototype combines them into five durable profiles.
- The operating loop is `think → plan → build → review → test → ship → reflect`.
- The main workflow has founder, product, engineering, optional DevEx, build, review/security, QA/ship/retro stages.
- Gate ownership is explicit.
- The mirrored corpus contains 86 method/workflow skills.
- The current Hermes installer maps skill subsets to five profiles.
- The current plan explicitly warns against dumping ten profiles and 86 un-namespaced skills into the harness.
- Wondel-style method skills are generally portable.
- gstack/Claude-oriented skills contain harness-specific assumptions and require adaptation.

## 2. Source availability caveat

The public GitHub API returned `404` for `tayiorbeii/paperclip-factory-kit` during preparation. Therefore:

1. Treat the Hermes mirror as the available planning baseline.
2. Support an environment or CLI override such as:

   ```bash
   PAPERCLIP_SOURCE_DIR=/absolute/path/to/paperclip-factory-kit
   ```

3. Prefer the configured source checkout over mirrored content.
4. Record source hashes so a later source checkout can prove equivalence or drift.
5. Never infer that the mirror is complete merely because it contains 86 directories.

## 3. What can be implemented as a package

The following can be proven without Prime core changes:

- installable Paperclip package;
- one visible control skill;
- hidden or non-discovered method library;
- role and function manifests;
- source inventory and compatibility reports;
- file-backed run ledger;
- typed artifact validation;
- role prompts embedded into RLM child tasks;
- exact method-card injection;
- five-function orchestration at the Python skill level;
- explicit run advancement commands.

This package-first path should be exhausted before modifying core.

## 4. What requires Prime core changes

The following cannot be implemented robustly through prompt text alone:

### 4.1 Named Agent Templates

There is no package resource or extension API for registering a named child template that controls prompt, model, thinking, tools, and resources.

### 4.2 Per-child skill visibility

RLM children currently reuse the parent resource loader. The child can inherit a different active tool set internally, but not a different visible skill set.

### 4.3 Host-authoritative function capabilities

Prompt instructions can say a reviewer is read-only, but IPython remains capable of writes. The first enforceable guard can compare git state before and after review; stronger sandboxing is a separate capability.

### 4.4 Generic run/gate runtime

Prime has sessions, goals, child registries, and harness state, but no generic organization workflow state machine with typed gates.

### 4.5 Function-scoped memory

The harness distinguishes local and global scope, not organization/project/function/role/run namespaces. Namespace conventions can be prototyped in metadata before core storage changes.

## 5. High-value existing seams

| Existing seam | How this plan uses it |
|---|---|
| Package `pi` manifest | Install the factory extension and one control skill |
| `disable-model-invocation` | Prevent imported methods from polluting root routing |
| Python-backed skills | Expose `paperclip_factory.start/status/advance` inside IPython |
| `before_agent_start` | Apply a selected template’s compact role instructions |
| RLM child options | Reuse model/thinking/tool plumbing rather than rebuilding child execution |
| `skillsOverride` | Basis for a scoped child resource-loader wrapper |
| Session artifact directory | Store run ledgers and child artifacts in early slices |
| Agent messages | Notify parent that role artifacts are ready |
| Child registry | Track retained role agents |
| Harness metadata | Store proposed reusable lessons after explicit approval |

## 6. Architectural gaps to avoid solving prematurely

Do not begin by:

- inventing a general enterprise org chart UI;
- adding a new daemon protocol;
- creating ten always-running agents;
- converting every method into a Python package;
- building a general DAG engine;
- replacing Prime goals;
- replacing Prime compaction;
- changing the provider interface;
- implementing context-provider integrations before scoped roles work.

The port should create the smallest generic core primitives demanded by demonstrated package behavior.
