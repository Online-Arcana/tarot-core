# Model orchestration

The model layer converts a validated, core-canonicalised `ApiReq` into the unchanged `ApiOut` contract used by Online Arcana. Generation is bilingual, reader-aware and medium-aware, but card and spread facts always come from core-owned canonical data rather than client prose.

## Pipeline

```text
canonical request
    -> reader persona + mapped medium data when applicable
    -> shared bilingual prompt builder
    -> strict structured-output parse/shape retry
    -> primary candidate
    -> pre-audit core preparation
       (Spanish narrator audience normalisation + reveal safety + mapped handover state)
    -> deterministic audit
    -> attach public mapped-media presentation data
    -> constrained escalation or narrow Spanish narrator correction when needed
    -> pre-audit core preparation
    -> deterministic audit
    -> attach public mapped-media presentation data
    -> deterministic reconstruction when guaranteed output is enabled
    -> pre-audit core preparation
    -> final deterministic audit
    -> attach public mapped-media presentation data
    -> unchanged ApiOut
```

The model runner never relies on presentation attachment to make generated prose valid. `prepareModelOutDetailed()` performs the prose-changing finalisation steps before the last audit and deliberately returns no mapped `media` or `medium` presentation metadata. Only after that candidate passes the ordinary audit does the runner call `attachMedia()`.

`finaliseModelOutDetailed()` remains the compatibility helper for direct callers: it performs the same preparation and then attaches public presentation metadata. Both preparation and public finalisation are idempotent, so the existing application may still run its compatibility post-processing without changing an already-finalised result.

## Model lanes

Tasks use three independently configurable lanes:

```text
ordinary short tasks: gpt-5-nano    -> audit -> gpt-5.6-luna -> audit -> recovery
ritual:               gpt-5-mini    -> audit -> gpt-5.6-luna -> audit -> recovery
read / chat:           gpt-5.6-luna -> audit -> gpt-5.6-luna -> audit -> recovery
```

`DEFAULT_MODEL_TIERS` keeps primary and escalation assignments separate even when two roles currently use the same model. Callers may override the individual roles through `models` without changing task classification.

The structured-output parse/shape retry budget defaults to one retry when the caller omits `retries`.

## Language and voice contracts

English output is requested as natural British English. Spanish output is requested as natural Spain Spanish with tuteo and normal Spanish subject omission where the acting subject is already clear.

Narrator and reader voices are separate:

- narrator fields describe the reader, movement, setting and ritual from outside
- reader fields are direct speech to the person receiving the reading
- reader dialogue is never passed through the narrator audience transform
- structured reader identity and pronoun metadata are private prompt data, not visible prose
- generic visible labels such as `the reader`, `el lector` and `la lectora` are rejected where a configured reader identity is required

Mapped readers receive the same base bilingual contract as the vanilla reader. Their physical medium augments the shared prompt rather than replacing the language or voice rules.

## Configuration

```ts
interface ModelCfg {
  apiKey: string;
  body: Dict & { model?: string };
  models?: {
    shortPrimary?: string;
    shortEscalation?: string;
    ritualPrimary?: string;
    ritualEscalation?: string;
    longPrimary?: string;
    longEscalation?: string;
  };
  escalationModel?: string;
  guaranteeOutput?: boolean;
  conversation: boolean;
  conversationId?: string;
  fetch?: Fetch;
  retries?: number;
  retryDelayMs?: number;
}
```

Guaranteed recovery is opt-in for general library consumers. When `guaranteeOutput` is false, both failed audited model stages produce `ModelOutputError`. Customer-facing Online Arcana calls enable guaranteed recovery so ordinary generation failures are reconstructed into an audited result instead of being exposed directly to the browser.

## Prompt and payload construction

`modelPrompt` combines:

1. the shared language contract
2. structured reader identity and XML-generated persona material
3. task and stage contracts
4. mapped-medium context where applicable
5. the task payload
6. correction findings only when a correction call is required

For mapped readers, model-facing result identity uses public mapped entities rather than canonical card IDs, canonical card names or orientation words. Handover and return history use the same boundary rule. Exact known canonical entities in historical generated prose can be translated to public mapped entities; ambiguous legacy generated prose that still depends on generic tarot-medium vocabulary is omitted rather than semantically rewritten. User-authored questions and facts are never scrubbed or altered by that boundary.

