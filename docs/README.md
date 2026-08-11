# Tarot Engine Core documentation

## Start here

- [Getting started](getting-started.md) — current repository checkout, nested submodules, deterministic validation and consumption modes
- [Library API](library.md) — public exports, canonical data, model provenance and common integration patterns
- [CLI](cli.md) — reduced JSON input/output interface, session handling and reconstruction diagnostics

## Domain reference

- [Contracts](contracts.md) — stable request/output shapes, canonicalisation, conversation, draw and handover types
- [Card and spread packs](packs.md) — legacy-compatible manifest shape, explicit canonical card IDs and semantic trust boundary
- [Reading flow](reading-flow.md) — canonicalisation, ritual, reveal, interpretation, finalisation, continuation and handover stages
- [Reader profiles](readers.md) — XML-owned personas, structured identity, topic fit and localisation

## Runtime and integration

- [Model orchestration](model.md) — bilingual prompt architecture, schemas, audit, narrow correction, recovery and provenance
- [Online Arcana integration](integration.md) — current `src/core` recursive submodule topology and unchanged application boundary
- [Testing and maintenance](testing.md) — deterministic CI plus the separate local paid/live and human-review gates
- [Security notes](security.md) — randomness, semantic trust, credentials, local live artefacts, model sessions and data handling
