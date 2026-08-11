# VS-05 — Add Immutable Child-Scoped Skill Views and Expose Only Selected Methods

## Slice status

```text
Prerequisites: VS-04 complete
Core Prime changes: yes
Paperclip package changes: yes
Primary proof: a template child sees only its exact selected Paperclip methods while parent and sibling resource views remain unchanged
```

## 1. Observable outcome

The Paperclip Engineering Manager template can declare:

```json
{
  "skills": {
    "inheritVisible": false,
    "include": [
      "agent-message",
      "pfk-domain-driven-design",
      "pfk-system-design",
      "pfk-ddia-systems"
    ],
    "exposeHidden": [
      "pfk-domain-driven-design",
      "pfk-system-design",
      "pfk-ddia-systems"
    ]
  }
}
```

When spawned:

- the child startup skill list includes Prime-required runtime skills plus exactly those three Paperclip methods;
- each selected `pfk-*` method was hidden in the parent;
- the parent still sees only `paperclip-factory` from the package;
- an unrelated child sees none of those methods;
- the child can load the selected `SKILL.md` by its real path;
- unknown, ambiguous, or disallowed skill IDs fail before child admission;
- no shared `Skill` object or resource loader is mutated.

## 2. User story

> As a role-template author, I can give a child only the methods needed for its assignment, including methods hidden from normal model routing, without flooding the root agent or contaminating other children.

## 3. Source strategy for hidden methods

Generate a small vetted set for this slice:

```text
pfk-domain-driven-design
pfk-system-design
pfk-ddia-systems
```

Each generated method:

- lives in the package's registered skill resource tree;
- uses a namespaced directory/name;
- has `disable-model-invocation: true`;
- preserves source commit/path/hash/license;
- is classified `native` or explicitly adapted;
- has no Claude/Hermes/gstack host instructions;
- contains a bounded Prime-facing `SKILL.md`;
- may link to references within its own directory.

The root resource loader may know the hidden skill metadata, but the system prompt omits it under existing Prime behavior.

## 4. Generic resource-scope contract

Extend the Agent Template definition:

```ts
export interface AgentTemplateSkillScope {
  /**
   * Inherit parent model-visible skills before applying include/exclude.
   * Default true for backward-compatible generic templates.
   */
  inheritVisible?: boolean;

  /** Exact skill names to include in the child view. */
  include?: string[];

  /** Exact skill names to exclude. */
  exclude?: string[];

  /**
   * Exact included hidden skills whose disableModelInvocation flag is
   * promoted to visible in this child view only.
   */
  exposeHidden?: string[];
}
```

Do not support globs, tags, fuzzy search, or `*` in persisted production templates.

### 4.1 Effective selection

Define categories:

```text
parent visible skills
parent hidden skills
Prime-required runtime skills
explicit includes
explicit excludes
explicit exposed hidden skills
```

Suggested algorithm:

1. snapshot parent `getSkills()` result;
2. determine runtime-required skills from enabled host facilities;
3. start with parent visible skills only when `inheritVisible=true`;
4. add exact `include` matches;
5. add runtime-required skills;
6. apply `exclude`, except exclusion of a required runtime skill is an error;
7. ensure every `exposeHidden` entry is included and exists;
8. clone selected skill records;
9. set `disableModelInvocation=false` only on child clones named in `exposeHidden`;
10. preserve original diagnostics and add scope diagnostics;
11. freeze or treat the result immutably.

A template must not expose a hidden skill merely by listing it in `include`; visibility promotion is explicit.

## 5. Runtime-required skill floor

Audit which Python-backed skills are required for child operation. At minimum, RLM children commonly need `agent-message` to reply to the parent.

Do not hardcode a broad user-facing “always include all built-ins” rule. Introduce a small host-derived requirement set based on active features:

```text
agent-message when parent/child messaging is enabled
goal when goals are enabled for that child
compact only when agent-callable compaction is enabled
```

A required skill remains visible only if current Prime behavior expects it visible. The scope system must preserve executable Python runtime availability and prompt guidance consistently.

Document the distinction:

```text
runtime-required Prime skills are infrastructure
selected pfk-* skills are role methods
```

## 6. Scoped resource-loader design

Create a generic `ScopedResourceLoader` or equivalent immutable wrapper implementing `ResourceLoader`.

It should:

- delegate extensions, prompts, themes, context files, system prompt, and reload behavior unless explicitly scoped in future;
- return a stable scoped `getSkills()` view;
- never call `extendResources()` on the parent;
- never modify `disableModelInvocation` on parent `Skill` objects;
- recompute from a captured or versioned base after reload according to a documented policy;
- surface source metadata unchanged.

For existing child session stability, resolve and persist the selected skill identities and source hashes at creation. A resumed child should not silently gain every newly installed skill. Decide whether it uses:

- persisted skill snapshot metadata plus currently resolvable files; or
- a copied session-local skill view.

The minimum safe policy is:

```text
persist exact selected names + source hashes
on resume, resolve each exact source
fail/block on missing/hash mismatch unless explicitly accepting an update
```

Do not duplicate full third-party source into session artifacts by default.

## 7. Child runtime integration

Extend the resolved `CreateRlmSubagentRuntimeOptions` with a generic resource scope or already-built scoped loader descriptor.

Use one shared constructor for:

- inline children;
- daemon-backed children.

Current inline creation passes the parent's resource loader directly. Replace that only when a scope is present. Existing unspecialized children continue to reuse parent behavior.

