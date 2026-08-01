# Library API

`src/index.ts` re-exports the complete supported library surface.

## Draw a spread

```ts
import { Deck } from "tarot-engine-core";
import type { CardDef, DrawPack } from "tarot-engine-core";

const cards: CardDef[] = loadMyCards();
const pack: DrawPack = loadMySpreads();
const draw = new Deck(cards).draw(pack, "three");
```

`Deck` requires exactly 78 cards with unique IDs. `draw` finds the selected spread, performs an unbiased Web Crypto shuffle, assigns an independent upright or reversed side to every card and returns the selected cards in spread-position order.

## Parse an API request

```ts
import { parseReq } from "tarot-engine-core";

const req = parseReq(body, new Set(["en-GB", "es-ES"]));
if (!req) throw new Error("Invalid request");
```

`parseReq` returns the discriminated `ApiReq` union or `null`. It validates task-specific fields, lengths, reader IDs, spread IDs, history, conversations, handovers and return-visit requirements.

## Run a structured model task

```ts
import { runModel } from "tarot-engine-core";

const out = await runModel(pack, req, {
  apiKey: process.env.OPENAI_API_KEY!,
  conversation: true,
  body: {
    model: "gpt-5.4-mini",
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: 5000,
  },
});
```

Use `runModelSession` when the caller also needs the managed OpenAI conversation ID:

```ts
const { out, sessionKey } = await runModelSession(pack, req, cfg);
```

The model layer generates a task-specific strict schema, validates the parsed output, applies deterministic length and reveal-order checks, and performs one correction pass before failing.

## Reading presentation data

```ts
import { readingStages, withRituals, leaksFuture } from "tarot-engine-core";
```

- `withRituals` attaches per-card rituals to a completed reading while preserving the legacy first-card theatre fields.
- `readingStages` converts a draw and reading into the exact question → ritual → reveal → speech → placement → synthesis → answer → closing sequence.
- `leaksFuture` detects later card names appearing in an earlier card interpretation unless the user already named that card in the question.

## Handovers

```ts
import { handoverConv, handoverSummary } from "tarot-engine-core";

const summary = handoverSummary(conv, referral);
const next = handoverConv(conv, referral, crypto.randomUUID(), now, generated);
```

`handoverSummary` derives grounded questions, conclusions and card names from the source conversation. `handoverConv` creates the next reader conversation, preserves the trail, validates the target and filters generated facts against the source transcript.

## Reader helpers

```ts
import {
  DEF_READER,
  READER_IDS,
  isReader,
  profileFor,
  profilePrompt,
  profiles,
  readerIdentity,
} from "tarot-engine-core";
```

These helpers expose stable reader IDs, profiles, localised identity text and the persona prompt used by model orchestration.

## Runtime guards

The `contracts/guard` module exports guards for every structured output family plus `isConv`, `rec`, `str` and `isApiOut`. Use them at persistence, network and model boundaries rather than casting untrusted JSON.
