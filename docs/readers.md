# Reader profiles

Reader profiles are domain data used by fit assessment, handovers and model prompting.

## Reader IDs

`READER_IDS` is the canonical ordered list and `ReaderId` is derived from it. `DEF_READER` is `selena`. Use `isReader` for runtime validation.

## Profile structure

Each `ReaderProfile` contains:

- public name, localised role and localised summary
- strong, capable and weak topic lists
- voice, outlook, manner, ritual, scene, limits and avoidance guidance
- localised introduction, portrait description and invitation variants
- localised handover offers, receiving acknowledgements and returning acknowledgements

`profileFor` returns the canonical immutable profile by ID. `profiles` returns cloned profile objects suitable for registries and selection lists.

## Localisation

Profile localisation uses `Local<T>` with `en` and `es` values. `localText` selects Spanish when the language code starts with `es`; all other codes select English.

`readerIdentity` returns explicit gender and pronoun metadata in both languages. This identity string is included in fit and handover prompts so names, images or cultural associations cannot override registered identity.

## Prompt generation

`profilePrompt(id, lang)` serialises the selected profile into model instructions. It combines voice, worldview, manner, ritual behaviour, scene, limits and exclusions with the localised introduction and portrait description.

Application UI metadata such as image files, colour palettes and DOM labels remains in the consuming front end. The profile's portrait text is narrative model context, not an asset path.

## Topic fit

Supported topics are:

```text
love, intimacy, family, grief, death, change,
career, conflict, purpose, spirituality, identity, healing
```

The fit task compares the inferred topic with every reader profile. Most questions are expected to proceed as `good` or `acceptable`; weak levels are reserved for genuine mismatches.
