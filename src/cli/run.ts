import type { Fetch } from "../vendor/openai-schema/src/openaiSchema.js";
import { Deck } from "../domain/deck.js";
import { runModelSession } from "../model/run.js";
import type { Draw, ReadingOut } from "../contracts/types.js";
import type { CliInput } from "./input.js";
import type { CliPack } from "./pack.js";

export interface CliCfg {
  readonly apiKey: string;
  readonly model: string;
  readonly pack: CliPack;
  readonly fetch?: Fetch;
}

export interface CliOutput {
  readonly ok: true;
  readonly sessionKey: string;
  readonly name: string;
  readonly reader: CliInput["reader"];
  readonly spread: CliInput["spread"];
  readonly question: string;
  readonly lang: string;
  readonly draw: Draw;
  readonly response: ReadingOut;
}

export async function runCli(input: CliInput, cfg: CliCfg): Promise<CliOutput> {
  const draw = new Deck(cfg.pack.cards).draw(cfg.pack, input.spread);
  const result = await runModelSession(cfg.pack, {
    task: "read",
    lang: input.lang,
    reader: input.reader,
    name: input.name,
    history: [],
    question: input.question,
    draw,
  }, {
    apiKey: cfg.apiKey,
    conversation: true,
    ...(input.sessionKey === undefined ? {} : { conversationId: input.sessionKey }),
    ...(cfg.fetch === undefined ? {} : { fetch: cfg.fetch }),
    body: {
      model: cfg.model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 5000,
    },
  });
  if (!result.sessionKey) throw new Error("The model session did not return a session key");
  if (!("reading" in result.out)) throw new Error("The model returned a non-reading response");
  return {
    ok: true,
    sessionKey: result.sessionKey,
    name: input.name,
    reader: input.reader,
    spread: input.spread,
    question: input.question,
    lang: input.lang,
    draw,
    response: result.out,
  };
}
