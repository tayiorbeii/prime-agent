# Prime Agent Core Change Map

This map identifies likely seams. Each slice must re-read current code because upstream may have changed after `a18809e00ea30638584d87b3afea7285a9d7296c`.

## 1. No-core package work

Primary new location:

```text
packages/paperclip-factory/
```

The root workspace already includes `packages/*`, so adding this directory makes it a workspace automatically. Start the package as private and opt-in.

Likely files:

```text
packages/paperclip-factory/package.json
packages/paperclip-factory/extensions/paperclip-factory.ts
packages/paperclip-factory/skills/paperclip-factory/SKILL.md
packages/paperclip-factory/skills/paperclip-factory/pyproject.toml
packages/paperclip-factory/skills/paperclip-factory/src/paperclip_factory/*
packages/paperclip-factory/organization/*
packages/paperclip-factory/scripts/*
packages/paperclip-factory/test/*
```

## 2. Agent Template registry

Likely files:

### `packages/coding-agent/src/core/extensions/types.ts`

Add:

- `AgentTemplateDefinitionV1`;
- `ExtensionAPI.registerAgentTemplate`;
- introspection method for tests/debugging if necessary.

Do not add role-specific fields. Keep generic names.

### `packages/coding-agent/src/core/extensions/loader.ts`

Extend the extension runtime with a template registry:

- exact ID validation;
- duplicate detection with source paths;
- deterministic registration order;
- immutable or cloned returned definitions.

### `packages/coding-agent/src/core/extensions/runner.ts`

Expose template registry to session creation without injecting all template descriptions into prompts.

### `packages/coding-agent/src/core/rlm-runtime.ts`

Extend supported RLM run options with:

```text
template
```

The first template slice may also use existing internal thinking/tool fields. Do not expose arbitrary environment or capability objects in v1.

### `packages/coding-agent/src/core/agent-session.ts`

At RLM admission:

1. parse `template`;
2. resolve exact template ID;
3. apply the template as a child-only supplemental system-prompt section using explicit delimiters;
4. keep the ordinary user task separate from persona instructions;
5. clamp thinking level against the selected model;
6. intersect template tools with parent-allowed tools;
7. record template ID and resolved prompt hash in child metadata;
8. reject missing/invalid templates before returning a spawn handle.

### `packages/coding-agent/src/core/agent-session-runtime.ts`

Carry template-derived options through daemon-backed and inline child creation. Ensure both paths use the same merge helper.

### `packages/coding-agent/src/core/agent-session-services.ts`

Only change if child creation needs a resource-loader override or template registry access. Avoid creating a second service graph merely for prompt text.

### Tests

Likely focused files:

```text
packages/coding-agent/test/agent-session-recursion.test.ts
packages/coding-agent/test/extensions-runner.test.ts
packages/coding-agent/test/agent-template-registry.test.ts
```

## 3. Scoped child resources

Add a new focused module rather than enlarging `resource-loader.ts` excessively:

```text
packages/coding-agent/src/core/scoped-resource-loader.ts
```

Responsibilities:

- wrap a `ResourceLoader`;
- filter skills by exact name;
- optionally expose selected hidden skills;
- preserve diagnostics;
- delegate non-scoped resources;
- never mutate base arrays or objects.

Changes likely required in:

### `packages/coding-agent/src/core/rlm-runtime.ts`

Carry a resolved resource scope, not unvalidated user input.

### `packages/coding-agent/src/core/agent-session.ts`

Create a scoped loader after template resolution and pass it to the child.

The baseline child path currently passes `resourceLoader: this._resourceLoader`. Replace only for a template with a resource scope.

### `packages/coding-agent/src/core/agent-session-runtime.ts`

Daemon-backed runtime creation rebuilds services. Ensure it receives either:

- a resource-loader override; or
- a deterministic `resourceScope` applied through `DefaultResourceLoaderOptions.skillsOverride`.

Prefer one shared helper for inline and daemon paths.

### `packages/coding-agent/src/core/agent-session-services.ts`

