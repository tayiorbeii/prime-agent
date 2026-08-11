# VS-04 — Add a Generic Agent Template Registry and `rlm.run(template=...)`

## Slice status

```text
Prerequisites: VS-03 complete and package-only limitations documented
Core Prime changes: yes
Paperclip package changes: yes, only to register/use one template
Primary proof: a trusted extension can register a named child template, and an RLM child receives its prompt/model/thinking/tool policy without changing parent or default RLM behavior
```

## 1. Observable outcome

With the experimental capability enabled and the Paperclip package installed:

```python
handle = await rlm(
    "Produce the technical plan for assignment asg-001.",
    name="pfk-eng-manager-asg-001",
    template="paperclip/template/engineering-manager",
)
```

creates a child whose effective configuration includes:

- the registered Engineering Manager child-only instructions;
- the template's requested thinking level, clamped to model support;
- the template's active/allowed tool policy;
- template metadata persisted with the child registry entry;
- the ordinary parent task prompt.

The parent:

- receives no Engineering Manager prompt append;
- retains its model, thinking level, tools, and resources;
- behaves exactly as before when `template` is omitted;
- rejects an unknown template before admitting a child.

This slice does **not** scope method skills. That is VS-05.

## 2. User story

> As a package author, I can register a reusable child-agent template and select it exactly by ID when delegating work, without constructing persona prose ad hoc in every task and without changing the parent agent.

## 3. Generic boundary

Prime core may know:

```text
AgentTemplateDefinition
template registration
template collision rules
template resolution
child-only prompt append
child model/thinking/tool overrides
template ID persistence
```

Prime core must not know:

```text
Paperclip
Engineering Manager
business functions
planning gates
method IDs
release policy
```

The Paperclip extension is the first consumer, not a special case.

## 4. Minimal template contract

Introduce a conservative v1 type:

```ts
export interface AgentTemplateDefinition {
  id: string;
  label: string;
  description: string;

  /** Child-only supplemental system instructions. */
  systemPromptAppend?: string;

  /** Optional exact model selector. Omit to inherit the parent model. */
  model?: string;

  /** Optional child reasoning level. */
  thinkingLevel?: ThinkingLevel;

  /** Active tool names for the child. */
  activeTools?: string[];

  /** Maximum tool allowlist; active tools must be a subset. */
  allowedTools?: string[];

  /** JSON-serializable attribution, not prompt content. */
  metadata?: Record<string, string | number | boolean | null>;
}
```

Do not include methods/skills, memory scopes, workflow states, or workspace paths yet.

### 4.1 Validation

IDs:

```text
1–128 characters
lowercase letters, digits, slash, hyphen, period
no whitespace
no leading/trailing slash
no `..` path segment
```

Prompt append:

- normalize line endings;
- reject NUL;
- bounded by a documented character limit, suggested 32,000;
- preserve exact content otherwise.

Tools:

- no duplicates;
- every active tool must be allowed when `allowedTools` exists;
- resolve names against the actual child tool catalog before admission;
- unknown tools fail rather than disappear silently.

Metadata:

- recursively JSON-serializable;
- bounded serialized size;
- never used as instructions.

## 5. Registration API

Add an extension API analogous to trusted resource/provider registration:

```ts
pi.registerAgentTemplate(definition);
```

Registration occurs while extensions load. The runtime owns an immutable registry after load.

Expose read-only discovery for commands/diagnostics:

```ts
pi.getAgentTemplates(): readonly AgentTemplateDefinition[];
```

Do not make template descriptions part of the model's system prompt. Template discovery is operator/package-facing, not another model-routing catalog.

### 5.1 Collision policy

Duplicate exact IDs from different registrations are a load diagnostic and the duplicate is unusable.

Do not use “last writer wins.” It would allow package order to change persona identity.

Record source information:

```text
extension path/package identity
registration order
template ID
```

The Paperclip `doctor()` must report duplicate/unavailable templates.

## 6. RLM wire contract

Extend `rlm.run` accepted kwargs:

```python
template="paperclip/template/engineering-manager"
```

No other new kwargs in this slice.

