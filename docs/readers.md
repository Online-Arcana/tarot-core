# Reader profiles

Reader profiles are canonical domain data used by fit assessment, handovers, fallback selection and model prompting.

## Reader IDs

`READER_IDS` is the canonical ordered list and `ReaderId` is derived from it. `DEF_READER` is `selena`. Use `isReader` for runtime validation.

## Authoritative source

Reader-authored prose lives in the eight XML files under `src/readers/personas/`.

`npm run generate:personas` validates those controlled XML documents and emits `src/readers/personas.generated.json` as an ignored build product. `profiles.ts` loads and validates that generated data; it is not a second hand-written persona catalogue.

This keeps reader character writing, bilingual copy and identity metadata in one source rather than spreading reader-specific prose through TypeScript.

## Profile structure

Each `ReaderProfile` contains:

- structured identity metadata, including gender and localised pronouns
- public name, localised role and localised summary
- strong, capable and weak topic lists
- voice, outlook, manner, ritual style, scene, limits and avoidance guidance
- localised introduction, portrait description and invitation variants
- localised handover offers, receiving acknowledgements and returning acknowledgements

`profileFor` returns the canonical immutable profile by ID. `profiles` returns cloned profile objects suitable for registries and selection lists.

## Localisation and identity

Profile localisation uses `Local<T>` with `en` and `es` values. `localText` selects Spanish when the language code starts with `es`; all other codes select English.

`readerIdentityMeta` returns structured identity data, while `readerPronouns` returns the localised pronoun record. `readerIdentity(id, lang)` serialises that private metadata into explicit `<reader_identity>` XML for model context.

That structure is deliberate. The core does not encode identity as prose notation such as `Mictli (él)`, because notation of that kind can be echoed or misread as user-facing text. Prompt contracts explicitly keep the structured identity block private.

## Prompt generation

`profilePrompt(id, lang)` serialises the selected persona into model instructions. It combines voice, worldview, manner, ritual style, scene, limits and exclusions with localised character material.

For mapped readers, persona data owns character and atmosphere while `src/readers/media/rituals.json` owns physical ritual choreography. The same action sequence is therefore not authored again inside persona TypeScript or a second ritual catalogue.

Application UI metadata such as image files, colour palettes and DOM labels remains in the consuming front end. The profile's portrait text is narrative model context, not an asset path.

## Topic fit

Supported topics are:

```text
love, intimacy, family, grief, death, change,
career, conflict, purpose, spirituality, identity, healing
```

The fit task compares the inferred topic with every reader profile. Most questions are expected to proceed as `good` or `acceptable`; weak levels are reserved for genuine mismatches.

Reader recommendations are derived from profile topic data rather than reader-to-reader hard-coded routes. The shared model/reading/transport layers are regression-tested to reject named-reader implementation patches.

## Review status

Persona validation proves schema, bilingual presence and runtime invariants. It does not certify naturalness, character quality or cultural sensitivity. Persona prose remains subject to human review before release.
