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

The suite covers canonical deck/spread validation, exact request canonicalisation, reader personas, mapped media, ritual participation, prompt language/voice contracts, output schema, base and contextual auditing, atomic prose review, deterministic availability reconstruction, reveal ordering, public metadata, handover/return state and compatibility with the existing application boundary.

Both untrusted wire input and direct typed library requests are covered. `parseReq` proves the HTTP/persistence boundary replaces compatibility prose with canonical semantics, while `canonicaliseApiReq`, public `modelPrompt` and `runModelSession` tests prove a direct caller cannot bypass that trust boundary by constructing an `ApiReq` manually.

## Audit architecture tests

Contextual audit tests are intentionally written as **state pairs**, not only as lists of bad phrases. The same wording is exercised under different requests to prove that the verdict comes from current state rather than a global blacklist.

Examples include:

- a masculine reader pronoun is a drift for Selena but not for Mictli
- the same masculine Spanish agreement is invalid for a woman querent but valid for a man querent
- Ngaru and Amaru require querent-operated draws while Brennos/Nahid/Ame use reader-operated actions
- natural Spanish pro-drop such as `Introduces la mano ... extraes una concha` satisfies the Ngaru contract without an explicit `tú`
- `Agitas el escudo` is suspicious when Brennos owns the current shield action
- an unrelated querent hand movement followed by Brennos operating the shield is not treated as the same action
- opening versus continuation ritual state changes revealed/hidden result context and single-cast rules
- the package-root `auditModelOut` includes request-context findings that the low-level `model/audit` subpath intentionally does not

The lexical/regex layer has its own bounded sensor tests. A sensor match is not sufficient evidence of a semantic error unless the current `AuditContext` activates the corresponding rule.

## Atomic revision tests

Tests cover both Spanish and English local correction paths. They verify that:

- only affected paths are editable
- the reviewer receives original prose and current generation context
- contextual-only review receives compiled audit context plus structured `code`, `path`, `evidence`, `expected` and `repairScope` metadata
- an exact small patch is merged into the original candidate
- untouched fields remain byte-for-byte unchanged
- the revised candidate is re-audited
- an over-broad/invalid revision is rejected
- the reviewer may dismiss a heuristic false positive by returning no edits
- usable LLM prose is preferred over deterministic prose after bounded quality-repair attempts
- deterministic reconstruction is used only when no usable parsed model candidate exists and guaranteed output is enabled

The primary realistic immersion regression is a querent proper-name leak in narrator prose. The auditor identifies the forbidden reference and the reviewer chooses the natural second-person repair from context. Low-level malformed forms such as invalid Spanish prepositional pronoun case remain useful sensor regressions, but they are not the model architecture’s canonical correction example and are never repaired by a deterministic audience transformer.

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
- querent proper-name leakage from narrator-owned fields
- reader/querent grammatical-gender drift
- reader self-reference and generic reader/querent labels
- Spanish pro-drop in legitimate querent-operated mapped rituals
- context-derived mapped actor ownership
- single-cast continuation state
- exact user-authored handover questions remaining opaque to generated-prose correction
- `Death` / `La Muerte` supplied by the user not becoming false future-result leaks
- future mapped public-result names being repaired before reveal
- exact three-item suggestions
- mapped generated prose being rejected rather than scrubbed by presentation code
- public media metadata containing no archival/operational controls
- deleted duplicate mapping authorities not reappearing
- direct typed requests receiving canonical card/spread semantics
- application compatibility transforms being no-ops/idempotent after core finalisation
- root/public audit using contextual semantics while the base-audit subpath stays explicitly low-level

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

The wrappers refuse dirty worktrees. Reports are stamped with the tested commit; aggregation rejects mixed/stale provenance and requires all expected cells to describe the same commit.

The full matrix exercises complete reader/language/spread flows and collects generated prose, model provenance, audit/review/recovery diagnostics and placeholder-risk counters. The A → B → A fixture uses real `handoverConv()` state and deterministic target-side state where needed to avoid adding unrelated paid calls.

`runModelSession()` is the production authority for paid generation and applies contextual review. Both paid worker scripts also use `contextualAuditModelOut()` for their final report audit and deterministic seed/target fixtures, so report counters and hard gates use the same request-context semantics as production. Their retry accounting distinguishes semantic reviewer/correction calls from transport or parse retries. The existing `narrowCorrections` report field is retained for report-schema compatibility but now counts language-agnostic atomic revisions, including contextual atomic revisions.

Live reports are written below `reports/` and are gitignored. They contain generated review prose and should be treated as review artefacts rather than source files.

## Human release review

A green deterministic suite is necessary but not sufficient for a prose release. Paid output must be read by humans in both supported languages before a core/main/application pointer is moved.

Automated checks can prove structural parity, state ownership, canonical IDs, bounded language/voice constraints and absence of known leakage. They cannot certify nuanced cultural accuracy, persona naturalness or interpretation quality.