For daemon-backed child runtime creation, create cwd-bound services normally, then wrap the child's resource loader with the same resolved scope. Do not rely on object identity across processes.

The child kernel's Python-backed skill installation/import list must derive from the scoped loader, not the unfiltered parent list.

## 8. Prompt behavior

The child `<available_skills>` block must contain:

```text
Prime runtime-required skills
the selected exposed Paperclip methods
no other Paperclip methods
```

The parent remains:

```text
paperclip-factory
plus its existing Prime/user skills
```

The role template prompt may say which methods to use, but the authoritative method selection is the resource scope.

The method body is still loaded progressively on demand. Do not concatenate all selected method bodies into the system prompt.

## 9. Validation and failure modes

Reject before admission:

- unknown included skill;
- unknown exposed skill;
- exposeHidden not also included;
- duplicate names in a scope;
- wildcard/glob;
- collision where exact name resolves to multiple sources;
- requested hidden skill from a disallowed package/source if source constraints are implemented;
- exclusion of required runtime skill;
- source hash mismatch on strict resume;
- selected Python skill whose package is unavailable.

Return an error listing exact missing/conflicting IDs, not the entire skill catalog.

## 10. Paperclip template update

Engineering Manager gets exactly the vetted methods. The package `doctor()` reports:

```text
registered hidden methods
selected methods per template
unresolved selections
root-visible pfk methods
```

`root-visible pfk methods` must equal zero.

Add debug/operator API:

```python
await paperclip_factory.explain_template("paperclip/template/engineering-manager")
```

Return bounded metadata, not full method bodies.

## 11. Non-goals

Do not:

- add function orchestration;
- port all skills;
- add tag-based semantic routing;
- expose methods globally;
- scope prompts/themes/extensions yet;
- allow templates to install packages dynamically;
- change user skill precedence globally;
- copy source into every child artifact directory;
- add context-mode retrieval.

## 12. Test-first implementation

### 12.1 Red — immutable promotion

Build a base loader fixture with:

```text
paperclip-factory visible
pfk-system-design hidden
pfk-ddia-systems hidden
unrelated-user-skill visible
agent-message runtime required
```

Create a child scope and assert:

- selected hidden clones are visible;
- parent hidden flags unchanged;
- sibling scope unchanged;
- object references for promoted skills differ from parent;
- delegated non-skill resources remain stable.

### 12.2 Red — startup prompt isolation

Capture parent, scoped child, and unscoped child system prompts. Assert exact skill names and absence of unique method sentinels.

### 12.3 Red — Python skill runtime floor

Use a fixture Python-backed runtime skill and assert:

- required skill package is present in child kernel bootstrap info;
- excluded non-required Python skill is absent;
- child can send a parent message.

### 12.4 Red — invalid scopes

Cover every validation failure in section 9.

### 12.5 Red — inline/daemon parity

Assert same selected names, hidden promotion, source hashes, and prompt block for both paths.

### 12.6 Red — reload/resume drift

- create child with skill hash A;
- update package to hash B;
- resume child;
- strict mode reports drift rather than silently applying B;
- fresh child receives B.

### 12.7 Green/refactor

Centralize scope resolution in a pure function and loader wrapping in one implementation. Keep prompt rendering dependent on `ResourceLoader.getSkills()` rather than adding a second skill prompt path.

## 13. Focused test commands

Expected:

```bash
cd packages/coding-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/resource-loader.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/agent-session-recursion.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/system-prompt.test.ts
```

Add a focused scoped-resource test if clearer:

```bash
npx tsx ../../node_modules/vitest/dist/cli.js --run test/scoped-resource-loader.test.ts
```

Run current daemon RLM focused test and package template test. Then root `npm run check`.

## 14. Manual verification

1. List root visible skills before package.
2. Install package and list again.
3. Confirm only `paperclip-factory` is added.
4. Explain Engineering Manager template.
5. Spawn it.
6. In child, inspect `<available_skills>` and load one selected method.
7. Spawn an unrelated child and confirm no `pfk-*`.
8. Update one method file and test strict child resume drift.
9. Disable scoped resources; verify ordinary RLM remains operational.

Measure startup prompt characters for parent and child.

## 15. Acceptance criteria

- [ ] Selected hidden methods are visible only in selected child.
- [ ] Parent and sibling skill objects remain unchanged.
- [ ] Root-visible `pfk-*` count is zero.
- [ ] No wildcard selection exists.
- [ ] Unknown/ambiguous skills fail before admission.
- [ ] Runtime-required Python skills remain functional.
- [ ] Child kernel skill imports match scoped view.
- [ ] Inline/daemon paths agree.
- [ ] Resume does not silently change method versions.
- [ ] Method bodies remain progressively disclosed.
- [ ] Parent prompt and active-run budgets pass.
- [ ] Focused tests and `npm run check` pass.

## 16. Rollback

Disable experimental scoped child resources. Template children revert to inherited resources, but the Paperclip package must refuse role launches that require method isolation rather than exposing all hidden methods. The VS-02 Engineering Manager no-method fallback may remain available for diagnosis only.

## 17. Required completion evidence

Include:

```text
parent skill snapshot
child skill snapshot
sibling skill snapshot
object immutability assertion
runtime-required skill proof
invalid-scope errors
inline/daemon parity
resume drift behavior
prompt character measurements
```

## 18. Copy-ready implementation prompt

Use [`../prompts/VS-05-PROMPT.md`](../prompts/VS-05-PROMPT.md).
