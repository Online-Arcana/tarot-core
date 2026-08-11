# Reader media mappings

This directory contains the seven mapped-reader physical systems used by Online Arcana core. Selena remains the vanilla tarot/naipes reader and therefore has no mapped-media file.

The mapped systems are runtime-integrated but remain `source-backed-draft`. `culturalSpecialistReviewRequired` stays true until the relevant human review is complete.

## Source ownership

The v3 design deliberately separates four kinds of data so none of them becomes an accidental second source of truth:

- `maps/*.json`: one explicit mapped result for every canonical card ID, with bilingual item/observation/interpretation data and research/source context
- `rituals.json`: the single canonical mapped ritual/choreography source, including participation, concealment, single-cast rules, complete authored ritual sentences and audit aliases
- `public-meta.json`: client-visible medium/culture/category presentation metadata
- `../../data/deck.json`: the canonical 78-card ID and tarot-semantic source used to validate every map

`index.json` is only a file inventory. It does not duplicate families, states, ritual rules or canonical card IDs.

## Explicit v3 mapping

Every mapped file uses an explicit object keyed by canonical card ID rather than a positional `22 + 4 × 14` array. Runtime validation requires the key set to match the canonical deck exactly: all 78 IDs, no missing IDs and no extras.

This matters because positional rank/suit ordering is not semantic authority. A mapping remains attached to `major-fool`, `minor-cups-ace`, and so on by stable ID regardless of JSON ordering.

The runtime never rerolls, invents or substitutes a mapped result. The canonical draw determines the mapped physical result deterministically.

## Presentation boundary

A mapped result may expose public presentation fields such as:

- physical item/result name
- public family/category/number/state
- concise public observation and interpretation
- public medium and culture labels
- client-safe ritual observation/direction

Research provenance, source notes, canonical tarot correspondence and implementation/control language are not copied into client-visible `MediumPresentation` merely because they exist in the archive.

`public-meta.json` owns shared visible presentation metadata so runtime code does not hard-code reader exceptions or derive public copy from research fields.

## Ritual boundary

Physical choreography is authored once in `rituals.json`. Persona XML owns reader character/atmosphere, not a duplicate ritual sequence.

The ritual data records whether the reader or querent performs the physical action, whether a medium is single-cast, how hidden results stay concealed, complete English/Spanish action sentences, continuity states, grounding aliases and validator action/object aliases.

`participation.ts` is only a compatibility shim over that canonical ritual data. `ritual-recovery.ts` selects complete authored sentences from canonical data and shared fallback atmosphere; it does not contain reader-specific prose or interpolate arbitrary sensory fragments into grammar templates.

## Special physical systems

Some systems have structural rules represented in their canonical ritual/mapping data. For example, Ngaru uses paired shell states and Ame is a single-cast medium whose later spread positions continue observing the original cast. These rules are validated generically from data rather than implemented as named-reader branches in shared model code.

## Historical and fictional boundary

The archive can contain source/research material needed for cultural review, while the complete divination systems and their one-to-one relationship with canonical tarot remain Online Arcana constructions.

Do not present automated schema/runtime validation as cultural validation. The checklist in `CULTURAL-REVIEW.md` remains the release gate for knowledgeable human review of names, diacritics, sources, restricted/sacred material and claims about represented traditions.

## Contents

- `index.json`: non-semantic v3 inventory of mapped files and shared source files
- `medium-map.schema.json`: explicit v3 map schema
- `rituals.json`: sole mapped ritual/choreography source
- `public-meta.json`: shared client-facing mapped presentation metadata
- `maps/*.json`: seven explicit 78-ID mapped archives
- `mapping.ts`: parser and exact canonical-ID-set validation
- `ritual.ts`: ritual-data parser and generic audit/runtime accessors
- `runtime-v3.ts`: mapped presentation runtime
- `runtime.ts`: stable compatibility re-export
- `CULTURAL-REVIEW.md`: human review checklist and pack-specific cautions
