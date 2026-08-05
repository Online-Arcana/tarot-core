# Testing and maintenance

## Commands

```bash
npm run check
npm run build
npm test
```

- `check` runs strict TypeScript validation with `noEmit`.
- `build` emits ESM JavaScript and declaration files into `dist/`.
- `test` builds first and then runs every `test/*.test.mts` file with Node's test runner and native type stripping.

## Test coverage

| File | Coverage |
| --- | --- |
| `boundary.test.mts` | source and dependency boundaries |
| `cards.test.mts` | explicit card lists, generated recipes and 78-card validation |
| `cli.test.mts` | input parsing, pack loading, successful output, errors and sessions |
| `deck.test.mts` | deck size, unique IDs, spread draws and card orientation |
| `model.test.mts` | schema shape, prompts, validation, correction and conversation IDs |
| `request.test.mts` | task-specific transport parsing and rejection cases |
| `stages.test.mts` | rituals, reveal ordering, stage generation and future-card leakage |

## Change rules

When changing a public contract, update its runtime guard, request parser, schema generation, tests and the relevant documentation together.

When adding a model task, add:

1. the task literal and request/output contracts
2. runtime output guard
3. transport parser branch
4. structured schema
5. task prompt and payload
6. deterministic validation and correction where needed
7. tests for valid and invalid outputs

When changing card or spread data formats, preserve the exact 78-card and unique-ID checks.

Generated `dist/` output is not authoritative source. Source changes belong under `src/`; build output should be regenerated locally as needed.