## Structured schemas

`outputShape` builds one strict schema per normal task. Read schemas require exactly one `cardText` entry per drawn result, suggestions require exactly three strings, and fit/handover fields are structurally constrained before prose auditing begins.

Spanish narrator grammar correction has a separate minimal schema. If the only failures are narrator-owned Spanish grammar issues that can be isolated safely, currently a leaked querent proper name or an invalid tuteo pronoun case such as `para tú` or `con ti`, Luna receives only the affected narrator string or strings and may return only those exact keys. Unaffected reader dialogue and other valid fields are not sent for regeneration and remain byte-for-byte unchanged. The merged candidate then passes normal preparation and the ordinary audit again before presentation metadata is attached.

The deterministic audience transform handles grammatical roles it can establish safely, including subject conjugation, `te` for recognised object roles, `ti` after recognised prepositions, `contigo` after `con`, and `tu`/`tus` for recognised possession. It never performs a blind proper-name-to-`tú` replacement. Uncertain roles remain unchanged for audit and constrained correction.

## Deterministic audit

`auditModelOut` is a collection of deterministic language-aware checks. It is not a dependency parser and is not described as an NLP parser.

Checks include:

- required word and line limits
- complete sentence endings
- direct-address evidence where required
- Spanish narrator first-person and querent-name leakage
- Spanish tuteo pronoun case, including `ti` after ordinary prepositions and `contigo` after `con`, while preserving legitimate phrases such as `de tú a tú`
- narrator/reader voice ownership
- exact suggestion and interpretation counts
- theatre paragraph bounds and continuity overlap
- mapped-medium grounding and participation contracts
- single-cast continuation rules
- generic reader labels
- canonical tarot-medium leaks in mapped dialogue
- duplicate substantive prose
- internal JSON-reference leakage
- later unrevealed result names in earlier interpretations, with user-question exemptions
- exact supplied handover cards and questions
- title, summary and list limits

Spanish pronoun token checks use Unicode-aware boundaries so accented forms such as standalone `tú` and `mí` are recognised correctly without matching longer words such as `túnel`.

Approved mapped entity names are distinguished from reader self-reference. For example, a public result whose proper name contains the reader's name is not rejected merely because the strings overlap.

## Recovery and fallbacks

When both model stages fail and `guaranteeOutput` is true, deterministic reconstruction attempts to preserve usable fields from the candidates and fill only unresolved material from canonical fallbacks.

`src/model/fallbacks.xml` is the authoritative fallback source. `scripts/generate-fallbacks.mjs` validates it and emits the ignored runtime data file `src/model/fallbacks.generated.json`; `fallback.ts` is a typed loader, not a separately authored prose catalogue.

Mapped ritual choreography is owned by `src/readers/media/rituals.json`. `ritual-recovery.ts` selects complete authored ritual sentences and complete shared atmosphere sentences from canonical data, then validates the assembled candidate. It contains no reader-specific ritual prose and does not interpolate arbitrary sensory fragments into grammatical sentence slots.

Reconstruction exceptions are not swallowed. `reconstructModelOutDetailed` returns diagnostics for successful reconstruction, and a reconstruction exception or invalid final recovery becomes a `ModelOutputError` diagnostic instead of pretending that a fallback succeeded.

## Result provenance

`runModelSession` reports how a result was obtained:

```ts
type ModelResult = {
  out: ApiOut;
  source: "primary" | "escalation" | "reconstructed";
  primaryModel: string;
  escalationModel: string;
  auditErrors: readonly string[];
  sessionKey?: string;
};
```

`auditErrors` also carries non-customer-facing preparation and correction diagnostics. It is observability data and must never be rendered as reading prose.

## Release gates

A green unit suite is not enough for a prose release. The deterministic release matrix covers all 8 readers, both languages, all 5 spreads and all applicable tasks. After that gate is green, the paid live matrix is run locally across 80 complete reader/language/spread combinations and preserves generated strings and provenance for human review.

Automated validation does not constitute cultural-specialist or prose approval. Human review remains required before the audited core replaces the application pin.
