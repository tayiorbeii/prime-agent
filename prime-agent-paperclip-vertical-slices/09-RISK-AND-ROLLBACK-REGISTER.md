# Risk and Rollback Register

## 1. Risk matrix

| Risk | Likelihood | Impact | Detection | Containment |
|---|---:|---:|---|---|
| Root prompt flooded by method descriptions | High | High | Prompt benchmark | One visible control skill; hidden methods |
| Persona instructions leak into parent/siblings | Medium | High | Prompt isolation tests | Child-only template append |
| gstack workflow executes Claude-specific setup | High | High | Classifier markers | Quarantine by default |
| Child skill filtering mutates parent loader | Medium | High | Snapshot/reference tests | Immutable scoped wrapper |
| Inline and daemon children diverge | Medium | High | Paired recursion tests | Shared option-resolution helper |
| Gate satisfied by free text | High | Critical | Adversarial transition tests | Typed host evaluation |
| Security/QA blended into one approval | Medium | Critical | Gate authority test | Separate role decisions |
| Reviewer modifies code | Medium | High | Git snapshot comparison | Reject artifact and block gate |
| Run ledger corruption | Low | High | Replay/CRC/hash tests | Atomic writes + event log + snapshots |
| Source/license provenance lost | Medium | High | Generation verification | Hash and license required |
| Memory pollution | High | Medium | Proposal audit | Explicit promotion |
| Release command runs without approval | Low | Critical | Approval-token tests | Human approval gate |
| External lane changes wrong worktree | Medium | High | Canonical path/branch checks | Workspace lease |
| Core fork diverges heavily upstream | Medium | High | Change-map review | Package-first, generic core primitives |
| Context provider outage strands agent | Medium | Medium | Health check | Bounded native fallback |
| Method cards omit crucial constraints | Medium | Medium | Source-link and coverage review | On-demand source retrieval |
| Source mirror drifts | High | Medium | Hash comparison | Sync report and pinned source |

## 2. Kill switches

At minimum provide:

```text
Disable package in settings
Remove project-local package entry
paperclipFactory.enabled=false
experimentalAgentTemplates=false
experimentalScopedChildResources=false
```

A kill switch must not require loading the broken package.

## 3. Rollback by slice

### VS-00–VS-03

Rollback:

- remove package from project settings;
- delete or ignore package workspace;
- preserve run artifacts for inspection.

No Prime core rollback required.

### VS-04

Rollback:

- disable template selection setting;
- retain old `name`/`model` RLM behavior;
- unknown `template` remains rejected.

### VS-05

Rollback:

- disable scoped resources;
- template children inherit parent loader as before;
- Paperclip package must keep methods hidden, so degraded behavior remains safe.

### VS-06–VS-12

Rollback:

- stop new runs;
- existing run ledgers remain readable;
- disable selected function in package manifest;
- do not rewrite historical events.

### VS-13–VS-14

Rollback:

- pin prior package version;
- preserve schema reader compatibility;
- run migration rollback only from preserved backups;
- never delete user artifacts automatically.

## 4. Data recovery

Run ledger writes:

1. append an event with sequence and checksum;
2. write projection to a temporary file;
3. fsync when practical;
4. atomic rename;
5. retain periodic snapshot;
6. on load, compare projection sequence with event log.

If recovery detects inconsistency:

- copy suspect files to `recovery/`;
- reconstruct to a new file;
- never overwrite the only original;
- mark run `blocked`;
- require explicit acceptance of recovered state.

## 5. Upstream drift

Before every core slice:

```text
git fetch upstream
git log --oneline <baseline>..upstream/main -- affected/files
```

Rebase only using the user’s normal safe workflow. Re-audit current types and tests rather than applying stale line-number instructions.

## 6. Security boundary

Prime IPython is not a sandbox. Role tool restrictions reduce accidental behavior, not OS authority.

For read-only assurance:

- record `git status --porcelain=v2`;
- hash tracked files or at least record HEAD + diff before;
- run reviewer;
- compare after;
- reject any source mutation;
- keep reviewer artifacts in a separate allowed directory.

Stronger process isolation is a future generic sandbox capability, not a prerequisite for the Paperclip port.

## 7. Licensing

The port repository is MIT, but each mirrored skill carries its own provenance metadata. The generator must not assume all content is covered solely by the outer repository license.

A missing, conflicting, or non-redistributable license causes quarantine. Generated reports must distinguish:

```text
usable locally
redistributable
modified/attribution required
unknown
```
