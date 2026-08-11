# Library API

`src/index.ts` re-exports the supported library surface. Subpath exports are also available for consumers that need a narrower module boundary.

## Draw a spread

```ts
import { Deck } from "tarot-engine-core";
import type { CardDef, DrawPack } from "tarot-engine-core";

const cards: CardDef[] = loadExplicitCanonicalCards();
const pack: DrawPack = loadMySpreads();
const draw = new Deck(cards).draw(pack, "three");
```

`Deck` requires exactly the canonical 78 card IDs, not merely any 78 unique strings. `draw` finds the selected spread, performs an unbiased Web Crypto shuffle, assigns an independent upright or reversed side to every result and returns the selected cards in spread-position order.

The returned draw keeps the existing browser/persistence fields. Model-facing semantics are canonicalised again by stable IDs before generation, so a caller-provided name/meaning cannot override the core-owned canonical deck.

## Canonical data helpers

The `domain/canonical` surface exposes the validated core-owned deck/spread data used by request canonicalisation and deterministic tools. Use those helpers when a consumer needs canonical card IDs or a canonicalised draw rather than duplicating deck semantics outside core.

Canonical meanings are explicit. The library does not synthesise minor-arcana meanings from rank×suit recipes.

## Parse an API request

```ts
import { parseReq } from "tarot-engine-core";

const req = parseReq(body, new Set(["en-GB", "es-ES"]));
if (!req) throw new Error("Invalid request");
```

`parseReq` returns the discriminated `ApiReq` union or `null`. It validates task-specific fields, lengths, reader IDs, spread IDs, history, conversations, handovers and return context. It also rebuilds card/spread semantics from canonical IDs before the model layer sees them.

That means legacy/browser descriptive fields are accepted for protocol compatibility but are not trusted as semantic input.

## Run a structured model task

```ts
import { runModelSession } from "tarot-engine-core";

const result = await runModelSession(pack, req, {
  apiKey: process.env.OPENAI_API_KEY!,
  conversation: false,
  guaranteeOutput: true,
  body: {
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: 5000,
  },
});

console.log(result.out, result.source, result.auditErrors);
```

The model layer:

1. constructs the shared bilingual prompt from core-owned contracts/persona/media data
2. requests a task-specific strict structured schema
3. retries parse/shape failure within the configured retry budget
4. finalises and deterministically audits the primary candidate
5. uses constrained escalation or the minimal Spanish narrator correction lane when applicable
6. performs audited deterministic reconstruction when `guaranteeOutput` is enabled and both generated stages fail
7. returns provenance through `source`, model names and `auditErrors`

`runModel` is the convenience form when the caller needs only `ApiOut`. `runModelSession` is preferred when provenance or managed OpenAI conversation state matters.

The historical `ModelPack.prompt` strings remain accepted for API compatibility but do not author the current core generation prompt.

## Core finalisation

Finalisation is performed inside model orchestration before output is accepted. It is also exposed through the model subpath for tests/integration code that must reason about already-generated output.

Finalisation handles:

- conservative Spanish narrator audience normalisation
- staged-reading future-result repair
- public mapped-media attachment
- internal canonical handover card restoration after mapped prompting

It is designed to be idempotent with the unchanged Online Arcana compatibility post-processing.

## Reading presentation data

```ts
import { readingStages, withRituals, leaksFuture, repairFutureLeaks } from "tarot-engine-core";
```

- `withRituals` attaches per-result ritual output to a completed reading while preserving the legacy presentation structure.
- `readingStages` converts a draw and reading into the question → ritual → reveal → speech → placement → synthesis → answer → closing sequence.
- `leaksFuture` detects later result names appearing in an earlier interpretation unless the user already supplied that phrase in the question.
- `repairFutureLeaks` is the deterministic salvage operation used by core finalisation and retained app compatibility code.

## Handovers

```ts
import { handoverConv, handoverSummary } from "tarot-engine-core";

const summary = handoverSummary(conv, referral);
const next = handoverConv(conv, referral, crypto.randomUUID(), now, generated);
```

`handoverSummary` derives grounded state from the source conversation. `handoverConv` creates the next reader conversation, preserves the trail, validates the target and restricts generated state against source material.

Mapped model prompting uses a separate public-history boundary so hidden canonical tarot identity is not exposed to a reader whose public medium is something else. User-authored questions/facts are preserved unchanged.

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
  readerIdentityMeta,
  readerPronouns,
} from "tarot-engine-core";
```

These helpers expose stable reader IDs, validated XML-generated profiles and private structured identity metadata. `readerIdentity(id, lang)` serialises model-facing identity as XML rather than user-facing prose notation.

## CLI diagnostics

The CLI uses the same model orchestration path with guaranteed recovery enabled. Successful CLI output includes model provenance (`source`, primary/escalation model and `auditErrors`) so deterministic reconstruction is visible rather than silently replaced by a second fallback layer. Truly unrecoverable orchestration errors propagate to the CLI entry point and are returned as `{ ok: false, error }`.

## Runtime guards

The `contracts/guard` module exports guards for every structured output family plus `isConv`, `rec`, `str` and `isApiOut`. Use them at persistence, network and model boundaries rather than casting untrusted JSON.

Some guards intentionally tolerate legacy-compatible shapes that current generation no longer emits. For example, the suggestion guard can recognise older 3–6 item values, while current structured generation and deterministic audit require exactly three suggestions.
