# Reduced JSON CLI

The CLI is a thin command adapter over the same canonical deck, audit, model orchestration and deterministic recovery path exported by the library.

## Launch

```bash
export OPENAI_API_KEY='...'
export TAROT_PACK='/absolute/path/to/lang/en-GB.json'

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

The pack must contain explicit cards with the exact canonical 78-card ID set. Rank×suit card recipes are not supported. Pack card/spread prose is retained for compatibility/draw presentation, while model-facing semantics are rebuilt from core canonical data.

## Model overrides

The default reading lane is:

```text
gpt-5.6-luna -> finalise/audit -> gpt-5.6-luna constrained correction -> finalise/audit -> deterministic reconstruction
```

Environment overrides are optional:

```bash
export TAROT_SHORT_PRIMARY_MODEL='gpt-5-nano'
export TAROT_SHORT_ESCALATION_MODEL='gpt-5.6-luna'
export TAROT_LONG_PRIMARY_MODEL='gpt-5.6-luna'
export TAROT_LONG_ESCALATION_MODEL='gpt-5.6-luna'
```

`TAROT_MODEL` remains a compatibility alias for `TAROT_LONG_PRIMARY_MODEL`.

The settings remain independent even where current values match. The CLI currently runs a `read` task, so the long lane is the one exercised by normal CLI use.

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

Successful output is one compact JSON line and now includes model provenance:

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
  "response": {},
  "model": {
    "source": "primary",
    "primaryModel": "gpt-5.6-luna",
    "escalationModel": "gpt-5.6-luna",
    "auditErrors": []
  }
}
```

`model.source` is `primary`, `escalation` or `reconstructed`. When deterministic reconstruction was required, the original audit/recovery diagnostics remain in `model.auditErrors` rather than being hidden behind a second CLI fallback.

The CLI opts into guaranteed output. If the model stages fail but deterministic reconstruction succeeds, the CLI returns that audited reading with `source: "reconstructed"`.

When no remote conversation ID is available but an audited result can still be produced, the CLI returns a `local_...` key. A later call accepts that key but does not send it to OpenAI; a later successful remote session can obtain a managed conversation ID.

Input, pack, reader, spread and genuinely unrecoverable model/reconstruction errors use one JSON line and a non-zero exit code:

```json
{"ok":false,"error":{"message":"reader is invalid"}}
```

The CLI no longer catches an orchestration exception and silently substitutes a second generic fallback.

## Behaviour

The CLI:

1. validates input
2. resolves and validates the compatibility pack
3. requires explicit cards with the exact canonical 78-card ID set
4. draws the selected spread
5. builds a canonicalised model request from stable IDs
6. calls the configured long-task primary model
7. finalises and audits the structured result deterministically
8. uses the long-task escalation model for constrained correction when required
9. finalises/audits the corrected result
10. deterministically reconstructs remaining invalid output when guaranteed recovery can do so safely
11. returns the complete draw, reading, model provenance and available conversation/recovery key

It does not implement interactive prompts, archive files, browser persistence or rendering.
