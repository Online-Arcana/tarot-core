# Reduced JSON CLI

The CLI is a thin command adapter over the same deck, audit and structured model functions exported by the library.

## Launch

```bash
export OPENAI_API_KEY='...'
export TAROT_PACK='/absolute/path/to/public/lang/en-GB.json'

npm run cli --silent <<'JSON'
{
  "name": "Kitty",
  "reader": "selena",
  "spread": "three",
  "question": "What should I understand about this situation?"
}
JSON
```

The pack may instead be passed explicitly:

```bash
npm run cli --silent -- --pack ./public/lang/en-GB.json < request.json
```

## Model overrides

The default reading lane is:

```text
gpt-5.4-nano -> deterministic NLP audit -> gpt-5.4-mini -> deterministic NLP audit -> reconstruction
```

Environment overrides are optional:

```bash
export TAROT_SHORT_PRIMARY_MODEL='gpt-5-nano'
export TAROT_SHORT_ESCALATION_MODEL='gpt-5-mini'
export TAROT_LONG_PRIMARY_MODEL='gpt-5.4-nano'
export TAROT_LONG_ESCALATION_MODEL='gpt-5.4-mini'
```

`TAROT_MODEL` remains a compatibility alias for `TAROT_LONG_PRIMARY_MODEL`.

## Input

```ts
interface CliInput {
  name: string;
  reader: ReaderId;
  spread: SpreadId;
  question: string;
  sessionKey?: string;
  lang: string;
}
```

`lang` defaults to `en-GB`. `sessionKey` is optional. Input must be one JSON object read to end-of-file from standard input.

Limits:

- `name`: 1–80 characters
- `question`: 1–2,000 characters
- `lang`: 1–12 characters
- `sessionKey`: 1–200 characters

## Output

Successful output is one compact JSON line:

```json
{
  "ok": true,
  "sessionKey": "conv_...",
  "name": "Kitty",
  "reader": "selena",
  "spread": "three",
  "question": "What should I understand about this situation?",
  "lang": "en-GB",
  "draw": {},
  "response": {}
}
```

The CLI always opts into guaranteed output. If both model stages fail deterministic validation, it returns the reconstructed reading rather than failing the customer request.

When no remote conversation can be established, the CLI returns a `local_...` recovery key with the reconstructed reading. A later call accepts that key but does not send it to OpenAI; the next successful remote request creates a proper managed conversation ID.

Input, pack, reader and spread validation errors still use one JSON line and a non-zero exit code:

```json
{"ok":false,"error":{"message":"reader is invalid"}}
```

Model output quality failures do not use this error path.

## Behaviour

The CLI:

1. validates input
2. resolves and validates the language pack
3. expands and validates exactly 78 cards
4. draws the selected spread
5. calls the long-task primary model
6. audits the structured result deterministically
7. escalates once to the long-task mini model when required
8. audits the escalation result
9. deterministically reconstructs any remaining invalid fields
10. returns the complete draw, reading and available conversation or recovery key

It does not implement interactive prompts, archive files, browser persistence or rendering.
