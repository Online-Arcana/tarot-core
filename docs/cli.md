# Reduced JSON CLI

The CLI is a thin command adapter over the same deck and structured model functions exported by the library.

## Launch

```bash
export OPENAI_API_KEY='...'
export TAROT_PACK='/absolute/path/to/public/lang/en-GB.json'
export TAROT_MODEL='gpt-5.4-mini' # optional

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

When no key is supplied, OpenAI creates a managed conversation and the new ID is returned. Supplying a previous `sessionKey` continues that conversation.

Errors also use one JSON line and a non-zero exit code:

```json
{"ok":false,"error":{"message":"reader is invalid"}}
```

## Behaviour

The CLI:

1. validates input
2. resolves and validates the language pack
3. expands and validates exactly 78 cards
4. draws the selected spread
5. runs one `read` task with structured output
6. returns the complete draw, reading and active conversation ID

It does not implement interactive prompts, archive files, browser persistence or rendering.
