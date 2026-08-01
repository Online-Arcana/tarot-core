# Security notes

## Draw randomness

Deck selection uses `crypto.getRandomValues` with rejection sampling rather than modulo-biased random indexes. The Fisher–Yates shuffle covers all 78 cards, and card orientation is selected independently.

Tarot output remains reflective content, not a security decision or prediction guarantee.

## Untrusted JSON

Treat language packs, HTTP bodies, stored conversations and model output as untrusted. Core validates these boundaries through explicit parsers and guards rather than unchecked casts.

- `loadCards` enforces deck completeness and unique IDs.
- `parseReq` enforces request shape, lengths and cross-field consistency.
- `OpenAISchema` enforces strict structured output.
- `isApiOut` and `validModelOut` enforce domain and presentation constraints.
- `handoverConv` grounds generated facts against the stored transcript.

## Credentials

Never place `OPENAI_API_KEY` in card packs, client bundles, conversation objects or CLI input. Supply it through the server environment or direct library configuration.

## Managed model sessions

The CLI's `sessionKey` is an OpenAI conversation ID, not an encryption key. Treat it as application state and avoid exposing it unnecessarily. It does not encrypt local reading data.

Core does not persist conversations or archive files. A consuming application is responsible for storage, encryption, access control and retention.

## Model storage

The reduced CLI sends `store: false` in its model request body. Other consumers choose their own request body and should set storage behaviour deliberately.

## Prompt and output controls

Core requests only strict JSON and rejects malformed, overly long, truncated, reveal-leaking or ungrounded results. These controls reduce accidental metadata and narrative leakage but are not a substitute for application-level moderation, rate limiting or secret management.
