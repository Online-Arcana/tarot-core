# Testing

The normal deterministic suite is the code/data release gate and runs without model API calls.

```bash
npm ci
npm run ci
```

`npm run ci` performs:

1. persona/fallback data generation and TypeScript type checking
2. zero-network syntax checks for the local paid-live harness scripts
3. a clean build
4. the full Node test suite

The suite covers canonical deck/spread validation, exact request canonicalisation, reader personas, mapped media, ritual participation, prompt language/voice contracts, output schema, deterministic production auditing, isolated semantic-audit/review policy, deterministic availability reconstruction, reveal ordering, public metadata, handover/return state and compatibility with the existing application boundary.

Both untrusted wire input and direct typed library requests are covered. `parseReq` proves the HTTP/persistence boundary replaces compatibility prose with canonical semantics, while `canonicaliseApiReq`, public `modelPrompt` and `runModelSession` tests prove a direct caller cannot bypass that trust boundary by constructing an `ApiReq` manually.

## Audit architecture tests

Production has two deliberately separate audit layers:

1. **Deterministic production audit** owns objective structural and exact lexical contracts. The package-root synchronous `auditModelOut` is deterministic-only.
2. **GPT-5.6 Luna low semantic audit** owns grammar, naturalness, grammatical person, reader/querent identity, actor ownership, ritual continuity, semantic result references and other meaning-dependent judgements. It never edits prose. Confirmed findings are passed with the untouched candidate to Luna medium for atomic repair, then re-audited by Luna low. One bounded second medium → low pass is permitted for concrete leftovers.

Legacy contextual/regex helpers remain explicit compatibility and sensor surfaces for bounded regression coverage. They are not the production semantic authority and paid harnesses must not use them as final gates.

Context-sensitive legacy sensor tests are intentionally written as **state pairs**, not only lists of bad phrases. The same wording is exercised under different requests to prove that a sensor is interpreted against current state rather than promoted into a global blacklist.

Examples include:

- a masculine reader pronoun is a drift for Selena but not for Mictli
- the same masculine Spanish agreement is invalid for a woman querent but valid for a man querent
- Ngaru and Amaru require querent-operated draws while Brennos/Nahid/Ame use reader-operated actions
- natural Spanish pro-drop such as `Introduces la mano ... extraes una concha` satisfies the Ngaru contract without an explicit `tú`
- after an actor switch between querent and reader, Spanish generation must re-establish the new actor before pro-drop becomes safe again
- `Agitas el escudo` is suspicious when Brennos owns the current shield action
- an unrelated querent hand movement followed by Brennos operating the shield is not treated as the same action
- opening versus continuation ritual state changes revealed/hidden result context and single-cast rules
- mapped return semantic context exposes the same public result identities as generation rather than canonical tarot names

The lexical/regex layer has its own bounded sensor tests. A sensor match is never sufficient evidence of a production semantic error merely because a phrase matched.

## Semantic audit and atomic revision tests

Tests cover both Spanish and English semantic correction paths. They verify that:

- Luna low receives canonical request context and explicit field roles
- narrator prose may address the querent naturally in second person while describing the selected reader in third person
- suggestion chips are querent-first-person questions rather than reader dialogue
- mapped results are audited through the public reader-specific medium
- only affected paths are editable
- Luna medium receives the untouched candidate plus exact low-audit findings
- an exact small patch is merged into the original candidate
- untouched fields remain byte-for-byte unchanged
- the revised candidate is re-audited by a fresh isolated Luna-low schema
- one bounded second medium → low repair pass can address concrete leftovers
- an over-broad or deterministic-regressing revision is rejected
- a semantic finding may be dismissed when medium judges it to be a false positive
- usable LLM prose is preferred over deterministic prose after bounded quality-repair attempts
- deterministic reconstruction is used only when no usable parsed model candidate exists and guaranteed output is enabled
- canonical handover state skips semantic rewrite entirely after deterministic grounding

Low-level malformed forms remain useful regression sensors, but they are not invitations to add deterministic audience rewriting or language-specific prose replacement.

## Privacy-safe fixtures

Public tests must not copy user-specific names from development conversations into source fixtures.

`test/privacy-fixtures.test.mts` allows only a small explicit set of invented request identities (`Alex`, `Robin`, `Morgan`, `Sam`, `Taylor`) and fails generically if a request-like test fixture uses another literal name. The failure message deliberately does not echo the rejected value.

When adding a regression from a real incident:

- preserve the technical failure shape
- replace personal names, account data and other identifying literals with invented fixtures
- do not use a developer’s public alias as test data merely because it is public elsewhere
- keep exact user-authored prose only when the wording itself is essential to the regression and contains no identifying information

