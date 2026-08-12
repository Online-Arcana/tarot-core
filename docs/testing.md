# Testing

The deterministic suite is the release gate for code and data behaviour. It runs without model API calls.

```bash
npm ci
npm run ci
```

`npm run ci` performs:

1. persona/fallback data generation and TypeScript type checking
2. zero-network syntax checks for the local paid live-test harness
3. a clean build
4. the full Node test suite

The suite covers canonical deck/spread validation, exact request canonicalisation, reader personas, mapped media, ritual participation, prompt language/voice contracts, output schema, deterministic audit, narrow Spanish narrator correction, reconstruction, fallback behaviour, reveal ordering, public metadata, handover/return state, and compatibility with the existing application post-processing.

Both untrusted wire input and direct typed library requests are covered. `parseReq` proves the HTTP/persistence boundary replaces compatibility prose with canonical semantics, while `canonicaliseApiReq`, public `modelPrompt` and `runModelSession` tests prove a direct caller cannot bypass that trust boundary by constructing an `ApiReq` manually.

## Exhaustive deterministic matrices

The suite includes the following matrix-style gates:

- all eight readers × both supported languages × all five spreads through deterministic reconstruction/finalisation
- all seven mapped readers × every canonical card × both languages through public presentation validation
- every mapped reader/spread combination audited before presentation metadata is attached
- every distinct reader handover pair in both languages, followed by a production-style target reading and A → B → A return
- ten sequential ritual reveals for every reader in both languages

The handover matrix uses the real `handoverConv()` state transitions. It verifies receiving/returning conversations begin empty, the trail is correct, canonical card state remains internal, and mapped model input does not leak tarot identity.

## Specific regression classes

There are explicit tests for the failure classes that triggered this audit, including:

- Spanish `sus` not being misread as second-person address
- Unicode-safe accented `tú`/`mí` token boundaries
- malformed generated Spanish such as `para tú` / `con ti`
- valid `para ti`, `contigo` and `de tú a tú`
- Spanish narrator first-person leakage (`me`, `mi`, `mis`, `mí`, `conmigo`, `nos`, etc.)
- conservative name → subject/object/prepositional/possessive audience transformation
- reader dialogue never passing through narrator audience transformation
- Spanish pro-drop in mapped querent participation
- English output never receiving Spanish audience transformation
- user-authored handover questions remaining opaque to grammar correction
- `Death` / `La Muerte` named in the user's own question not becoming a false future-result leak
- future mapped public result names being repaired before their reveal
- exact three-item suggestions
- mapped generated prose being rejected rather than regex-scrubbed by presentation
- public media metadata containing no archival/operational controls
- deleted v2 duplicate ritual/card-index authorities not reappearing
- rank×suit meaning synthesis remaining unavailable
- reconstruction diagnostics remaining visible to CLI/library callers
- application post-processing remaining idempotent after core finalisation

## Local live prose matrix

The paid model validation is deliberately not a GitHub Action. Run it from a clean local checkout of the exact commit being reviewed, with the API key supplied only in your local environment.

```bash
export OPENAI_API_KEY='...'
npm run test:live
npm run test:live:aggregate
npm run test:live:review
```

For a single reader/language cell:

```bash
LIVE_READER=selena LIVE_LANG=en-GB npm run test:live:cell
```

The wrappers refuse to run when the worktree contains non-ignored changes. Every report is stamped with the local `git rev-parse HEAD`; aggregation rejects mixed/stale commit reports and requires all sixteen reader/language cells to describe the same tested commit.

The full matrix exercises 80 complete readings: eight readers × two languages × five spreads. It collects the generated prose for invite, fit, every ritual, read/card text, synthesis, closing/note, chat, suggestions, continue, title, handover and return, along with model provenance, audit/correction/reconstruction diagnostics and placeholder-risk counters.

The A → B → A return fixture uses the real `handoverConv()` helper so the paid matrix follows the same conversation/trail shape as production without adding an extra model call.

Live reports are written under `reports/` and are gitignored. They still contain review prose and should be treated as review artefacts rather than source files.

## Human release review

A green deterministic suite is necessary but not sufficient for release. The paid matrix must be read by a human in both languages before the core/main/app pointer is moved.

The content data also deliberately records human review as outstanding. Deterministic tests can prove structural parity, canonical IDs, language/voice constraints and absence of prohibited leakage, but they cannot certify nuanced cultural accuracy, persona naturalness or the quality of tarot interpretations.
