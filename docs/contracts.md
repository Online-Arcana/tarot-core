# Contracts

The public domain contracts live in `src/contracts/types.ts`; runtime guards live in `src/contracts/guard.ts`.

## Stable identifiers

### Spreads

```text
one
three
decision
advice
celtic
```

### Readers

```text
selena
brennos
yejide
ngaru
ame
amaru
nahid
mictli
```

### Model tasks

| Task | Required task data | Output |
| --- | --- | --- |
| `invite` | base context | `InviteOut` |
| `fit` | `question` | `FitOut` |
| `ritual` | `question`, `spread`, zero-based `card` | `RitualOut` |
| `read` | `question`, `draw` | `ReadingOut` |
| `chat` | `question` | `ChatOut` |
| `suggest` | completed reading `turn` | `SuggestOut` |
| `continue` | completed reading `turn` | `ContinueOut` |
| `title` | completed reading `turn` | `TitleOut` |
| `handover` | `question`, target reader, source `conv` | `HandoverOut` |
| `return` | a qualifying reader `trail` | `ReturnOut` |

Every request also carries `lang`, `reader`, `name` and `history`. `trail` and `handover` are included where relevant.

## Draw contracts

`CardDef` is the canonical card definition. `SpreadDef` contains the spread name, purpose and ordered positions. A `Draw` copies the selected spread metadata and adds one `DrawnCard` for each position.

Each drawn card records:

- one-based position number
- position name and meaning
- optional physical placement label
- card ID, name and suit
- `upright` or `reversed` side
- the orientation-specific meaning selected at draw time

## Reading outputs

`ReadingOut` separates atmospheric theatre, per-card interpretations, synthesis, direct answer, closing and note. The array length of `cardText` must exactly match the draw length.

`Stage` is a discriminated presentation sequence. Card indexes in stages are zero-based because they address `draw.cards` directly.

## Conversation model

`Conv` is versioned with `v: 1` and stores:

- conversation ID and language
- active reader and querent name
- creation and update timestamps
- optional title
- optional cross-reader `Trail`
- optional incoming `Hand`
- ordered reading and chat turns

A reading turn contains the original question, immutable draw, structured reading output, optional continuation sentence and optional computed stages. A chat turn contains the question and structured dialogue response.

## Handovers

`HandoverOut` contains a concise summary and five grounded lists: questions, conclusions, cards, facts and unresolved items. `Hand` records the source and target readers, referral reason, grounded context and optional acknowledgement. `Trail` records every reader visit across related conversation files.

## Runtime validation

Important guard invariants include:

- card arrays contain one to ten cards
- known spread and reader IDs only
- output fields have the correct primitive shape
- invitations and continuation lines are single-line and length-limited
- suggestions contain three to six strings
- conversations contain valid turns, trails and handovers
- return tasks require at least two prior visits to the active reader

`parseReq` adds transport limits: names up to 80 characters, reading questions up to 2,000, chat questions up to 1,200 and language codes up to 12.
