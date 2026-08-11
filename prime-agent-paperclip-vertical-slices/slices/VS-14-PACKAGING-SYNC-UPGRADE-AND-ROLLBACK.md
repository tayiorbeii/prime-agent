# VS-14 — Make the Port Reproducibly Installable, Upgradable, Verifiable, and Rollbackable

## Slice status

```text
Prerequisites: VS-13 complete
Core Prime changes: no new feature expected
Paperclip package changes: yes
Primary proof: a maintainer can install from a pinned package/source, preview and apply a corpus update, migrate persisted package data safely, and roll back without deleting user work
```

## 1. Observable outcome

The maintainer can:

```bash
prime-agent package install --local /absolute/path/to/packages/paperclip-factory
```

verify:

```python
await paperclip_factory.doctor()
await paperclip_factory.verify_installation()
```

preview source/package update:

```python
await paperclip_factory.plan_upgrade(
    source="/absolute/path/to/new-source",
)
```

apply after review:

```python
await paperclip_factory.apply_upgrade(
    plan_id="upgrade-...",
    expected_plan_digest="sha256:...",
)
```

and roll back the package/corpus pointer or persisted-data migration from preserved backups.

Uninstalling/disabling the package:

- removes its visible control skill and extension behavior;
- does not delete run ledgers, worktrees, evidence, memory proposals, or backups;
- leaves ordinary Prime operational.

## 2. User story

> As the maintainer of a Prime fork, I can reproduce exactly which Paperclip source and generator produced the installed package, update it with a reviewable plan, and recover from a bad update without losing active or historical work.

## 3. Package identity and compatibility

Define:

```text
package semantic version
organization manifest version
generator version
corpus source-set ID
corpus manifest hash
minimum/maximum tested Prime version or commit range
persisted schema readers/writers
```

`doctor()` shows all of them.

Do not rely only on npm package version to identify method/persona bytes.

Create a compatibility record:

```json
{
  "schema": "paperclip.compatibility/v1",
  "packageVersion": "0.1.0",
  "prime": {
    "minimumVersion": "0.7.1",
    "testedCommit": "..."
  },
  "schemas": {
    "runReadable": ["prime.factory-run/v1"],
    "runWritable": "prime.factory-run/v1"
  },
  "corpusManifestSha256": "...",
  "sourceSetId": "..."
}
```

Unknown future Prime versions produce a warning, not an automatic refusal, unless a required API is absent.

## 4. Install modes

Support:

```text
local development path
git package source
future npm/tarball package
```

During this roadmap, the implementation agent should verify local/project install. It must not publish to npm or create a production release without explicit maintainer instruction.

Project-local install is recommended for pilots so team settings can pin the source.

## 5. Installation verification

`verify_installation()` checks:

```text
package source identity
extension loaded exactly once
control skill loaded exactly once
Python skill import/call
template registry IDs and collisions
hidden method count and root-visible pfk count
function/workflow manifests
corpus/inventory/provenance hashes
run-store readability/writability
schema reader availability
experimental core capabilities/settings
external lanes/providers optional health
prompt budgets
forbidden executable markers
```

Return bounded report and machine-readable JSON artifact.

## 6. Upgrade plan

An upgrade plan compares:

```text
current package/corpus/templates/manifests/schemas
proposed package/corpus/templates/manifests/schemas
active run pins
persisted data schema versions
```

Output:

```text
added/removed/changed roles
added/removed/changed methods
classification/disposition changes
license changes
workflow/gate changes
template prompt/tool/method changes
source hashes
schema migrations required
active runs/children affected
prompt-budget changes
rollback artifacts
```

No apply without exact plan digest.

High-risk changes requiring explicit highlighted confirmation:

```text
quarantine → executable
license unknown → allowed
gate authority change
human approval removal
role method wildcard
template tool expansion
workflow transition change
schema destructive migration
active child persona/method drift
```

## 7. Data migration framework

Persisted package data includes:

