# VS-11 — Add Function-Specific Context Provider Policy for jCodeMunch, Context Mode, and Bounded Native Fallback

## Slice status

```text
Prerequisites: VS-06 through VS-09 function contracts exist; VS-05 scoped resources complete
Core Prime changes: none required for the policy slice
Paperclip package changes: yes
External integrations: optional; detected, never assumed
Primary proof: each function receives a small explicit context policy instead of global read/write replacement or every context tool
```

## 1. Observable outcome

The operator can inspect:

```python
await paperclip_factory.explain_context_policy(
    run_id,
    function="paperclip/function/delivery",
)
```

and see a resolved policy such as:

```text
code.structure:
  provider: jcodemunch
  status: available
  fallback: bounded-native

content.index:
  provider: context-mode
  status: available
  fallback: artifact-search

output.materialization:
  provider: prime-artifacts
  status: available
```

When a role child is admitted:

- only providers required or preferred by that function are exposed;
- the role prompt receives concise routing guidance;
- provider use and fallback are recorded;
- root agent is not forced through these tools;
- native exact/bounded reads remain possible;
- provider outage does not strand coding work;
- governance evidence requirements still fail closed.

## 2. User story

> As an operator, I can use jCodeMunch for structured code retrieval and Context Mode for large documents/logs where they add value, without globally disabling Prime's native capabilities or teaching every business role every context tool.

## 3. Capability aliases

Paperclip manifests refer to vendor-neutral capabilities:

```text
code.structure
content.index
output.materialization
run.history
web.research
```

Provider bindings are project configuration:

```jsonc
{
  "paperclipFactory": {
    "contextProviders": {
      "code.structure": {
        "preferred": "jcodemunch",
        "fallback": "bounded-native"
      },
      "content.index": {
        "preferred": "context-mode",
        "fallback": "artifact-search"
      },
      "output.materialization": {
        "preferred": "prime-artifacts",
        "fallback": "run-evidence"
      }
    }
  }
}
```

Do not put provider names directly into every role definition.

## 4. Function policy matrix

| Function/role | `code.structure` | `content.index` | `output.materialization` |
|---|---|---|---|
| Orchestration | none by default | run artifacts only | yes |
| Product planning | optional | preferred for research/requirements | yes |
| Engineering planning | preferred for unfamiliar code | optional | yes |
| Delivery | preferred | optional for docs/logs | required |
| Staff review | preferred | optional | required |
| Security | preferred | preferred for large scans/logs | required |
| QA | optional | preferred for test/browser logs | required |
| Release | optional | preferred for deployment logs | required |
| Retro | none/optional | preferred for run evidence | required |

A role gets only the applicable provider skills/instructions.

## 5. Provider adapter contract

Package-level interface:

```ts
interface ContextProviderAdapter {
  id: string;
  capabilities: readonly ContextCapability[];

  detect(ctx: ContextProviderDetectionContext):
    Promise<ContextProviderStatus>;

  buildRoleGrant(input: ContextGrantInput):
    Promise<ResolvedContextGrant>;

  summarizeUsage(events: ContextAccessEvent[]):
    ContextUsageSummary;
}
```

The adapter does not need to proxy every call. It may grant an installed Python-backed skill/MCP integration and supply concise guidance.

## 6. jCodeMunch adapter

Purpose:

```text
symbol search
file outlines
exact symbol retrieval
references/imports
blast radius
changed-symbol analysis
bounded task context
```

Routing guidance:

```text
Use jCodeMunch before broad source reads.
Use exact native reads for small files, generated content, unsupported languages,
or verification after locating the relevant code.
Do not use jCodeMunch as a writer.
```

Grant it to selected planning/delivery/assurance templates only.

Health checks:

```text
integration/skill installed
server reachable
workspace indexed
index workspace matches child cwd/worktree
freshness known
```

A worktree child must query an index scoped to that worktree or a commit/snapshot that exactly matches it. Never reuse an index whose source bytes differ without marking stale and falling back.

## 7. Context Mode adapter

Purpose:

```text
large web pages/documents
logs and test output
API/export payloads
searchable indexed artifacts
explicit stateless processing
```

Initial grant should expose only selected safe operations:

```text
index
search
fetch-and-index
execute/batch-execute when explicitly needed
```

Do not expose upgrade/purge administration to autonomous role children.

Routing guidance:

```text
Use Context Mode for large non-code material or deliberately off-context processing.
Do not route ordinary source-code exploration through it when structured code retrieval exists.
Do not enable a second automatic session-memory authority.
```

Keep Context Mode's automatic resume/memory injection disabled for Paperclip runs unless a later plan explicitly reconciles it with Prime's run ledger and harness.

## 8. Output materialization

Provider calls, tests, external lanes, and IPython can produce large outputs.

Preferred behavior:

```text
small result → bounded inline
large result → full run evidence artifact + preview + handle
```

If a generic Prime context-artifact store already exists, bind `prime-artifacts`. Otherwise use package `run-evidence`:

```text
runs/<id>/evidence/context/<artifact-id>
```

Return:

```text
handle
source
character/line count
hash
bounded preview
search/read instructions
```

