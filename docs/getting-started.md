# Getting started

## Checkout

The maintained repository is `Online-Arcana/tarot-core`. Core contains the pinned `openai-schema` repository at `src/vendor/openai-schema`.

For the audited branch while it is under release review:

```bash
git clone --branch agent/core-prose-audit --single-branch \
  --recurse-submodules \
  https://github.com/Online-Arcana/tarot-core.git tarot-core

cd tarot-core
git submodule sync --recursive
git submodule update --init --recursive
```

After the audited lineage is promoted, use the approved `main` commit/tag instead of the review branch.

## Install and validate

```bash
npm ci
npm run ci
```

`npm run ci` performs the complete zero-network engineering gate:

1. regenerates persona and fallback derived data
2. type-checks maintained TypeScript
3. syntax-checks the local paid-test harness without calling a model
4. builds `dist/`
5. runs the deterministic Node test suite, including the exhaustive reader/language/spread matrix

For individual steps:

```bash
npm run check
npm run check:live-harness
npm run build
npm test
```

`npm test` expects the built `dist/` surface, so use `npm run build` first when running it outside `npm run ci`.

## Runtime assumptions

Core targets Node.js 22 or later and modern browser runtimes. Draws use the Web Crypto global `crypto.getRandomValues`; conversation and handover helpers use `crypto.randomUUID` where an ID must be created.

The package uses ESM. Authored TypeScript imports use `.js` specifiers so emitted ESM resolves directly after compilation.

## Consumption modes

### Built package

After `npm run build`, import from the package root or an exported subpath:

```ts
import { Deck, parseReq, runModel } from "tarot-engine-core";
import type { ApiReq, Draw } from "tarot-engine-core/contracts/types";
```

The package is private and is not currently published to npm.

### Source submodule

Online Arcana pins this repository at `src/core` and compiles the required source modules with its own TypeScript targets. See [Online Arcana integration](integration.md).

### CLI

The command adapter builds and launches through:

```bash
npm run cli --silent -- --pack /path/to/lang/en-GB.json
```

The same path may be provided through `TAROT_PACK`. CLI packs must use the exact canonical card ID set and explicit card arrays; generated rank×suit card recipes are not supported. See [CLI](cli.md) and [Card and spread packs](packs.md).

### Local live-model release test

Paid model validation is deliberately local and is not part of GitHub Actions:

```bash
export OPENAI_API_KEY='...'
npm run test:live
```

Run it only from a deterministic-green release candidate, preferably a clean checkout. It records the local Git `HEAD` in the generated reports and writes aggregate plus human-review artefacts under `reports/`, which is ignored by Git.

## Package exports

The package exposes the root barrel and these subpath groups:

```text
cli/*
contracts/*
domain/*
model/*
packs/*
readers/*
reading/*
transport/*
```
