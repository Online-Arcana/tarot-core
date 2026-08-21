# Online Arcana integration

Online Arcana consumes `tarot-core` as a recursively pinned Git submodule at `src/core`.

```text
Online-Arcana/online-arcana
└── src/core                   -> Online-Arcana/tarot-core
    └── src/vendor/openai-schema
```

The application imports maintained core modules directly from `src/core/src/`. For example, the production response handler imports request parsing, contracts, auditing, model orchestration, audience normalisation and reveal repair from that path. There is no separate `src/core/lib` adapter layer in the current application.

## Initialise

From the Online Arcana checkout:

```bash
git submodule sync --recursive
git submodule update --init --recursive
npm install
```

For standalone core development, install the core package from `src/core` as well:

```bash
npm install --prefix src/core
```

The recursive submodule update initialises the core's pinned `src/vendor/openai-schema` dependency.

## Compile

The application compiles browser, worker and Bun server targets separately. Only modules reachable from each target's entry points are emitted, so browser code does not automatically bundle the CLI or unrelated server-only modules.

```bash
npm run check
npm run build
```

The audited core has its own deterministic gate:

```bash
npm run ci --prefix src/core
```

The paid live prose matrix is deliberately not part of GitHub or application CI. It is run locally from the core checkout when a release candidate is ready for model-facing and human review.

## Stable boundary

The browser-facing `ApiReq` and `ApiOut` shapes remain the compatibility boundary. The audited core preserves those public request and response types so adopting it does not require a browser protocol migration.

The application still sends the same language-pack-shaped `ModelPack` object expected by the existing handler. Its historical `prompt.system`, `prompt.reading` and `prompt.chat` strings remain accepted for compatibility, but core generation is authored by the core-owned shared bilingual prompt builder, persona data and mapped-medium data rather than by client language-pack prompt prose.

Client-supplied card names, meanings, spread descriptions and position prose are likewise compatibility input only. Request canonicalisation rebuilds those semantic facts from stable card IDs, orientation, spread ID and position before model generation.

## Dependency direction

Core owns:

- canonical deck and spread semantics
- reader personas and identities
- mapped-medium data and ritual choreography
- request canonicalisation
- staged-reading and reveal-safety helpers
- bilingual model prompting, schemas, audit, correction, recovery and finalisation
- handover and return model boundaries

Online Arcana owns:

- browser storage and encrypted `.arcana` files
- language/UI copy and presentation assets
- DOM and reading-flow presentation timing
- deployment/runtime model credentials and token settings
- client diagnostics, crisis clearance and error reporting

The application currently retains `addressViewer()` and `repairFutureLeaks()` after `runModelSession()` for compatibility. Core finalisation is designed and tested to make that existing post-processing idempotent, so adopting the audited core does not require removing or rewriting those browser/server call sites.

## Release adoption

Until the local paid matrix and human review pass, the application submodule remains pinned to its current core commit. When the audited core is approved, adoption should be limited to advancing `src/core` to the approved core commit and updating the application's release metadata. No client API-shape change is expected.
