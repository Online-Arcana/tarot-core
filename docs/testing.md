# Testing and maintenance

The `.mts` files under `test/` are active acceptance tests. They are run by `npm test` and by the repository CI gate.

## Required commands

```bash
npm run check
npm run build
npm test
npm run ci
```

- `check` regenerates canonical derived data and type-checks the maintained TypeScript source without emitting files.
- `build` regenerates canonical derived data and emits the library into `dist/`.
- `test` runs the Node test suite against the built package surface.
- `ci` runs typecheck, build and the complete deterministic test suite.

Generated `dist/`, `src/readers/personas.generated.json` and `src/model/fallbacks.generated.json` are not authoritative source. Persona prose belongs in `src/readers/personas/*.xml`; emergency fallback and shared recovery-atmosphere prose belongs in `src/model/fallbacks.xml`.

## Deterministic release matrix

`test/release-matrix.test.mts` exercises the complete core pipeline across:

- all 8 readers
- English and Spanish
- all 5 canonical spreads
- invite, fit, every ritual, read, chat, suggest, continue, title, handover and return

The matrix checks final audit validity, mapped-medium payload hygiene and finalisation idempotence. It supplements focused tests for canonical data, mapped ritual recovery, Spanish language edge cases, future-result leakage, fallbacks, persona loading, request canonicalisation, shared-code data ownership and compatibility with the unchanged Online Arcana post-processing sequence.

The deterministic matrix is a required engineering gate, but it is not a substitute for live-model or human review.

## Live-model release gate

The paid live matrix is intentionally a **local** test. It is not a GitHub Actions job and expects the API key only in the local environment where the test is being run.

Run it only after `npm run ci` is green, preferably from a clean checkout of the exact commit being considered for release:

```bash
export OPENAI_API_KEY='...'
npm run test:live
```

`npm run test:live` records the local Git `HEAD` in every per-cell report, builds the audited core, runs all 16 reader/language cells locally with two cells in parallel by default, aggregates their results and writes a human-review pack. If tracked files are dirty it prints a provenance warning because the recorded commit cannot describe those uncommitted changes.

Override local parallelism with `MATRIX_PARALLEL`, for example:

```bash
MATRIX_PARALLEL=1 npm run test:live
```

The complete matrix covers 8 readers × 2 languages × 5 spreads, for 80 complete readings and 1040 task calls. It records accepted output, model source, parse/shape retries, deterministic audit findings and raw Responses API attempts.

Outputs are written under `reports/`:

- `reports/live-prose/<reader>-<language>.json`: per-cell final prose, diagnostics, raw attempts and tested commit
- `reports/live-prose-summary.json`: aggregate counters and hard gates
- `reports/live-prose-summary.md`: compact aggregate summary
- `reports/live-prose-review.md`: accepted prose laid out for manual reading

The release expectations are:

- all 80 readings complete
- zero task failures
- zero final audit failures
- zero emergency fallback uses
- zero generic-reader labels
- zero querent-name narrator leaks
- zero narrator/reader voice leaks
- zero mapped canonical-medium leaks
- zero future-result leaks
- zero repetition failures
- zero placeholder risk

Escalation, parse retries, narrow Spanish corrections and reconstruction are retained as diagnostics. Unexpected reconstruction should be close to zero and must be reviewed even when the hard gates pass.

For a single reader/language cell while investigating a failure:

```bash
MATRIX_READER=selena MATRIX_LANG=es-ES npm run test:live:cell
```

Existing reports can be re-aggregated or re-rendered without making model calls:

```bash
npm run test:live:aggregate
npm run test:live:review
```

## Human review gate

Machine checks cannot certify that character voice, natural Spanish, natural English or culturally sensitive material is genuinely good. Persona prose, canonical card prose and all seven mapped cultural systems retain an explicit human review requirement. Automated validation must never be presented as cultural-specialist approval.

Use `reports/live-prose-review.md` to read the accepted output in reader/language/spread order. The corresponding JSON files contain rejected/raw attempts and provenance when a passage needs deeper diagnosis.