Add a normalization helper near existing name/model normalization:

```ts
normalizeRequestedRlmSubagentTemplate(value: unknown): string | undefined
```

The host:

1. validates `template` type/shape;
2. resolves exact ID from the parent session's loaded extension registry;
3. fails before child admission when absent/invalid;
4. resolves template model or parent model;
5. resolves thinking/tool policy;
6. creates the child;
7. persists template ID and a safe metadata snapshot.

Unknown kwargs must continue to fail.

## 7. Prompt composition

The child's effective system prompt should be composed in a stable order:

```text
Prime base system prompt
project context files
ordinary loaded skills/resources
existing extension prompt changes
template supplemental section
continual harness overview
```

Audit current actual order and choose the least disruptive insertion point. The template section must be clearly delimited:

```text
<agent-template id="paperclip/template/engineering-manager">
...
</agent-template>
```

Do not mutate the package role file or parent resource loader. Do not append persona text to the child user task as the final design; VS-02's prompt compilation remains only a fallback while the experimental feature is disabled.

Template prompt append must be included in compaction/rebuild/resume consistently. It should be reconstructed from the persisted template attribution and currently loaded template, with a deterministic policy for version drift:

- existing active child keeps a persisted resolved prompt hash and, preferably, resolved text in session metadata;
- a fresh child uses the current definition;
- resuming an existing child must not silently switch persona because a package updated.

The minimal acceptable implementation may persist the resolved append in child session metadata rather than only an ID.

## 8. Model and thinking resolution

Precedence:

```text
explicit rlm.run model
  > template model
  > parent model
```

For this slice, explicit `model=` and `template=` may coexist.

Thinking:

```text
template thinking level
  > inherited parent thinking level
```

Clamp using existing model capability helpers.

Service tier continues current behavior unless a future template field adds it.

## 9. Tool resolution

Precedence:

```text
template allowedTools narrows parent allowed tools
template activeTools selects within effective allowed tools
otherwise inherit current parent behavior
```

A template may never expand beyond a parent session's hard `allowedToolNames`.

For example:

```text
parent allowed = [ipython]
template allowed = [ipython, bash]
effective allowed = [ipython]
```

Fail when a template explicitly requires a tool unavailable under the parent hard boundary. Do not silently run the role with materially different capabilities.

## 10. Experimental enablement

Add a generic, default-off setting. Suggested shape:

```jsonc
{
  "rlm": {
    "agentTemplates": {
      "enabled": true
    }
  }
}
```

Adapt to existing settings style after inspecting the current schema. Requirements:

- default false during this roadmap;
- when false, `template` produces an actionable disabled-feature error;
- ordinary `rlm()` remains unchanged;
- template registration may still be diagnosable without activating launches;
- no Paperclip-specific key in Prime core.

The package's `doctor()` reports setting state and instructions.

## 11. Likely core change map

Audit current code; expected areas:

```text
packages/coding-agent/src/core/extensions/types.ts
packages/coding-agent/src/core/extensions/loader.ts or runtime registry
packages/coding-agent/src/core/extensions/runner.ts
packages/coding-agent/src/core/rlm-runtime.ts
packages/coding-agent/src/core/agent-session.ts
packages/coding-agent/src/core/agent-session-runtime.ts
packages/coding-agent/src/core/agent-session-services.ts
packages/coding-agent/src/core/settings-manager.ts
packages/coding-agent/docs/rlm-runtime.md
packages/coding-agent/docs/extensions.md
packages/coding-agent/CHANGELOG.md
prime-agent-runtime/src/rlm/__init__.py only if Python validation/docs require it
```

Avoid putting the registry in a process-global singleton. Extension/resource state is cwd/session-specific.

## 12. Paperclip package adaptation

Register one template from the compact role file:

```text
paperclip/template/engineering-manager
```

Its template includes:

```text
label
description
systemPromptAppend
thinkingLevel=high
activeTools=[ipython]
allowedTools=[ipython]
metadata organization/function/role/source hash
```

Change VS-02/VS-03 assignment spawning to:

