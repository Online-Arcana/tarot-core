# Security notes

## Draw randomness

Deck selection uses `crypto.getRandomValues` with rejection sampling rather than modulo-biased random indexes. The Fisher–Yates shuffle covers the canonical 78-card deck, and card orientation is selected independently.

Tarot output remains reflective content, not a security decision or prediction guarantee.

## Untrusted JSON and semantic authority

Treat compatibility packs, HTTP bodies, stored conversations and model output as untrusted.

Shape validation alone is not enough for card/spread data because a structurally valid client object could carry a false name or meaning. Core therefore separates protocol compatibility from semantic authority:

- `loadCards` requires the exact canonical 78-card ID set and rejects generated rank×suit recipes.
- `parseReq` validates transport shape/lengths and canonicalises draw semantics from stable IDs, orientation, spread ID and position.
- client/pack card names, suits, meanings, spread purpose and position prose are not trusted as model facts.
- `OpenAISchema` enforces strict structured model output shape.
- `auditModelOut` and core finalisation enforce language, voice, reveal-order, mapped-medium and presentation invariants after parsing.
- `handoverConv` and handover auditing restrict generated state against source conversation material.

Mapped systems also separate archival/research fields from public `MediumPresentation`; research notes are not copied into client-visible output merely because they are present in a map archive.

## Credentials

Never place `OPENAI_API_KEY` in card packs, client bundles, conversation objects, CLI input or committed test fixtures. Supply it through the server environment or direct library configuration.

The paid 80-reading prose matrix is intentionally local. `npm run test:live` reads `OPENAI_API_KEY` from the local environment; GitHub CI only syntax-checks the harness and does not run model calls.

## Local live-test artefacts

Live reports under `reports/` preserve accepted prose, raw model attempts and diagnostics for human review. They are gitignored by the repository, but should still be treated as review data rather than source code.

The maintained harness does not intentionally write the API key or request authorization headers into those reports. If a future live test uses real user questions instead of the current synthetic matrix prompts, its output may contain user-provided or model-derived sensitive text and should be handled accordingly.

## Managed model sessions

The CLI's `sessionKey` may be an OpenAI conversation ID, not an encryption key. Treat it as application state and avoid exposing it unnecessarily. A local `local_...` key is only a recovery/session placeholder and is not sent back to OpenAI as a conversation ID.

Core does not persist conversations or archive files. A consuming application is responsible for storage, encryption, access control and retention.

## Model storage

The CLI and Online Arcana integration send `store: false` in their model request bodies. Other library consumers choose their own request body and should set storage behaviour deliberately.

## Prompt and output controls

Core requests strict structured output and rejects malformed, overly long, truncated, reveal-leaking, voice-invalid or ungrounded results. Spanish narrator audit also checks proper-name leakage and common tuteo pronoun-case failures using Unicode-aware token boundaries.

These controls reduce accidental metadata and narrative leakage but are not a substitute for application-level moderation, rate limiting, crisis/safeguarding logic, secret management or human cultural review.
