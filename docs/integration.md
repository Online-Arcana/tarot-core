# Online Arcana integration

Online Arcana consumes core as a recursively pinned Git submodule.

```text
agent/front-end
└── src/core/lib       -> agent/core
    └── src/vendor/openai-schema
```

The front-end branch retains stable adapter modules such as `src/core/model.ts` and `src/core/deck.ts`. Each adapter re-exports the corresponding refactored source module under `src/core/lib/src/`. Application imports therefore remain stable while core keeps its responsibility-based directory layout.

## Initialise

From the front-end checkout:

```bash
git submodule sync --recursive
git submodule update --init --recursive
```

Install dependencies for the nested libraries and application:

```bash
npm install --prefix src/core/lib/src/vendor/openai-schema
npm install --prefix src/core/lib
bun install
```

## Compile

The front end compiles browser, worker and Bun server targets separately. Only modules reachable from each target's entry points are emitted, so the browser build does not automatically bundle CLI or server-only model code.

```bash
bun run check
bun run build
```

## Dependency direction

Core supplies draw mechanics, contracts, readers, staged-reading helpers, handovers, request parsing and structured model orchestration. Online Arcana supplies its language packs, assets, browser storage, encrypted `.arcana` files, DOM presentation, deployment adapter and runtime model configuration.

This split permits the reduced CLI and other consumers to use the same engine implementation without importing browser code or duplicating tarot logic.

The application branch remains documented by its own `README.md` and rendered About, step-by-step and FAQ pages.