```text
run ledgers/projections
assignments/artifacts/decisions
worktree leases
release approvals/records
memory proposals/applied memory
package settings/pointers
```

Migration contract:

```ts
interface FactoryMigration {
  id: string;
  from: string;
  to: string;
  plan(ctx): MigrationPlan;
  apply(ctx, backup): MigrationResult;
  verify(ctx): MigrationVerification;
  rollback(ctx, backup): MigrationRollbackResult;
}
```

Rules:

- readers remain able to inspect old supported versions;
- writers use current version;
- migration creates backup before mutation;
- backup manifest includes hashes;
- apply is idempotent or detects prior completion;
- verification required before deleting temporary files;
- backups are never auto-deleted in this slice;
- no migration rewrites source-code worktrees;
- unknown major schema remains read-only/blocked.

## 8. Active-run pinning during upgrade

Every assignment pins:

```text
package version
template ID/version/resolved prompt hash
method IDs/source hashes
workflow version
source-set/corpus manifest
```

Upgrade behavior:

- existing admitted assignment/child keeps pins;
- existing run may continue with old pins if assets remain available;
- new assignment in an old run follows explicit run upgrade policy;
- no silent mixed-version stage;
- operator may choose:
  - keep run pinned;
  - migrate run between safe stage boundaries;
  - cancel/restart assignment with new pins.

The upgrade plan lists active runs and recommendation.

## 9. Corpus/source sync

Reuse VS-12 transactional generation.

Add:

```text
fetch/update source only through explicit command
pin exact commit
preview inventory/classification/generation changes
review stale overrides/licenses
apply exact source-set digest
```

Do not run arbitrary source scripts or postinstall hooks.

## 10. Package verification in CI/local checks

Add focused verification scripts that:

- validate package manifest paths;
- load package resources;
- verify generated corpus;
- verify provenance/license;
- verify prompts;
- run schema fixtures/migrations;
- create a disposable local package install fixture where practical.

Respect root repository commands:

- do not run `npm run dev`;
- do not run unbounded `npm test`;
- do not run forbidden build commands during normal agent implementation;
- run focused tests and `npm run check`.

A maintainer release checklist may later invoke the repository's authorized release tooling.

## 11. Secret/public-repo audit

Before packaging, scan package-managed content for:

```text
.env files
tokens/keys
auth.json
Prime/Hermes/Pi sessions
raw private transcripts
private worktree paths
customer/repo names in fixtures
absolute home paths
large logs
```

Use synthetic fixtures.

Do not claim a regex scan proves absence of all secrets. Combine allowlisted package paths, fixture review, and existing repository secret tooling when present.

## 12. Documentation

Create package docs:

```text
installation
project-local setup
experimental core settings
doctor and verification
starting/resuming runs
method/persona isolation model
context providers
external lanes
release approval
data locations
backup/migration
uninstall/disable
source sync
license/provenance
troubleshooting
```

Keep user docs distinct from source adaptation reports.

## 13. Changelog and versioning

Package `CHANGELOG.md` uses the repository's current style.

Record user-visible behavior. Do not edit released sections.

Version:

```text
patch for compatible fixes/corpus corrections
minor for breaking package schema/API changes under repo semantics
```

Core Prime changes already made in prior slices require appropriate coding-agent changelog entries under their slice, not all deferred here.

## 14. Uninstall and data retention

Package removal must not delete:

```text
.prime/paperclip-factory/runs
worktrees
memory
evidence
backups
```

Provide an explicit separate archival/purge command with:

- dry run;
- path listing;
- active-run checks;
- confirmation;
- no secret printing;
- no default use.

Purge itself may remain out of scope; document manual archive.

## 15. Non-goals

Do not:

- publish to npm or another registry automatically;
- run the repository release script without explicit maintainer approval;
- delete historical run data during uninstall;
- auto-delete backups;
- auto-upgrade active children or assignments;
- bypass license/provenance review to complete an update;
- add silent network source updates;
- make third-party context providers or coding lanes installation dependencies;
- invent destructive migrations merely to exercise the framework;
- claim production readiness solely from automated tests.

