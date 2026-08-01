# Getting started

## Checkout

Core contains the pinned `openai-schema` repository at `src/vendor/openai-schema`.

```bash
git clone --branch agent/core --single-branch \
  --recurse-submodules \
  https://github.com/kitty-crow/tarot_engine.git tarot-engine-core

cd tarot-engine-core
git submodule sync --recursive
git submodule update --init --recursive
```

## Install and validate

```bash
npm install
npm run check
npm test
npm run build
```

`check` performs strict TypeScript validation without writing output. `test` builds `dist/` and runs the Node test suite. `build` emits JavaScript and declarations from `src/`.

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

### Source submodule

Online Arcana pins this branch recursively and compiles the required source modules with its own TypeScript targets. See [Online Arcana integration](integration.md).

### CLI

The command adapter builds and launches through:

```bash
npm run cli --silent -- --pack /path/to/lang/en-GB.json
```

The same path may be provided through `TAROT_PACK`. See [CLI](cli.md).

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

The package is marked `private` and is not currently distributed through npm.