No single context-provider result should inject tens of thousands of characters by default.

## 9. Bounded native fallback

When preferred provider is unavailable:

### Code

Allow:

```text
exact file known
bounded line/range
small file under configured byte/line threshold
git diff/status
targeted rg/find
```

Warn or materialize:

```text
whole large file
large directory dump
raw API/web body
unbounded test log
```

This policy is context optimization, not a security sandbox.

Do not reproduce the user's regular Pi hook by trying to block every possible Python `open()` call. Prime's single IPython surface makes that incomplete. Control the role prompt, resource grants, and output boundary.

## 10. Context access records

Record:

```json
{
  "schema": "paperclip.context-access/v1",
  "runId": "...",
  "assignmentId": "...",
  "capability": "code.structure",
  "provider": "jcodemunch",
  "operation": "get_symbol_source",
  "status": "success",
  "inputSummary": "auth handler",
  "outputArtifactRef": null,
  "inlineCharacters": 1840,
  "fallbackUsed": false,
  "timestamp": "..."
}
```

Do not record source bodies, secrets, queries containing credentials, or full tool arguments by default.

## 11. Prompt budget and method interaction

The role prompt gets no provider tool catalog dump.

Include only:

```text
selected capability
preferred provider
two or three routing rules
fallback behavior
```

Method skills remain methodology. Context providers supply evidence. A method must not imply a provider is available.

## 12. Failure semantics

| Failure | Behavior |
|---|---|
| provider missing at admission | use declared fallback or block if capability required |
| provider fails mid-task | record failure; bounded fallback |
| jCodeMunch stale/mismatched worktree | do not trust; refresh or fallback |
| Context Mode unavailable | use run evidence/artifact search |
| output too large | materialize |
| provider returns secret | redaction/materialization policy; alert |
| context helper unavailable for a gate-required test | gate may remain blocked due to missing evidence |
| both preferred and fallback unavailable | assignment blocked with exact capability |

Governance gates fail closed on missing required evidence. Optional context retrieval fails open.

## 13. Non-goals

Do not:

- implement a new MCP transport;
- bundle or fork jCodeMunch/Context Mode source;
- globally disable native reads/writes;
- inject Context Mode memory automatically;
- expose provider admin tools;
- make providers mandatory for package installation;
- route all code through Context Mode;
- add model-based provider selection.

## 14. Test-first implementation

Use fake adapters.

### 14.1 Red — function grant matrix

Assert each role receives exact capabilities/provider skills and no others.

### 14.2 Red — root/sibling isolation

Root provider prompt delta is zero unless the root explicitly invokes a control operation. Product child does not receive delivery-only code provider grants, and so on.

### 14.3 Red — fallback

Simulate:

```text
preferred available
preferred unavailable
preferred fails mid-call
stale worktree index
no fallback
```

Assert recorded policy and assignment outcome.

### 14.4 Red — output materialization

Synthetic 200,000-character result becomes artifact + bounded preview. Small result remains inline. Hash and retrieval path verified.

### 14.5 Red — secret handling

Synthetic result contains fake token. Ensure bounded rendered summary is redacted and access event stores no raw secret.

### 14.6 Red — gate evidence

QA required test evidence unavailable despite context fallback. Gate remains blocked rather than being waived.

### 14.7 Green/refactor

Keep provider binding, role grant, and usage recording separate. Do not entangle provider details with function state reducer.

## 15. Focused test commands

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/context-provider-policy.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/context-provider-isolation.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/context-provider-fallback.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/context-output-materialization.test.ts
```

Run Prime scoped resource tests if provider skills affect child loader. Then root `npm run check`.

## 16. Manual verification

With integrations installed when available:

1. run `doctor()` and provider explanation;
2. spawn Engineering Manager in unfamiliar repo and verify structured code path;
3. spawn Product role with long requirements and verify indexed content path;
4. disconnect each provider and observe fallback;
5. use a worktree with changed source and verify stale-index detection;
6. generate a large test log and verify materialization;
7. inspect root prompt and provider grants.

## 17. Acceptance criteria

- [ ] Function manifests use vendor-neutral capability names.
- [ ] Provider binding is exact/configurable.
- [ ] Root is not globally forced through providers.
- [ ] Role grants follow the policy matrix.
- [ ] jCodeMunch worktree freshness/match is validated.
- [ ] Context Mode is used for non-code bulk context, not automatic memory authority.
- [ ] Large output is materialized.
- [ ] Optional provider outage has bounded fallback.
- [ ] Missing required gate evidence still blocks.
- [ ] Access records contain no raw source/secrets.
- [ ] Focused tests and `npm run check` pass.

## 18. Rollback

Disable provider bindings. Templates keep their role/method scopes and use bounded native/run-evidence fallbacks. The factory remains usable without either third-party integration.

## 19. Required completion evidence

Include:

```text
resolved policy for each function
root and child provider grants
available/unavailable/failing adapter results
stale worktree index result
large-output artifact and preview
secret non-disclosure test
gate blocked on missing required evidence
```

## 20. Copy-ready implementation prompt

Use [`../prompts/VS-11-PROMPT.md`](../prompts/VS-11-PROMPT.md).
