# tarot-core

Core reading engine for Online Arcana.

This repository owns the deterministic tarot domain, reader data, mapped media systems, bilingual model orchestration, validation, recovery and stable API contracts used by the application. Browser behaviour, presentation assets and client storage remain outside this package.

## Core boundary

The browser-facing `ApiReq` and `ApiOut` contracts remain compatible with the existing Online Arcana application. Client-supplied card and spread descriptions are compatibility data only: the core rebuilds semantic card, orientation, spread and position facts from canonical IDs before model generation.

```text
canonical deck + spreads + personas + mapped media
        -> request canonicalisation
        -> shared bilingual prompt construction
        -> strict structured model output
        -> deterministic preparation + production audit
        -> GPT-5.6 Luna low semantic audit
             -> pass, or
             -> bounded Luna-medium exact-span repair + Luna-low re-audit
        -> deterministic availability reserve only when no usable model candidate exists
        -> unchanged ApiOut
```

Canonical handover state is deterministically grounded and skips semantic rewrite after validation.

## Canonical data

- `src/data/deck.json`: explicit bilingual 78-card catalogue
- `src/data/spreads.json`: the five canonical spreads and positions
- `src/readers/personas/*.xml`: the eight reader personas and identities
- `src/readers/media/maps/*.json`: explicit 78-result mappings for the seven mapped readers
- `src/readers/media/rituals.json`: canonical mapped ritual choreography and machine-facing audit aliases
- `src/readers/media/public-meta.json`: public mapped presentation metadata
- `src/model/fallbacks.xml`: canonical emergency/fallback prose and shared recovery atmosphere

Generated persona and fallback JSON files are build products and are not authoritative prose sources.

## Language and voice

Generation supports English and Spanish through one shared architecture. English is requested as natural British English. Spanish is requested as natural Spain Spanish with tuteo and natural pro-drop while the grammatical actor remains unambiguous.

Narrator fields and reader dialogue are distinct contracts. Narrator prose describes the configured reader in third person while naturally addressing the querent/viewer in second person. Suggestion chips are first-person querent questions. When Spanish narration switches actor between querent and reader, the new actor must be re-established before pro-drop resumes.

There is no deterministic audience transformer in production. Grammar, person, actor ownership, naturalness and ritual-continuity meaning are semantic responsibilities of the isolated Luna audit/repair path. Exact structural/private-boundary faults remain deterministic.

Mapped readers use their public physical medium and public result identities in both generation and semantic-audit context rather than exposing canonical tarot identifiers.

## Model routing

Default prose generation routes through GPT-5.6 Luna with task-appropriate cheap reasoning effort. Semantic quality control is fixed separately:

- generation: `gpt-5.6-luna`
- semantic audit: `gpt-5.6-luna`, low effort
- semantic atomic repair: `gpt-5.6-luna`, medium effort
- semantic re-audit: `gpt-5.6-luna`, low effort

Generation, semantic audit and semantic repair use isolated schema instances. Semantic calls do not share generation conversation state.

The low semantic auditor never edits. Medium repair receives the untouched candidate plus exact findings and may return only surgical exact-span patches. A single bounded second medium → low pass is available for concrete leftovers; there is no repair loop. Unsafe or deterministic-regressing patches are rejected in favour of the safer usable model candidate.

Guaranteed deterministic recovery is an availability path only when no usable parsed model candidate exists; it is not a quality fallback for imperfect prose.

See [`docs/model.md`](docs/model.md) for the complete orchestration contract.

## Development

```bash
npm ci
npm run check
npm run build
npm test
npm run ci
```

`npm run ci` regenerates derived persona/fallback data, type-checks the core, syntax-checks the local live-test harness, builds `dist/` and runs the full deterministic test suite. It does not make paid model calls.

The active tests include canonical-data checks, request canonicalisation, bilingual prompt and voice checks, deterministic production-audit boundaries, semantic audit/repair policy, mapped-medium validation, sequential ritual recovery and an exhaustive deterministic release matrix across all eight readers, both languages and all five spreads.

Paid model-facing release validation is intentionally local, not a GitHub Actions job. With `OPENAI_API_KEY` set in your shell, targeted cells and the chained smoke can be run independently; the full matrix remains available when a complete release sample is required:

```bash
npm run test:live:cell
npm run test:live:chain
npm run test:live
npm run test:live:aggregate
npm run test:live:review
```

Live reports are commit-stamped and gitignored. Current matrix aggregation accepts only the production semantic-report schema so legacy regex-era counters cannot be mixed into current release gates.

See [`docs/testing.md`](docs/testing.md) for release gates and debugging commands.

## Release status

Automated deterministic validation is an engineering gate, not a claim of cultural or prose approval. Canonical card prose, reader personas and mapped cultural systems retain explicit human review requirements. Paid local model validation and human review remain release inputs before the audited core replaces the application pin.

## Documentation

- [`docs/getting-started.md`](docs/getting-started.md)
- [`docs/contracts.md`](docs/contracts.md)
- [`docs/model.md`](docs/model.md)
- [`docs/readers.md`](docs/readers.md)
- [`docs/reading-flow.md`](docs/reading-flow.md)
- [`docs/testing.md`](docs/testing.md)
- [`docs/security.md`](docs/security.md)

## Licence

See [`LICENSE`](LICENSE).
