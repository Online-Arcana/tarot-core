# Paid Spanish prose audit

This document records the concrete defects found during the local paid `selena/es-ES` prose cells and the deterministic coverage added for them. It is a regression record, not a claim that automated checks replace human Spanish, tarot or cultural review.

## Current release gate

The full Selena Spanish cell remains the language-path gate before the targeted cross-reader chain. A paid run is not considered clean merely because `finalAuditIssues` is zero: the generated prose is reviewed manually for grammar, scene continuity, voice ownership, semantic preservation and natural Spanish.

The paid cell on `ffaafa0855fe021a070ff0c7f43679786d88eff2` completed all five readings and reported zero hard failures, zero placeholder risk and zero final audit issues. Human review still failed that run because one three-card reading fell through to emergency boilerplate and several accepted fields contained gender assumptions or ritual resets that the counters did not detect. This is why the manual gate remains separate from the automated summary.

## Findings converted into shared behaviour

The paid runs exposed the following shared core issues:

- narrator audience transformation could choose the wrong Spanish pronoun case or mutate unrelated scene nouns while trying to force direct address;
- missing querent gender allowed masculine and feminine agreement to alternate inside one conversation;
- natural Spanish perfect constructions and imperatives could be misclassified as lacking direct address;
- a single gender-agreement error in otherwise good reader dialogue could discard the entire reading instead of correcting that field only;
- finite constructions such as `te mantiene atrapado` could evade the first neutral-gender detector;
- group/reflexive forms such as `contigo mismo`, `exploremos juntos`, `entre ambos` and `hacerte más pequeño` could still encode gender while passing the earlier detector;
- bare participial agreement could create false positives, for example treating `una incomodidad que pide ser escuchada` as if `escuchada` described the querent rather than `incomodidad`;
- a narrow correction request could return the same rejected phrase unchanged, leaving the runner to discard otherwise good prose;
- reader/querent subject agreement could drift inside fit prose, for example switching from `qué temes` to first-person `qué deseo`;
- canonical handover conclusions could exceed their own deterministic word ceiling even when the model output was structurally usable;
- exact user questions could be copied into the handover `facts` category despite not being facts;
- return prose could lose reversed-state meaning, invent an unreceived tarot result, or describe mapped readers generically as tarot readers;
- accepted handovers were persisted but were not originally included in ordinary receiving-reader model payloads;
- sequential rituals could mechanically warm/cut the same deck again, contradict an established physical scene, or make the hidden result visible before the reveal stage.

The fixes are shared across readers. Reader-specific facts and choreography remain data-driven.

## Querent grammatical gender

`gender` is optional and backward-compatible. Supported values are `woman`, `man` and `nonbinary`.

For Spanish, a missing value and `nonbinary` both use natural gender-neutral phrasing. The generator must avoid guessing agreement from a name or context and must avoid artificial `@`, `x`, slash, parenthetical or forced `-e` forms. Natural circumlocution is preferred, for example `¿sientes que puedes avanzar?`, `con cansancio`, `sentir que te eligen`, `para ti` or simply `exploremos` rather than `exploremos juntos/juntas`.

The deterministic detector now distinguishes agreement that actually targets the querent from agreement belonging to another noun. A phrase such as `quieres ser escuchado` is gendered direct address when gender is unavailable; `una incomodidad que pide ser escuchada` is ordinary grammatical agreement and must not be rejected for that reason.

User-authored wording remains opaque. If a person writes a gendered form in their own question, the core preserves it when that exact question is carried through a handover rather than treating the user's language as generated-prose evidence.

## Handover and return grounding

Handover state now preserves exact result ID, visible name, orientation/state, position and established meaning. Canonical summary/conclusion prose is compacted deterministically to the existing audit ceilings rather than relaxing those ceilings.

Questions are kept in the question fields and exact user questions are excluded from `facts`. Receiving readers receive the accepted handover as model context; mapped readers receive an equivalent public-medium translation rather than canonical tarot internals.

Return prompts and audits preserve the exact handed-over state, reject invented tarot results and avoid generic `reader`/`tarotista` labelling of intermediate mapped readers. Spanish return wording uses neutral `otras voces` when a collective reference is needed.

## Surgical Spanish correction

The narrow Spanish correction path can now repair only the prose fields that failed a grammar/audience audit, including individual `cardText[i]` entries, synthesis, reading, closing, fit prose and other selected direct-speech fields. The remainder of a good model response is retained unchanged.

This is important for missing/nonbinary gender: a phrase such as `qué no estás dispuesto a sacrificar` should become a natural neutral equivalent such as `qué no quieres sacrificar`; it should not force replacement of an otherwise detailed three-card reading with emergency boilerplate.

The correction prompt now states explicitly that an already-rejected expression may not be returned unchanged and gives minimal neutral rewrites for the failure classes actually seen in paid output.

## Ritual continuity

Ritual prompts and deterministic checks preserve physical sequencing across positions. For the vanilla tarot medium, repeating even one active preparation action already established earlier — warming, cutting or shuffling the deck — is a scene reset and is rejected before the ordinary prose audit. Retrospective continuity such as saying the deck remains warm after an earlier preparation is still valid.

This semantic tarot check is kept separate from generic lexical similarity and is not applied to mapped readers. Mapped media may legitimately repeat their canonical per-result physical action; their own participation, grounding and single-cast rules continue to govern that choreography.

A ritual also cannot repeat the same active tarot preparation inside its own combined opening/ritual/gesture paragraph. The hidden current result must remain concealed until the reveal stage, so pre-reveal prose that turns or places it face-up is rejected even if it does not name the result.

## Human-review findings

Some defects are better handled by stronger natural-language instructions and manual review than by brittle lexical rejection. Examples from paid output included redundant constructions such as `exploremos contigo`, repeated roots such as `conversación clara para aclarar`, and anthropomorphic invitation wording in which a card was said to want to hear a word. The shared Spanish task prompts discourage these constructions.

The latest paid run also invented an unstated material property in `la madera de las cartas cede al tacto`. Because physical scene details for Selena belong in persona data rather than a global regex, Selena's bilingual persona now explicitly tells generation not to invent materials or physical properties of the tarot deck that the scene has not established.

Human review remains mandatory after the deterministic suite is green.
