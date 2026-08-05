# Testing and maintenance

The files under `test/` are retained as an implementation record and for explicit manual regression checks. They are not part of the required build or CI path and must not block normal development or release progress.

## Required commands

```bash
npm run check
npm run build
```

- `check` runs strict TypeScript validation with `noEmit`.
- `build` emits ESM JavaScript and declaration files into `dist/`.
- `ci` runs only `check` and `build`.

## Optional manual tests

```bash
npm test
npm run test:media
```

These commands are opt-in. They build the library and run the retained `.mts` regression tests with Node's test runner and native type stripping.

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

Generated `dist/` output is not authoritative source. Source changes belong under `src/`; build output should be regenerated locally as needed.
