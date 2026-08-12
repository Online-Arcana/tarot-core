# Paid Spanish prose audit

This document records the concrete defects found during the local paid `selena/es-ES` prose cells and the deterministic coverage added for them. It is a regression record, not a claim that automated checks replace human Spanish, tarot or cultural review.

## Current release gate

The full Selena Spanish cell remains the language-path gate before the targeted cross-reader chain. A paid run is not considered clean merely because `finalAuditIssues` is zero: the generated prose is reviewed manually for grammar, scene continuity, voice ownership, semantic preservation and natural Spanish.

## Findings converted into shared behaviour

The paid runs exposed the following shared core issues:

- narrator audience transformation could choose the wrong Spanish pronoun case or mutate unrelated scene nouns while trying to force direct address;
- missing querent gender allowed masculine and feminine agreement to alternate inside one conversation;
- natural Spanish perfect constructions and imperatives could be misclassified as lacking direct address;
- a single gender-agreement error in otherwise good reader dialogue could discard the entire reading instead of correcting that field only;
- finite constructions such as `te mantiene atrapado` could evade the first neutral-gender detector;
- reader/querent subject agreement could drift inside fit prose, for example switching from `qué temes` to first-person `qué deseo`;
- canonical handover conclusions could exceed their own deterministic word ceiling even when the model output was structurally usable;
- exact user questions could be copied into the handover `facts` category despite not being facts;
- return prose could lose reversed-state meaning, invent an unreceived tarot result, or describe mapped readers generically as tarot readers;
- accepted handovers were persisted but were not originally included in ordinary receiving-reader model payloads;
- sequential rituals could mechanically warm/cut the same deck again, contradict an established physical scene, or make the hidden result visible before the reveal stage.

The fixes are shared across readers. Reader-specific facts and choreography remain data-driven.

## Querent grammatical gender

`gender` is optional and backward-compatible. Supported values are `woman`, `man` and `nonbinary`.

For Spanish, a missing value and `nonbinary` both use natural gender-neutral phrasing. The generator must avoid guessing agreement from a name or context and must avoid artificial `@`, `x`, slash, parenthetical or forced `-e` forms. Natural circumlocution is preferred, for example `¿sientes que puedes avanzar?`, `con cansancio`, `sentir que te eligen`, or `para ti`.

User-authored wording remains opaque. If a person writes a gendered form in their own question, the core preserves it when that exact question is carried through a handover rather than treating the user's language as generated-prose evidence.

## Handover and return grounding

Handover state now preserves exact result ID, visible name, orientation/state, position and established meaning. Canonical summary/conclusion prose is compacted deterministically to the existing audit ceilings rather than relaxing those ceilings.

Questions are kept in the question fields and exact user questions are excluded from `facts`. Receiving readers receive the accepted handover as model context; mapped readers receive an equivalent public-medium translation rather than canonical tarot internals.

Return prompts and audits preserve the exact handed-over state, reject invented tarot results and avoid generic `reader`/`tarotista` labelling of intermediate mapped readers. Spanish return wording uses neutral `otras voces` when a collective reference is needed.

## Surgical Spanish correction

The narrow Spanish correction path can now repair only the prose fields that failed a grammar/audience audit, including individual `cardText[i]` entries, synthesis, reading, closing, fit prose and other selected direct-speech fields. The remainder of a good model response is retained unchanged.

This is important for missing/nonbinary gender: a phrase such as `qué no estás dispuesto a sacrificar` should become a natural neutral equivalent such as `qué no quieres sacrificar`; it should not force replacement of an otherwise detailed three-card reading with emergency boilerplate.

## Ritual continuity

Ritual prompts and deterministic checks now preserve physical sequencing across positions. Repeating multiple active preparation actions such as warming and cutting the deck is treated as substantial reuse. Explicit reset language such as `vuelve a calentar` is also detected when it repeats an established preparation action, while retrospective continuity such as saying the deck is still warm after an earlier preparation remains valid.

The hidden current result must remain concealed until the reveal stage. Pre-reveal prose that turns or places it face-up is rejected even if the prose does not name the result.

## Human-review findings

Some defects are better handled by stronger natural-language instructions and manual review than by brittle lexical rejection. Examples from paid output included redundant constructions such as `exploremos contigo`, repeated roots such as `conversación clara para aclarar`, and anthropomorphic invitation wording in which a card was said to want to hear a word. The shared Spanish task prompts now explicitly discourage these constructions.

Human review remains mandatory after the deterministic suite is green.
