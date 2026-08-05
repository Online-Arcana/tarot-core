# Reader media mappings

This directory is owned by the Online Arcana core. It contains the bilingual, source-cited archives used at runtime for the seven mapped readers. Selena remains the unchanged vanilla naipes reader.

## Runtime structure

Each reader map contains:

- four minor families with fourteen fixed ranks each;
- twenty-two fixed major equivalents;
- the public names for both physical states;
- the medium and ritual contract;
- item descriptions and cultural/source registries;
- English and Spanish presentation text.

The runtime expands the compact `22 + 4 × 14` archive deterministically against the canonical naipes IDs. It never rerolls, invents or substitutes a mapped result.

## Presentation boundary

Mapped results expose:

- `arcana`: internal structural class, minor or major;
- `family`: the public minor family, or `null` for a major;
- `stateLabel`: the reader's physical state rather than upright/reversed;
- the fixed item name and concise canonical meaning.

The client must not infer a family from the first cultural element or hardcode reader-specific states.

## Special physical systems

- **Ngaru:** every logical shell has two physical copies, one painted on its outer surface and one on its inner surface. There are 78 logical results and 156 physical shells.
- **Ame:** all four petal kinds are cast once for the entire spread. Marked basin areas are the spread positions. A single flower family and count forms a minor result; a fixed mixed-petal pattern forms a major result. Later positions inspect the same cast without casting again.

## Historical and fictional boundary

The physical elements and named beings are tied to the cited historical, museum, botanical, folklore or religious sources. The following remain Online Arcana fiction:

- the one-to-one correspondence with the canonical naipes;
- the rank ordering inside each family;
- the complete divination method;
- each reader's interpretation of the resulting physical sign.

Every archive remains marked `source-backed-draft` and `culturalSpecialistReviewRequired` until the relevant cultural review is complete. Broad comparative sources must not be represented as proof of a specifically Helvetii, Yorùbá, Māori, Japanese, Inka, Zoroastrian or Mexica practice when they do not establish that narrower claim.

## Contents

- `index.json` summarises the final families, states and special physical rules.
- `medium-map.schema.json` defines the compact version-2 archive shape.
- `reader-rituals.json` defines the global writing boundary and points to each map as the ritual source of truth.
- `canonical-card-index.json` mirrors the canonical identifiers for validation only; canonical meanings continue to come from the actual draw.
- `maps/*.json` contains one complete reader archive.
