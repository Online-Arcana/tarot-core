# Reading flow

Core exposes the domain operations used to build a complete reading while allowing the consuming interface to control presentation timing.

## 1. Validate the question context

A caller may run `fit` before drawing. The result classifies the dominant topic and reader suitability as `good`, `acceptable`, `weak` or `very_weak`, with an optional stronger reader recommendation.

`topicForQuestion` and `resolveFit` provide a deterministic routing layer for clearly expressed topics. Reader suitability is derived from the maintained reader profiles rather than left to prompt compliance. When the current reader is weak for a clearly detected topic and a strong specialist exists, `resolveFit` returns a `very_weak` decision with that specialist. For example, explicit grief or death questions route Selena to Mictli even if a model fit response is generic, malformed or unavailable.

The front-facing application applies this gate to both new readings and follow-up chat. The user may accept the handover, continue with the current reader or cancel.

## 2. Draw

`Deck.draw` selects the spread, cryptographically shuffles all 78 cards, assigns upright or reversed orientation and copies the selected meaning into each draw item. The returned draw is complete and should be persisted unchanged with the reading turn.

## 3. Generate rituals separately

For a multi-card spread, callers may request one `ritual` task per card. Ritual output is non-interpretive and knows only the draw number, question and spread ID. `withRituals` attaches these outputs to the completed reading.

## 4. Interpret the complete draw

The `read` task receives the complete draw but returns one `cardText` item per card. Prompt and deterministic validation prohibit an earlier item from naming a later card.

`leaksFuture` provides an additional client-side check. A later card name is permitted only when it was already present in the user's question.

## 5. Build presentation stages

`readingStages` emits:

```text
question
for each card:
    ritual
    reveal
    speech
    place
synthesis
answer
closing
```

Card stage indexes are zero-based. Draw position numbers remain one-based for user-facing display.

## 6. Complete the reading

After a reading, separate tasks may generate:

- `suggest`: exactly three contextual follow-up questions
- `continue`: one new reader-specific invitation sentence
- `title`: a compact conversation title
- `chat`: direct follow-up dialogue using accumulated history

## 7. Refer to another reader

`handoverSummary` derives a grounded fallback from stored turns. A generated `handover` task may enrich conclusions and unresolved items, but `handoverConv` replaces questions and cards with source-derived values and retains only facts found in the transcript.

The new conversation records the prior reader, target reader, referral reason, acknowledgement and cross-file visit trail. The source conversation is exported before the encrypted local slot is replaced, and the new conversation continues using the same user-facing key.

## 8. Return to a previous reader

A `return` task is accepted only when the trail shows at least two visits to that reader. This keeps returning-reader language tied to actual history rather than a client hint.
