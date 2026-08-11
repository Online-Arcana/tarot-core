# tarot-core

Core reading engine for Online Arcana.

This repository owns the deterministic tarot domain, reader data, mapped media systems, bilingual model orchestration, validation, recovery and stable API contracts used by the application. Browser behaviour, presentation assets and client storage remain outside this package.

## Core boundary

The browser-facing `ApiReq` and `ApiOut` contracts remain compatible with the existing Online Arcana application. Client-supplied card and spread descriptions are treated as compatibility data only: the core rebuilds semantic card, orientation, spread and position facts from canonical IDs before model generation.

```text
canonical deck + spreads + personas + mapped media
        -> request canonicalisation
        -> shared bilingual prompt construction
        -> strict structured model output
        -> deterministic audit / constrained correction
        -> deterministic recovery when required
        -> core finalisation
        -> unchanged ApiOut
```

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

Generation supports English and Spanish through one shared architecture. English is requested as natural British English. Spanish is requested as natural Spain Spanish with tuteo and normal pro-drop.

Narrator fields and reader dialogue are distinct contracts. Spanish narrator audience normalisation is conservative and applies only to narrator-owned fields; reader dialogue is never transformed as narration. Mapped readers use their public physical medium in model-facing data rather than canonical tarot identifiers.

## Model routing

Default lanes are independently configurable:

- ordinary short tasks: `gpt-5-nano` -> `gpt-5.6-luna`
- ritual: `gpt-5-mini` -> `gpt-5.6-luna`
- read/chat: `gpt-5.6-luna` -> `gpt-5.6-luna`

Every accepted generated candidate passes core finalisation and deterministic audit. Spanish narrator grammar failures caused by a leaked querent name or invalid tuteo pronoun case have a dedicated minimal correction schema that exposes only the affected narrator field or fields. Guaranteed recovery is available for customer-facing callers and remains diagnosable when reconstruction fails.

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

The active tests include canonical-data checks, request canonicalisation, bilingual prompt and voice checks, mapped-medium validation, sequential ritual recovery and an exhaustive deterministic release matrix across all eight readers, both languages and all five spreads.

The paid model-facing release matrix is intentionally local, not a GitHub Actions job. With `OPENAI_API_KEY` set in your shell:

```bash
npm run test:live
```

That command runs all 80 complete reader/language/spread readings locally, aggregates the machine gates and writes `reports/live-prose-review.md` for human review. Generated live reports and raw model attempts are ignored by Git.

See [`docs/testing.md`](docs/testing.md) for the full release gates and single-cell debugging commands.

## Release status

Automated deterministic validation is an engineering gate, not a claim of cultural or prose approval. Canonical card prose, reader personas and mapped cultural systems retain explicit human review requirements. The paid local live-model matrix and human review must be completed before the audited core replaces the application pin.

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
