# Testing and maintenance

The `.mts` files under `test/` are retained only as a traceable record of previously exercised behaviour. They are not compiled, installed, invoked or required by the package build, checks, CI or release process.

## Required commands

```bash
npm run check
npm run build
```

- `check` validates the maintained TypeScript source under `src/` without emitting files.
- `build` emits the maintained library source into `dist/`.
- `ci` runs only `check` and `build`.

The retained test files may be consulted when tracing earlier implementation decisions. They do not constitute a current acceptance gate and must not block normal development or release progress.

Generated `dist/` output is not authoritative source. Source changes belong under `src/`; build output should be regenerated locally as needed.
