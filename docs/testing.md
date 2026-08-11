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

The matrix checks final audit validity, mapped-medium payload hygiene and finalisation idempotence. It supplements focused tests for canonical data, mapped ritual recovery, Spanish language edge cases, future-result leakage, fallbacks, persona loading and request canonicalisation.

The deterministic matrix is a required engineering gate, but it is not a substitute for live-model or human review.

## Live-model release gate

Before a prose/core release is adopted by Online Arcana, run the paid live matrix after deterministic CI is green. The live matrix covers 8 readers × 2 languages × 5 spreads, for 80 complete readings, and records all generated prose stages plus source/provenance diagnostics.

Review the report for primary/escalation/reconstruction frequency, parsing or correction retries, generic-reader labels, querent-name leaks, voice leaks, mapped canonical-medium leaks, future-result leaks, repetition and placeholder risk.

## Human review gate

Machine checks cannot certify that character voice, natural Spanish, natural English or culturally sensitive material is genuinely good. Persona prose, canonical card prose and all seven mapped cultural systems retain an explicit human review requirement. Automated validation must never be presented as cultural-specialist approval.
