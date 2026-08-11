# Bundle Manifest

Prepared: 2026-08-08

Research baselines:

```text
Prime Agent: a18809e00ea30638584d87b3afea7285a9d7296c
Paperclip Factory Kit Hermes mirror: 28733e96246d325f3cb9a28225c167ce1c03bf75
```

This manifest covers every file in the bundle except `MANIFEST.md` itself.

```text
Files: 49
Bytes excluding this manifest: 301,909
Vertical slices: 15
Per-slice prompts: 15
```

| File | Bytes | SHA-256 | Purpose |
|---|---:|---|---|
| `00-EXECUTION-CONTRACT.md` | 6,228 | `6e6a13d5c390d8c56bac2e5fead16c567430cb534268db5a8032d63e5d9c6792` | Normative one-slice/TDD/source-preservation/authority/git/validation rules. |
| `01-SOURCE-BASELINE-AND-GAP-ANALYSIS.md` | 5,756 | `71457407395cdad41e178d41d047b5f16ebf0d8127eb382c589189a26b3f1525` | Pinned source facts, current Prime seams, and missing capabilities. |
| `02-NON-CONFUSION-INVARIANTS.md` | 5,295 | `110bdf9c063ac2048e6e214325d30f73f57c0c0094a76c36073463ab45dd6b29` | Hard prompt, persona, method, authority, and isolation constraints. |
| `03-TARGET-ARCHITECTURE.md` | 7,675 | `3e12b93bf5b1c24e3d8a85ecba1f5ac46bdcdccbdc8f3aade1e36508597ae947` | Core/package boundary and target organization/function/template topology. |
| `04-SCHEMA-CONTRACTS.md` | 8,129 | `fc70256b33bb45cf44b067efe71bd33b5c3becb7fbb63f1cceecfe92b3b79485` | Versioned manifest, run, artifact, decision, and memory record contracts. |
| `05-VERTICAL-SLICE-ROADMAP.md` | 4,975 | `ec1b0a9810686127d5843aa144bd8568f30eb7cae577b4be257baa507e58764d` | Dependency order, merge gates, parallelization rules, and release progression. |
| `06-PRIME-AGENT-CORE-CHANGE-MAP.md` | 8,406 | `65e953e7a9c734b166b391442f1c88a3c7ce8d0aac1e23870b91e4ec8e3b58ac` | Likely generic Prime source/test seams by capability. |
| `07-SKILL-AND-PERSONA-MIGRATION-MAP.md` | 6,890 | `afc9d6a72eb5b1165114b6be411846244a32f0994af30ad48e594d0189e2d0b9` | Role/function/method mapping, compatibility classes, and generation policy. |
| `08-TEST-AND-ACCEPTANCE-MATRIX.md` | 5,842 | `ab0476d8917d45d463cdbe36c0ca272be862cd452091fd5416a964a60956845b` | Cross-slice tests, adversarial cases, benchmarks, and completion evidence. |
| `09-RISK-AND-ROLLBACK-REGISTER.md` | 4,778 | `c9d2b0e140a47ba9cf1a93ebd87b2dfb8dce8189cb94e433a09fa450a00c72cc` | Risk matrix, kill switches, data recovery, upstream drift, and licensing. |
| `10-MASTER-IMPLEMENTATION-PROMPT.md` | 3,435 | `37429026384d952be84776066eeec84f6ca90d130773e83161f0ac2329e858c4` | Prompt that selects and implements exactly one next eligible slice. |
| `11-INITIAL-DECISION-LOG.md` | 2,969 | `3baffa59833f4c813b1eeb1ed6b5ef4e42202bb94a63aa1a497a4c2308ca0ee9` | Architecture decisions already made and intentionally deferred questions. |
| `12-SOURCE-REFERENCES.md` | 4,931 | `8555a61bb631fcde2663a0112d6e37c34b2a137035b74eb8440910579784c4a4` | Pinned Prime and Paperclip source references used in preparation. |
| `13-OPERATOR-RUNBOOK.md` | 5,023 | `87576db3cc699594e2f4e4fe678fd811b6a5372acb9e1b570682b92441f710a8` | Controlled installation of the plan, branches, review, interruption, and convergence. |
| `IMPLEMENTATION-STATUS.md` | 2,441 | `421a2574308f564af0667801ceafab2704cc2c41eed59a0137afbef4e750889b` | Initial durable status, measurements, capabilities, and blocker ledger. |
| `README.md` | 5,077 | `123615358646b0b4112490954449522659e3318f6a0e35698dd5bf18ac67243b` | Entry point, architecture summary, usage order, and completion definition. |
| `VALIDATION-REPORT.md` | 1,781 | `d639bef640335993cd80b05a5bd0d91b457363e095f2ea7ea594e86fd70980c5` | Static structural validation results for the planning bundle. |
| `prompts/README.md` | 1,301 | `33990a00525c9b55f4bd06c454b523e6fa2eec1a8ff9dd7cab8f74cb26a05830` | Navigation index for copy-ready per-slice prompts. |
| `prompts/VS-00-PROMPT.md` | 1,183 | `6bf2c22089240c02bde75c0216a02f48e67d00bd849557bffde21d4f1a16fb5f` | Copy-ready Prime Agent execution prompt for VS-00. |
| `prompts/VS-01-PROMPT.md` | 1,200 | `2d232e63637fda80600ddc44be4f88032bb31060612c6e11bde9e8ca1804deaa` | Copy-ready Prime Agent execution prompt for VS-01. |
| `prompts/VS-02-PROMPT.md` | 1,193 | `5341eaebd98cf5dbb4db7578202076077807f26edfeb6674a0399396c3521639` | Copy-ready Prime Agent execution prompt for VS-02. |
| `prompts/VS-03-PROMPT.md` | 1,189 | `ef943a4a555508215d4a8e5b3f2dc73105902de37fd17fc54c27f495a9113b4a` | Copy-ready Prime Agent execution prompt for VS-03. |
| `prompts/VS-04-PROMPT.md` | 1,311 | `19e2ecce7a902027bff3fcd14fefb7a8ab69b824be43c7c06cccdd0ea1f79e1a` | Copy-ready Prime Agent execution prompt for VS-04. |
| `prompts/VS-05-PROMPT.md` | 1,304 | `b699828e788d09e8c7a1bad80447ae5343fd5a5cbb64652aeeb49e1be670baf4` | Copy-ready Prime Agent execution prompt for VS-05. |
| `prompts/VS-06-PROMPT.md` | 1,314 | `7dd77ebb67a952c8a8f07e8367dc08ce11fcd5cef26f372db99521869bdeec3e` | Copy-ready Prime Agent execution prompt for VS-06. |
| `prompts/VS-07-PROMPT.md` | 1,316 | `a47a66579e47396574a00cd0d19707051f4c03f09329f4cfe45358088facdd8d` | Copy-ready Prime Agent execution prompt for VS-07. |
| `prompts/VS-08-PROMPT.md` | 1,353 | `c7b6f9ce3b85b6470f528d40907d50f7901197d37d74feaca6917a96582f7b79` | Copy-ready Prime Agent execution prompt for VS-08. |
| `prompts/VS-09-PROMPT.md` | 1,350 | `0082d2b8c3472811f8081414afee86bb3364e615ae0315ec72370c3fdc3e9886` | Copy-ready Prime Agent execution prompt for VS-09. |
| `prompts/VS-10-PROMPT.md` | 1,353 | `0b80eb60d0f46f3a93c2edd7bb1c13a990822b71d31c4884dd5229c69d84e16e` | Copy-ready Prime Agent execution prompt for VS-10. |
| `prompts/VS-11-PROMPT.md` | 1,357 | `7e3034d305b6ebb11903c6648472b8566ded17057b0eafd86410025426d1ee49` | Copy-ready Prime Agent execution prompt for VS-11. |
| `prompts/VS-12-PROMPT.md` | 1,364 | `b9bb0c16da7af8bbafdb735735de15622ebe20a758ead31f30594ee95ee40200` | Copy-ready Prime Agent execution prompt for VS-12. |
| `prompts/VS-13-PROMPT.md` | 1,354 | `ea410291223257e3da40759d14998cae3772e1649a0dd17d8e4ea80bf258055c` | Copy-ready Prime Agent execution prompt for VS-13. |
| `prompts/VS-14-PROMPT.md` | 1,357 | `1bf811364e287c85deb3ea16984d3dc7dc2e8dce9b49503bac1eb2c20db33b96` | Copy-ready Prime Agent execution prompt for VS-14. |
| `slices/README.md` | 3,225 | `ad0b5a67c9ce7a89d635cbe8a0e54263c35653f35242a2c5a8881a30467d8226` | Navigation index for all vertical slices. |
| `slices/VS-00-BOOTSTRAP-PACKAGE-AND-DOCTOR.md` | 13,403 | `7b490acefde608d40bf0b3f5fadeee2b26690068c8c308a5c8c7a62e939bc4ed` | Detailed test-first end-to-end implementation plan for VS-00. |
| `slices/VS-01-SOURCE-INVENTORY-AND-COMPATIBILITY-CLASSIFIER.md` | 11,465 | `8e9c2dd5f8117700d694b366e948c852c68e292db315f111ed78498fed77e596` | Detailed test-first end-to-end implementation plan for VS-01. |
| `slices/VS-02-PACKAGE-ONLY-ENGINEERING-MANAGER-PILOT.md` | 10,698 | `7bdcf2e560638ab539bdea31892938d91811bde4ca0bf03d976061deb56e0891` | Detailed test-first end-to-end implementation plan for VS-02. |
| `slices/VS-03-RUN-LEDGER-ARTIFACTS-AND-PLAN-GATE.md` | 11,848 | `5648d477631be5c1e9096e65481d2ef58d7991a7615ef5b4002ce0a8f51d09ff` | Detailed test-first end-to-end implementation plan for VS-03. |
| `slices/VS-04-GENERIC-AGENT-TEMPLATE-RLM-CONTRACT.md` | 13,970 | `e3c0b4316d8eef34c7d0546d598be76061f858a39b8e9d83d6d278e758e5aad6` | Detailed test-first end-to-end implementation plan for VS-04. |
| `slices/VS-05-SCOPED-CHILD-RESOURCE-LOADER.md` | 12,389 | `48d81b28e8566a3b919b32c3fe5e563503d6e28c1e6eb7ce72b6f6c78c0d77d9` | Detailed test-first end-to-end implementation plan for VS-05. |
| `slices/VS-06-PLANNING-FUNCTION-FANOUT-AND-SYNTHESIS.md` | 11,898 | `8684fbc47cf9b7be76f2d7f969283ab23e02312517b9907a9f03840613c590ce` | Detailed test-first end-to-end implementation plan for VS-06. |
| `slices/VS-07-DELIVERY-FUNCTION-BOUNDED-CANDIDATE-WORK.md` | 12,488 | `0757f89f767aa5a84b7f1b72751aa7a2c077340388ef834eeecd2b113ddc9433` | Detailed test-first end-to-end implementation plan for VS-07. |
| `slices/VS-08-INDEPENDENT-ASSURANCE-FANOUT-AND-GATE.md` | 12,444 | `3debc71e42d5e28b90775b729246d060fbff21ba4d1dd9f852696f0d4f6fa30d` | Detailed test-first end-to-end implementation plan for VS-08. |
| `slices/VS-09-RELEASE-RETRO-AND-MEMORY-PROMOTION.md` | 11,908 | `5f6ab7a9a708d846fde77211bd350182c9cc2231c8d984925d8e85761d8f893b` | Detailed test-first end-to-end implementation plan for VS-09. |
| `slices/VS-10-EXTERNAL-IMPLEMENTATION-LANE-ADAPTERS.md` | 11,031 | `2a070f86c6530314e76d9b77808eeecc98a2e41ceb385098aebfbbe59b52334e` | Detailed test-first end-to-end implementation plan for VS-10. |
| `slices/VS-11-FUNCTION-SPECIFIC-CONTEXT-PROVIDER-POLICY.md` | 11,957 | `78b721adb1d48f8ff9fc836af2ddfd7e265c92d45174a94eb0fb5e7fc04fda97` | Detailed test-first end-to-end implementation plan for VS-11. |
| `slices/VS-12-FULL-SKILL-CORPUS-MIGRATION-AND-QUARANTINE.md` | 14,546 | `53b8b57c87f34d83c93a1c2fa52e0e43c77978074cd3e596fefbb109de6d2583` | Detailed test-first end-to-end implementation plan for VS-12. |
| `slices/VS-13-RESUMABLE-FIVE-FUNCTION-WORKFLOW.md` | 14,815 | `a82dda41bda8a5187239c7126cf920d32651e5a5503b0e13f07612bb00253051` | Detailed test-first end-to-end implementation plan for VS-13. |
| `slices/VS-14-PACKAGING-SYNC-UPGRADE-AND-ROLLBACK.md` | 13,394 | `0471f5c5ce6ec509f3e89241917f97a5a1fa263c488ded99776a389c1257966b` | Detailed test-first end-to-end implementation plan for VS-14. |

## Integrity use

After copying this bundle into a Prime Agent fork, hashes may be used to prove which planning revision an implementation run followed. Once the operator intentionally edits a planning document, update the manifest or record the changed plan commit in `IMPLEMENTATION-STATUS.md`.

Do not use this manifest as a substitute for source-control review.
