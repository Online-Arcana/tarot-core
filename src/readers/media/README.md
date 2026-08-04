# Reader media mappings

This directory is owned by the Online Arcana core. It contains authored text and data only; no runtime selection, rendering or interpretation code is wired to these files yet.

## Invariants

- Selena is intentionally absent from the mapping packs. Her existing naipes, ritual and presentation remain the vanilla implementation.
- Every other reader has exactly 78 explicit entries matching the canonical naipes IDs.
- Every entry maps one canonical card to one item or one authored physical sign in that reader's single medium.
- Upright and reversed remain the canonical tarot orientation. Each medium only translates how that orientation appears physically.
- Cultural elements must be documented and sourced. Their historical or religious context is stored separately from the fictional tarot correspondence.
- Every user-visible mapping field is authored in English and Spanish.
- The ritual contracts are narrative only. They add no click, choice, pause or other user-interface flow.
- The selected item and orientation are already fixed by the canonical draw. Ritual prose may create the illusion of concealed chance, but may not reroll or substitute anything.
- These files are marked `draft-text-only`. Cultural specialist review is required before they can be marked `reviewed-text-only` or integrated at runtime.

## Contents

- `index.json` lists the seven mapped readers and explicitly records Selena's vanilla status.
- `medium-map.schema.json` defines the mapping-pack structure.
- `reader-rituals.json` defines the global and reader-specific ritual-writing contracts.
- `maps/*.json` contains the cultural registry, source registry and 78 bilingual mappings for one reader.

## Meaning boundary

Each cultural element records its documented context. Each card mapping separately records an invented `fictionalCorrespondence`. The latter belongs to Online Arcana's fictional divination system and must never be represented as an authentic historical reading practice.