## Exhaustive deterministic matrices

The suite includes matrix-style gates for:

- all eight readers × both supported languages × all five spreads through deterministic availability reconstruction/finalisation
- all seven mapped readers × every canonical card × both languages through public presentation validation
- every mapped reader/spread combination audited before presentation metadata is attached
- every distinct reader handover pair in both languages, followed by a production-style target reading and A → B → A return
- ten sequential deterministic ritual reveals for every reader in both languages

These matrices validate the deterministic reserve corpus and canonical state machinery. They do **not** mean production should choose deterministic prose when a usable model candidate merely has a quality finding.

The handover matrix uses the real `handoverConv()` transitions. It verifies receiving/returning conversations begin empty, trails are correct, canonical card state remains internal and mapped model input does not leak canonical tarot identity.

Mapped-medium structural enforcement spans all user-visible prose families rather than only main reading dialogue. Ritual narration, read notes, chat gestures/responses, invite, fit, suggestions, continuation, titles and returns are checked for public-medium boundaries and generic-role leakage.

## Specific regression classes

Important regression families include:

- Unicode-safe accented Spanish token boundaries
- direct-address recognition without confusing possessives such as `sus`
- valid and invalid Spanish prepositional pronoun forms as bounded language sensors
- narrator first-person leakage
- exact querent proper-name leakage from narrator-owned fields
- reader/querent grammatical-gender drift
- reader self-reference and generic reader/querent labels
- Spanish pro-drop in legitimate querent-operated mapped rituals
- explicit actor re-establishment after Spanish querent↔reader subject switches
- context-derived mapped actor ownership
- single-cast continuation state
- exact user-authored handover questions remaining opaque to generated-prose correction
- `Death` / `La Muerte` supplied by the user not becoming false future-result leaks
- future mapped public-result names being repaired before reveal
- mapped return audit context never substituting canonical tarot identities for public reader-specific results
- exact three-item suggestions
- mapped generated prose being rejected rather than scrubbed by presentation code
- public media metadata containing no archival/operational controls
- deleted duplicate mapping authorities not reappearing
- direct typed requests receiving canonical card/spread semantics
- application compatibility transforms being no-ops/idempotent after core finalisation
- package-root synchronous audit remaining deterministic-only while legacy contextual diagnostics stay explicitly named

## Local paid prose matrix

Paid model validation is deliberately separate from normal CI. Run it from a clean local checkout of the exact commit under review with the API key only in the local environment.

```bash
export OPENAI_API_KEY='...'
npm run test:live
npm run test:live:aggregate
npm run test:live:review
```

For one reader/language cell:

```bash
LIVE_READER=selena LIVE_LANG=en-GB npm run test:live:cell
```

For the seven-reader handover chain in both languages:

```bash
npm run test:live:chain
```

The wrappers refuse dirty worktrees. Reports are stamped with the tested commit; aggregation rejects mixed/stale provenance and rejects legacy report schemas that pre-date the production semantic-final contract.

`runModelSession()` is the production authority for paid generation. Paid workers use the deterministic production audit plus the runner's `semantic_final_issue:*` / `semantic_final:unknown` diagnostics for final reporting. They do not run the retired contextual regex auditor as a second semantic authority.

Normal generation/audit/repair/re-audit model calls are counted as the bounded semantic pipeline rather than transport retries. `retryRequests` therefore represents actual extra request/parse transport attempts. `narrowCorrections` counts atomic revision paths and `semanticRepairs` records the production Luna-medium semantic repair path.

The full matrix exercises complete reader/language/spread flows and collects generated prose, model provenance, production audit/review/recovery diagnostics and placeholder-risk counters. Its aggregator accepts only current schema-v3 cell reports, requires all 16 cells to describe the exact checkout commit, and hard-fails semantic unknowns as well as surviving final findings.

The chained smoke exercises seven mapped readers, three-result spreads, exact accepted handover state and the return to Selena. The chain worker itself now emits production-accounted summaries; the wrapper retains defensive report normalisation/provenance checks for compatibility with older saved chain artefacts.

Live reports are written below `reports/` and are gitignored. They contain generated review prose and should be treated as review artefacts rather than source files.

## Human release review

A green deterministic suite is necessary but not sufficient for a prose release. Paid output must be read by humans in both supported languages before a core/main/application pointer is moved.

Automated checks can prove structural parity, state ownership, canonical IDs, bounded language/voice constraints and absence of known leakage. They cannot certify nuanced cultural accuracy, persona naturalness or interpretation quality.
