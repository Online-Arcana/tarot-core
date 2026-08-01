# Card and spread packs

Core separates language-specific card and spread data from engine code. The CLI accepts the same manifest shape used by Online Arcana language packs.

## Entry manifest

```json
{
  "prompt": {
    "reading": "Interpret the supplied draw...",
    "chat": "Answer the follow-up..."
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

The entry file must provide `prompt.reading`, `prompt.chat`, a valid spread array and a card-file list. Relative card paths resolve from the entry manifest directory.

## Explicit card lists

A card chunk may be an array of complete card objects:

```json
[
  {
    "id": "major-00",
    "name": "The Fool",
    "suit": "Major Arcana",
    "upright": "Beginnings and openness",
    "reversed": "Hesitation or avoidable risk"
  }
]
```

## Generated suit recipes

Minor arcana may use a compact recipe:

```json
{
  "pattern": "{rank} of {suit}",
  "suits": [
    { "id": "cups", "name": "Cups", "domain": "emotion" }
  ],
  "ranks": [
    {
      "id": "ace",
      "name": "Ace",
      "upright": "A beginning in {domain}",
      "reversed": "Blocked movement in {domain}"
    }
  ]
}
```

`expandCards` creates the Cartesian product of suits and ranks, replaces `{rank}`, `{suit}` and `{domain}`, and returns ordinary `CardDef` objects.

## Loading APIs

```ts
const files = cardFiles(manifest);
const cards = await loadCards(files, readJson);
```

- `cardFiles` validates and copies the manifest file list.
- `expandCards` expands one explicit list or generated recipe.
- `loadCards` reads all chunks concurrently, flattens them and enforces the complete-deck invariants.
- `loadCliPack` resolves a manifest from disk and returns cards, spreads and model prompts in one object.

## Validation rules

A usable pack must contain exactly 78 cards after expansion. Every card ID must be unique. Every spread must use one of the five supported IDs and contain between one and ten positions. Position names and meanings are required; `place` is optional.
