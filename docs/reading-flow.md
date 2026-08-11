# Reading flow

Core exposes the domain operations used to build a complete reading while allowing the consuming interface to control presentation timing.

## 1. Validate the question context

A caller may run `fit` before drawing. The result classifies the dominant topic and reader suitability as `good`, `acceptable`, `weak` or `very_weak`, with an optional stronger reader recommendation.

`topicForQuestion` and `resolveFit` provide a deterministic routing layer for clearly expressed topics. Reader suitability is derived from maintained reader-profile data rather than a fixed reader-to-reader route. When the current reader is weak for a detected topic, the resolver evaluates the other profiles and may recommend an eligible reader whose strong topics include it. Strong and capable topics remain with the current reader.

The same rule applies regardless of the current or receiving reader. Grief is an ordinary fit topic rather than a crisis category: it proceeds into compatibility analysis and may produce a handover when another reader is stronger for it.

The front-facing application applies the fit gate to both new readings and follow-up chat. The user may accept the handover, continue with the current reader or cancel.

## 2. Draw and canonicalise

`Deck.draw` keeps the existing browser-facing draw contract: it selects the spread, cryptographically shuffles the supplied 78-card pack, assigns upright or reversed orientation and returns the selected draw for presentation and persistence.

The model boundary does not trust the descriptive prose carried by that browser object. When an `ApiReq` reaches core, request canonicalisation uses stable card IDs, orientation, spread ID and position to rebuild canonical bilingual names, meanings, spread purpose and position semantics from `src/data/deck.json` and `src/data/spreads.json`.

This preserves saved-reading and browser compatibility while making core-owned data authoritative for generation.

## 3. Generate rituals separately

For a multi-card spread, callers request one `ritual` task per result in reveal order. The compatibility request includes the result index and spread ID and may also include the current drawn result, the complete draw and earlier ritual paragraphs.

For the vanilla tarot reader, ritual prose stays non-interpretive and does not reveal the hidden result. For a mapped reader, core uses the hidden canonical result only to select the corresponding physical mapped item and ritual state. The returned public ritual describes the reader's physical medium and still must not name the hidden canonical result or mapped result before reveal.

Mapped participation, concealment, single-cast behaviour and grounding are driven by `src/readers/media/rituals.json`. Earlier ritual paragraphs are used only for continuity validation and continuation, so sequential cards do not replay substantially the same scene.

## 4. Interpret the complete draw

The `read` task receives the complete canonicalised draw and the completed narrator ritual theatre. It returns one `cardText` item per result plus synthesis, reading, closing and narrator note fields.

Prompt rules and deterministic validation prohibit an earlier interpretation from naming a later unrevealed result. The leak detector is phrase-aware and exempts a result name when that phrase was already present in the user's own question.

For mapped readers, model-facing result identity and historical generated context use public mapped entities rather than canonical tarot names. User-authored questions and facts are preserved unchanged.

## 5. Finalise before returning

Before `ApiOut` leaves core, finalisation:

- performs conservative Spanish narrator audience normalisation on narrator-owned fields only
- repairs future-result leakage in staged readings
- attaches public mapped-media presentation data where applicable
- restores internal canonical handover card state after mapped model prompting
- runs the ordinary deterministic audit again

The operation is idempotent. The existing Online Arcana response handler still applies `addressViewer()` and `repairFutureLeaks()` afterwards for compatibility; regression tests prove that sequence does not alter an already-finalised core result.

## 6. Build presentation stages

`readingStages` emits:

```text
question
for each result:
    ritual
    reveal
    speech
    place
synthesis
answer
closing
```

Result stage indexes are zero-based. Draw position numbers remain one-based for user-facing display.

## 7. Complete the reading

After a reading, separate tasks may generate:

- `suggest`: exactly three contextual follow-up questions
- `continue`: one new reader-specific invitation sentence
- `title`: a compact conversation title
- `chat`: direct follow-up dialogue using accumulated history

Narrator-owned chat gesture prose and reader dialogue remain separate voice domains. In Spanish, a narrator-only querent-name or tuteo pronoun-case failure can use the narrow field-only correction lane; unrelated reader dialogue is not regenerated.

## 8. Refer to another reader

`handoverSummary` can derive grounded deterministic fallback state from stored turns. A generated `handover` may enrich conclusions, facts and unresolved items, but core auditing restricts card references and questions to material actually supplied by the conversation.

Canonical handover state remains internal. When a mapped reader receives historical generated prose, exact known canonical entities are translated to approved public mapped entities. Ambiguous old generated prose that still depends on generic tarot-medium vocabulary is omitted rather than rewritten. User-authored questions and facts are never scrubbed.

The displayed receiving acknowledgement is persona-owned handover/return prose. The generated structured `handover.summary` remains handover state and is not repurposed as reader dialogue.

The consuming application owns file export, encrypted local storage, visit trails and the user-facing transition between conversations.

## 9. Return to a previous reader

A `return` task uses the supplied visit trail and handover state to produce a reader-specific acknowledgement grounded in actual history. Mapped return prompting applies the same public-medium boundary as other mapped historical context.

Fallback return prose is selected from persona/canonical fallback data only when it satisfies the normal language and direct-address audit; otherwise the neutral validated fallback is used.

## Release behaviour

Customer-facing callers enable guaranteed output. Primary and escalation candidates are audited; constrained correction or deterministic reconstruction is used when required. A reconstructed ritual is explicitly kept distinct from the bare emergency fallback that the unchanged Online Arcana handler rejects.

The placeholder remains an application-level emergency protection, but ordinary core generation is designed to return audited prose through primary, escalation or diagnosable reconstruction rather than expose a failed intermediate attempt.
