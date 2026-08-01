# Model orchestration

The model layer converts a validated `ApiReq` into a strict OpenAI structured-output request and returns a validated domain object.

## Configuration

```ts
interface ModelCfg {
  apiKey: string;
  body: Dict & { model: string };
  conversation: boolean;
  conversationId?: string;
  fetch?: Fetch;
  retries?: number;
  retryDelayMs?: number;
}
```

`body` is passed to the Responses API wrapper and normally includes model, storage, reasoning and output-token settings. `fetch` allows tests or alternative runtimes to inject transport.

## Prompt construction

`modelPrompt` composes, in order:

1. the language-specific system prompt
2. the selected reader's persona prompt
3. explicit reader identity and pronouns
4. task instructions
5. an optional deterministic correction instruction
6. the task payload as JSON

The prompt always requests only the structured JSON object.

## Task schemas

`outputShape` builds one strict schema per task. Read schemas constrain `cardText` to exactly the draw length. Fit values, topics and recommendations are enum-constrained. Suggestion counts, handover arrays and nullable recommendations are represented in the schema rather than recovered from free text.

## Validation and correction

Structured schema parsing is followed by task-specific deterministic checks in `validModelOut`, including:

- theatre paragraph word counts and complete endings
- no ellipses or truncated sentences
- one-line invitation, fit and continuation fields
- title and summary length limits
- exact handover list limits
- no later card name in an earlier per-card interpretation

If the first structured result fails, core sends one correction prompt through the same `OpenAISchema` instance. A second failure throws `Invalid structured model output`.

## Conversations

`runModelSession` may create or continue a managed OpenAI conversation:

```ts
const result = await runModelSession(pack, req, {
  apiKey,
  conversation: true,
  conversationId: previousSessionKey,
  body,
});
```

`result.sessionKey` is the conversation ID exposed by `openai-schema`. Reuse it for later calls that should share model context. `runModel` is the convenience form when the caller needs only `out`.

A single application reading should reuse one conversation ID where contextual consistency is required. Tasks remain separate requests with task-specific schemas; core does not ask one response to fill unrelated interpretation fields simultaneously.

## Model selection

Core does not hard-code the library model. The caller supplies `body.model`. The reduced CLI defaults to `gpt-5.4-mini` and accepts `TAROT_MODEL` as an override.