## 16. Failure behavior

| Failure | Behavior |
|---|---|
| package update incompatible | do not activate; keep current |
| generated corpus invalid | transaction aborts |
| migration apply fails | preserve backup/current; mark blocked |
| verification fails after apply | offer rollback; no automatic data deletion |
| rollback fails | preserve all copies; manual recovery |
| active child assets missing | child blocked; never substitute |
| package removed | Prime starts; data remains |
| source unavailable | current pinned corpus remains usable |
| optional provider missing | warning only |
| license worsens | affected item quarantined; plan highlighted |

## 17. Test-first implementation

### 16.1 Red — local install/disable/remove

Using isolated config:

- install local package;
- verify exactly one control skill;
- disable/remove;
- verify baseline resources;
- existing data preserved.

### 16.2 Red — upgrade digest

Plan A approval cannot apply plan B. High-risk changes appear in highlighted list.

### 16.3 Red — migration

Fixtures:

```text
v1 run readable without migration
v1 → v2 migration preview/apply/verify
mid-apply failure
idempotent re-run
rollback
unknown major read-only
```

Use actual schema versions only if a migration is required; otherwise implement/test the framework with a small package metadata migration rather than inventing destructive run changes.

### 16.4 Red — active pins

Upgrade corpus while:

```text
child active
run between stages
new assignment pending
```

Assert pin policy.

### 16.5 Red — invalid new corpus

Live current corpus remains byte-identical.

### 16.6 Red — secret audit

Synthetic known secret/path fixtures fail packaging verification; normal generated output passes.

### 16.7 Red — compatibility warning

Unsupported/unknown Prime version warns; missing required API fails readiness.

## 18. Focused test commands

```bash
cd packages/paperclip-factory
npx tsx ../../node_modules/vitest/dist/cli.js --run test/install-verification.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/upgrade-plan.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/migrations.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/active-run-pinning.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/package-secret-audit.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/package-compatibility.test.ts
```

Then root `npm run check`.

## 19. Manual release-readiness verification

1. fresh isolated local install;
2. full `doctor()`/verify;
3. create partial run;
4. preview corpus update;
5. inspect high-risk changes;
6. apply safe update;
7. verify active run pin;
8. simulate failed migration and rollback;
9. disable/remove package;
10. verify Prime normal and data present;
11. reinstall prior package/corpus and inspect run;
12. run secret/public-repo audit;
13. produce release-readiness report.

Do not publish or execute repository release scripts without explicit maintainer authorization.

## 20. Acceptance criteria

- [ ] Local/project installation is reproducible.
- [ ] Verification identifies exact package/source/corpus.
- [ ] Disable/remove restores baseline Prime resources.
- [ ] User data survives disable/remove.
- [ ] Upgrade is previewed and digest-bound.
- [ ] High-risk changes are highlighted.
- [ ] Generation/update is transactional.
- [ ] Migrations preserve backups and roll back.
- [ ] Active assignments retain pinned personas/methods.
- [ ] Unknown schema major is not rewritten.
- [ ] Secret/public-repo audit is part of verification.
- [ ] Documentation covers operation and recovery.
- [ ] Focused tests and `npm run check` pass.
- [ ] No publication occurs automatically.

## 21. Rollback

Use:

```text
disable package
pin prior local/git/package version
restore prior corpus pointer
run migration rollback from preserved backup
retain all run/worktree/evidence data
```

If rollback cannot be verified, stop and preserve all versions for manual recovery.

## 22. Required completion evidence

Include:

```text
fresh install report
disable/remove baseline comparison
current/proposed upgrade plan and digest
high-risk change example
migration backup/apply/verify/rollback
active-run pin result
invalid-corpus transaction result
secret audit
compatibility report
release-readiness report
```

## 23. Copy-ready implementation prompt

Use [`../prompts/VS-14-PROMPT.md`](../prompts/VS-14-PROMPT.md).
