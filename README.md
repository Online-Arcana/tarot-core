# Tarot Engine Core

A strongly typed TypeScript library for tarot draws, reader profiles, staged readings, handovers and structured OpenAI interpretation. It is the shared engine used by Online Arcana and also includes a reduced JSON-in/JSON-out CLI.

```text
card and spread pack
    -> cryptographic draw
    -> validated task request
    -> reader-specific structured interpretation
    -> validated domain output
```

## Requirements

- Node.js 22 or later
- TypeScript 5.8 or later
- a recursive Git checkout for the pinned `openai-schema` submodule

## Use

```bash
git submodule update --init --recursive
npm install
npm run check
npm test
npm run build
```

The package is source-available and currently consumed as a pinned submodule rather than published to npm.

```ts
import { Deck, runModel } from "tarot-engine-core";

const draw = new Deck(cards).draw(pack, "three");
const out = await runModel(pack, {
  task: "read",
  lang: "en-GB",
  reader: "selena",
  name: "Kitty",
  history: [],
  question: "What is changing here?",
  draw,
}, model);
```

## CLI

Provide one JSON object on standard input and a compatible language-pack manifest through `--pack` or `TAROT_PACK`.

```bash
export OPENAI_API_KEY='...'
export TAROT_PACK='/path/to/public/lang/en-GB.json'

echo '{"name":"Kitty","reader":"selena","spread":"three","question":"What is changing here?"}' \
  | npm run cli --silent
```

The result contains the draw, structured reading and OpenAI conversation ID. Pass that ID back as `sessionKey` to continue the same managed model conversation.

## Source layout

```text
src/cli/         reduced command adapter
src/contracts/   domain contracts and runtime guards
src/domain/      deck and draw mechanics
src/model/       prompts, schemas and structured execution
src/packs/       card-pack expansion and validation
src/readers/     identities, fit profiles and personas
src/reading/     reveal, stage and handover logic
src/transport/   request parsing and validation
```

## Documentation

- [Documentation index](docs/README.md)
- [Getting started](docs/getting-started.md)
- [Library API](docs/library.md)
- [Contracts](docs/contracts.md)
- [Card and spread packs](docs/packs.md)
- [Model orchestration](docs/model.md)
- [Reading flow](docs/reading-flow.md)
- [Reader profiles](docs/readers.md)
- [CLI](docs/cli.md)
- [Online Arcana integration](docs/integration.md)
- [Testing and maintenance](docs/testing.md)
- [Security notes](docs/security.md)

## Licence

The engine is proprietary source-available software. See [LICENSE](LICENSE).

Section 2 of the licence records the project's cultural inspirations, expressly
disclaims ownership of historical, folkloric and living cultural heritage, and
acknowledges the peoples whose traditions helped inspire the fictional readers.
