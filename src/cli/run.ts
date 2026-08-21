import { randomUUID } from "node:crypto";
import type { Fetch } from "../vendor/openai-schema/src/openaiSchema.js";
import { Deck } from "../domain/deck.js";
import { runModelSession, type ModelOverrides, type ModelResult } from "../model/run.js";
import type { ApiReq, Draw, ReadingOut } from "../contracts/types.js";
import type { CliInput } from "./input.js";
import type { CliPack } from "./pack.js";

export interface CliCfg {
  readonly apiKey: string;
  readonly pack: CliPack;
  readonly model?: string;
  readonly escalationModel?: string;
  readonly models?: ModelOverrides;
  readonly fetch?: Fetch;
}

export interface CliModelDiagnostics {
  readonly source: ModelResult["source"];
  readonly primaryModel: string;
  readonly escalationModel: string;
  readonly auditErrors: readonly string[];
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
  readonly model: CliModelDiagnostics;
}

const remoteSession = (value: string | undefined): string | undefined =>
  value?.startsWith("local_") === true ? undefined : value;

function reading(result: ModelResult): ReadingOut {
  if (!("reading" in result.out)) {
    throw new Error("CLI read task returned a non-reading model result");
  }
  return result.out;
}

export async function runCli(input: CliInput, cfg: CliCfg): Promise<CliOutput> {
  const draw = new Deck(cfg.pack.cards).draw(cfg.pack, input.spread);
  const req: Extract<ApiReq, { task: "read" }> = {
    task: "read",
    lang: input.lang,
    reader: input.reader,
    name: input.name,
    history: [],
    question: input.question,
    draw,
  };
  const conversationId = remoteSession(input.sessionKey);
  const result = await runModelSession(cfg.pack, req, {
    apiKey: cfg.apiKey,
    conversation: true,
    guaranteeOutput: true,
    ...(cfg.models === undefined ? {} : { models: cfg.models }),
    ...(cfg.escalationModel === undefined ? {} : { escalationModel: cfg.escalationModel }),
    ...(conversationId === undefined ? {} : { conversationId }),
    ...(cfg.fetch === undefined ? {} : { fetch: cfg.fetch }),
    body: {
      ...(cfg.model === undefined ? {} : { model: cfg.model }),
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 5000,
    },
  });
  return {
    ok: true,
    sessionKey: result.sessionKey ?? input.sessionKey ?? `local_${randomUUID()}`,
    name: input.name,
    reader: input.reader,
    spread: input.spread,
    question: input.question,
    lang: input.lang,
    draw,
    response: reading(result),
    model: {
      source: result.source,
      primaryModel: result.primaryModel,
      escalationModel: result.escalationModel,
      auditErrors: [...result.auditErrors],
    },
  };
}
