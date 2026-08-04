# Model orchestration

The model layer converts a validated `ApiReq` into strict structured output, audits every generated candidate deterministically and can reconstruct a complete customer-facing object when both model stages fail.

## Model lanes

Tasks use one of two independent lanes:

```text
short tasks: gpt-5-nano     -> audit -> gpt-5-mini     -> audit -> reconstruction
long tasks:  gpt-5.4-nano   -> audit -> gpt-5.4-mini   -> audit -> reconstruction
```

`read` and `chat` are long tasks. Invitation, fit, ritual, suggestions, continuation, title, handover and returning-reader tasks are short tasks.

The default catalogue is exported as `DEFAULT_MODEL_TIERS`. A caller may override any role through `models` without changing task classification.

## Configuration

```ts
interface ModelCfg {
  apiKey: string;
  body: Dict & { model?: string };
  models?: {
    shortPrimary?: string;
    shortEscalation?: string;
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

`body.model` remains a compatibility override for the primary model in the selected lane. `escalationModel` remains a compatibility override for that lane's escalation model.

Guaranteed recovery is deliberately opt-in for library consumers. With `guaranteeOutput` omitted or false, core throws `ModelOutputError` after both audited model stages fail. This strict mode exists for debugging, tests and applications that deliberately want failure visibility.

Customer-facing callers must set:

```ts
guaranteeOutput: true
```

The Online Arcana worker and the reduced CLI do this by default.

## Prompt construction

`modelPrompt` composes, in order:

1. the language-specific system prompt
2. the selected reader's persona prompt
3. explicit reader identity and pronouns
4. task instructions
5. deterministic audit findings and the previous candidate during escalation
6. the task payload as JSON

The prompt requests only the complete structured JSON object. Escalation is a constrained correction, not an invitation to replace sound conclusions unnecessarily.

## Structured schemas

`outputShape` builds one strict schema per task. Read schemas constrain `cardText` to exactly the draw length. Fit values, topics and recommendations are enum-constrained. Suggestion counts, handover arrays and nullable recommendations are represented in the schema rather than recovered from free text.

Schema validation happens before deterministic NLP auditing. A malformed response therefore cannot bypass the strict output contract.

## Deterministic NLP audit

`auditModelOut` runs after the primary and escalation calls. It returns explicit path-based findings rather than a boolean only.

Checks include:

- required length ranges and one-line constraints
- complete sentence endings without truncation or ellipses
- direct second-person wording where required
- exact suggestion and card interpretation counts
- atmospheric theatre paragraph bounds
- duplicated substantive fields
- no internal JSON references in prose
- no later card name in an earlier card interpretation
- exact supplied card names in handovers
- title, summary and list limits

The escalation prompt receives those exact findings together with the previous candidate so it can preserve valid content and repair only the failed material.

## Deterministic reconstruction

When `guaranteeOutput` is true and the escalation result still fails, `reconstructModelOut` becomes the final customer-facing stage.

Reconstruction:

- prefers the latest usable field from the primary or escalation candidate
- normalises whitespace and removes exposed internal references
- trims at natural sentence boundaries
- enforces list and word limits
- rejects later-card leakage and invented handover card names
- preserves supplied card and position context
- fills only unresolved fields from the fallback catalogue
- audits the completed object again

The canonical fallback wording is stored in `src/model/fallbacks.xml`. `src/model/fallback.ts` is the typed runtime mirror. Fallback wording is the last field-level safety net, not a replacement for a complete generated interpretation.

## Result provenance

`runModelSession` reports how the result was obtained:

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

`auditErrors` is internal observability data. It must not be shown as customer-facing prose.

## Conversations

`runModelSession` may create or continue a managed OpenAI conversation:

```ts
const result = await runModelSession(pack, req, {
  apiKey,
  conversation: true,
  conversationId: previousSessionKey,
  guaranteeOutput: true,
  body: { store: false },
});
```

`result.sessionKey` is the conversation ID exposed by `openai-schema`. The CLI creates a local recovery key when both remote calls fail before a remote conversation exists. A local recovery key is not sent back to OpenAI on the next request; the next successful call establishes a new remote conversation.