- use `template=` when enabled;
- retain the package-only compiled-prompt fallback behind an explicit compatibility path while this feature is experimental;
- record which mode was used;
- never inject both prompt forms.

## 13. Non-goals

Do not:

- scope skills;
- add function manifests to core;
- add child `cwd`;
- add memory namespaces;
- add template fuzzy search;
- show all templates in the model prompt;
- let a user-authored untrusted project file register executable extension code;
- change default RLM child behavior;
- migrate existing children automatically.

## 14. Test-first implementation

### 14.1 Red — registration and collision

In extension runner/loader tests:

- one extension registers one template;
- read-only registry exposes it;
- duplicate ID from two extensions produces a deterministic diagnostic;
- invalid ID/prompt/tool config rejects;
- registry is isolated between separate resource loaders.

### 14.2 Red — unknown/disabled template

In recursion tests:

- `template=123` rejects;
- empty template rejects;
- unknown ID rejects before child directory/registry admission;
- known template with setting disabled rejects actionably;
- omission preserves existing successful child behavior.

### 14.3 Red — child-only prompt

Capture parent and child provider contexts:

- parent system prompt lacks sentinel;
- child system prompt contains sentinel exactly once;
- child user task does not duplicate the sentinel;
- second child without template lacks it;
- resumed child retains the same resolved prompt/hash.

### 14.4 Red — precedence and boundaries

Cases:

```text
template model only
explicit model overrides template
template thinking clamps
template active tool valid
template tool unavailable
template attempts to expand parent hard allowlist
```

### 14.5 Red — inline/daemon parity

Exercise both runtime paths with the same template and assert equivalent:

```text
template ID
resolved prompt hash
model
thinking
active tools
allowed tools
```

Any daemon protocol metadata change must follow root compatibility/capability rules. Prefer avoiding new client wire fields if template data remains worker-side.

### 14.6 Green/refactor

Create one shared template-resolution function used before both inline and daemon runtime creation. Do not duplicate policy in two paths.

## 15. Focused test commands

Expected:

```bash
cd packages/coding-agent
npx tsx ../../node_modules/vitest/dist/cli.js --run test/extensions-runner.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/agent-session-recursion.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/daemon-rlm-lifecycle.test.ts
```

Use actual adjacent daemon test names found in the current checkout.

Package:

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/engineering-manager-template.test.ts
```

Then root `npm run check`.

## 16. Manual verification

1. Enable the experimental setting project-locally.
2. Install package.
3. `doctor()` shows one registered template.
4. Spawn a generic child without template; verify baseline.
5. Spawn Engineering Manager template child.
6. Observe child configuration and artifact production.
7. Disable setting; verify template launch fails while ordinary RLM works.
8. Update role file, resume the existing child, and verify its resolved persona does not silently change.
9. Start a new child and verify it uses the new template version.

## 17. Acceptance criteria

- [ ] Trusted extensions can register validated templates.
- [ ] Duplicate IDs never resolve by load order.
- [ ] `rlm.run(template=...)` resolves exact IDs only.
- [ ] Unknown/disabled templates fail before admission.
- [ ] Parent and siblings do not receive template prompt text.
- [ ] Existing RLM calls are behaviorally unchanged.
- [ ] Parent hard tool restrictions cannot be expanded.
- [ ] Inline and daemon children resolve identically.
- [ ] Existing child persona is stable across package reload/update.
- [ ] Template catalog is not injected into the model prompt.
- [ ] Focused tests and `npm run check` pass.

## 18. Rollback

Disable `rlm.agentTemplates.enabled`. Keep registration inert and preserve ordinary name/model RLM behavior. The Paperclip package falls back to its VS-02 prompt-compiled pilot or blocks with a clear requirement, depending on configured policy.

## 19. Required completion evidence

Include:

```text
template definition fixture
duplicate-ID diagnostic
unknown-template rejection before admission
parent/child prompt captures
model/thinking/tool precedence table with results
inline/daemon parity result
resume/version-drift result
baseline RLM regression result
```

## 20. Copy-ready implementation prompt

Use [`../prompts/VS-04-PROMPT.md`](../prompts/VS-04-PROMPT.md).