Possible addition:

```ts
resourceLoaderOverride?: ResourceLoader
```

or:

```ts
resourceScope?: ResourceScope
```

Choose the option that keeps child creation behavior identical across hosts.

### `packages/coding-agent/src/core/system-prompt.ts`

No Paperclip-specific change. Verify that the child system prompt renders only `resourceLoader.getSkills()` results and respects `disable-model-invocation`.

### `packages/coding-agent/src/core/tools/ipython.ts`

Verify Python-backed skills passed to `buildRlmBootstrapCode` come from the scoped loader. Modify only if tests prove they do not.

### Tests

```text
packages/coding-agent/test/resource-loader.test.ts
packages/coding-agent/test/agent-session-recursion.test.ts
packages/coding-agent/test/suite/agent-session-prompt.test.ts
```


## 4. Child working-directory support

VS-07 may require one additional generic RLM option so a child session is truly cwd-bound to an isolated git worktree.

Likely files:

```text
packages/coding-agent/src/core/rlm-runtime.ts
packages/coding-agent/src/core/agent-session.ts
packages/coding-agent/src/core/agent-session-runtime.ts
packages/coding-agent/src/core/agent-session-services.ts
packages/coding-agent/src/core/session-manager.ts, only if current factories cannot bind the target cwd
```

Requirements:

- canonical existing directory;
- parent cwd unchanged;
- child services, context files, settings, kernel, and session manager use the child cwd;
- inline and daemon paths share one resolver;
- omission preserves current inheritance;
- Paperclip worktree policy remains package-owned.

Tests belong beside existing recursion/runtime/cwd tests. Do not add git-worktree semantics to Prime core.

## 5. RLM Python surface

Likely files:

```text
prime-agent-runtime/src/rlm/__init__.py
prime-agent-runtime/src/rlm/types.py, if present
packages/coding-agent/docs/rlm-runtime.md
```

The Python shim already forwards generic kwargs, so a code change may not be required for `template`. Add documentation and type hints only if they remain truthful.

Do not turn `rlm` into a Paperclip-specific API. Business-facing helpers belong in `paperclip_factory`.

## 6. Run and gate engine

Keep the first run ledger in the package. A later generic host engine may add:

```text
packages/coding-agent/src/core/organization/
  registry.ts
  run-store.ts
  gate-engine.ts
  artifact-validator.ts
```

Do not add this directory until VS-13 demonstrates that host authority is necessary beyond the package’s file-backed implementation.

If host requests are introduced for Python:

```text
organization.run.create
organization.run.get
organization.run.submit
organization.run.transition
```

Use the existing typed `host.request` bridge. Do not add model-facing tools.

## 7. Continual harness changes

Avoid core harness schema changes until memory proposals work in package metadata.

If function-scoped querying later requires core changes, likely files are:

```text
prime-agent-runtime/src/rlm/harness.py
packages/coding-agent/src/core/refinement/*
packages/coding-agent/src/core/system-prompt.ts
```

Any change must address current local/global semantics, child visibility, prompt overview limits, and migration of existing state. This is explicitly deferred from the initial port.

## 8. Daemon compatibility

Most template/scoped-resource work occurs inside the worker runtime. Nevertheless:

- inspect whether template ID or resource scope enters persisted daemon metadata;
- treat new optional metadata as capability-gated when visible to clients;
- do not add a required startup command;
- update protocol/schema revisions only when required by actual wire changes;
- add old/new compatibility tests for any wire-visible field.

## 9. Documentation and changelog

Core behavior changes require:

```text
packages/coding-agent/docs/rlm-runtime.md
packages/coding-agent/docs/extensions.md
packages/coding-agent/docs/skills.md
packages/coding-agent/CHANGELOG.md
```

Package behavior requires:

```text
packages/paperclip-factory/README.md
packages/paperclip-factory/CHANGELOG.md
```

Changelog entries must describe user-visible behavior and follow the repository’s flat `[Unreleased]` format.
