# Card and spread packs

The CLI still accepts the manifest shape historically shared with Online Arcana language packs, but the audited core no longer treats pack prose as semantic authority.

## Entry manifest

A CLI manifest contains compatibility prompt fields, one or more explicit card files and spread metadata:

```json
{
  "prompt": {
    "reading": "Compatibility prompt text",
    "chat": "Compatibility prompt text"
  },
  "cardFiles": [
    "cards/major.json",
    "cards/minor.json"
  ],
  "spreads": [
    {
      "id": "three",
      "name": "Three cards",
      "purpose": "A compact progression",
      "pos": [
        { "name": "First", "meaning": "What established the situation" },
        { "name": "Second", "meaning": "What is active now" },
        { "name": "Third", "meaning": "What may develop" }
      ]
    }
  ]
}
```

`prompt.reading` and `prompt.chat` remain required by the legacy manifest/API shape. The current model layer accepts that `ModelPack` for compatibility but constructs generation prompts from core-owned bilingual contracts, persona data and mapped-medium data instead of using those strings as authored model instructions.

## Explicit card lists only

Every card chunk must be an explicit array of complete card objects:

```json
[
  {
    "id": "major-fool",
    "name": "The Fool",
    "suit": "Major Arcana",
    "upright": "Beginnings and openness",
    "reversed": "Hesitation or avoidable risk"
  }
]
```

The complete loaded pack must contain exactly the same 78 stable card IDs as `src/data/deck.json`. Display names and legacy card prose can remain in the compatibility pack for draw/persistence purposes, but model request canonicalisation rebuilds card names, suit and upright/reversed meaning from the core-owned canonical deck before generation.

## No generated minor meanings

Rank×suit recipes are deliberately unsupported. `expandCards` accepts explicit card arrays only and rejects recipe objects.

This is a release invariant, not merely a documentation preference: each minor-arcana meaning is authored explicitly in the canonical deck. The engine never produces canonical meanings by combining a generic rank template with a suit/domain template.

## Spread compatibility data

CLI manifests still carry spread name, purpose and positions because `Deck.draw` preserves the existing draw contract. Supported spread IDs remain:

```text
one
three
decision
advice
celtic
```

At the model boundary, spread purpose and position semantics are rebuilt from `src/data/spreads.json` by spread ID and one-based position. Client/pack wording is therefore not trusted as model meaning.

## Loading APIs

```ts
const files = cardFiles(manifest);
const cards = await loadCards(files, readJson);
```

- `cardFiles` validates and copies the manifest file list.
- `expandCards` validates and clones an explicit card array.
- `loadCards` reads all chunks concurrently, flattens them and enforces the exact canonical 78-card ID set.
- `loadCliPack` resolves a manifest from disk and returns compatibility cards/spreads plus the accepted legacy `ModelPack` prompt shape.

## Source of truth

For model-facing semantics, the authoritative files are:

- `src/data/deck.json`
- `src/data/spreads.json`

A language/CLI pack cannot override those meanings by sending different prose under an otherwise valid card or spread ID.
