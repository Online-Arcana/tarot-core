import type { ApiReq, Conv, ReadTurn } from "../contracts/types.js";
import { canonicalCardAt, canonicaliseDraw } from "./canonical.js";

function canonicalReadTurn(turn: ReadTurn, lang: string): ReadTurn {
  return {
    ...turn,
    draw: canonicaliseDraw(turn.draw, lang),
  };
}

function canonicalConv(conv: Conv, lang: string): Conv {
  return {
    ...conv,
    turns: conv.turns.map(turn => turn.kind === "reading" ? canonicalReadTurn(turn, lang) : { ...turn }),
  };
}

/**
 * Rebuild every card/spread semantic field carried by a typed ApiReq from stable IDs.
 *
 * `parseReq()` already does this for untrusted wire input. This second boundary exists for
 * direct library callers, which can construct an ApiReq without going through transport
 * parsing. The function never mutates the caller's object and throws when a typed request
 * contains impossible canonical state.
 */
export function canonicaliseApiReq(req: ApiReq): ApiReq {
  switch (req.task) {
    case "ritual": {
      const draw = req.draw === undefined ? undefined : canonicaliseDraw(req.draw, req.lang);
      if (draw !== undefined && draw.id !== req.spread) {
        throw new Error(`Ritual spread ${req.spread} does not match draw spread ${draw.id}`);
      }
      const current = draw?.cards[req.card];
      if (draw !== undefined && current === undefined) {
        throw new Error(`Ritual card index ${req.card} is outside spread ${draw.id}`);
      }
      const supplied = req.drawn === undefined
        ? undefined
        : canonicalCardAt(req.drawn.id, req.drawn.side, req.card + 1, req.spread, req.lang);
      if (current !== undefined && supplied !== undefined && current.id !== supplied.id) {
        throw new Error(`Ritual drawn card ${supplied.id} does not match draw card ${current.id}`);
      }
      return {
        ...req,
        ...(draw === undefined ? {} : { draw }),
        ...(req.drawn === undefined ? {} : { drawn: current ?? supplied! }),
      };
    }
    case "read":
      return { ...req, draw: canonicaliseDraw(req.draw, req.lang) };
    case "suggest":
    case "continue":
    case "title":
      return { ...req, turn: canonicalReadTurn(req.turn, req.lang) };
    case "handover":
      return { ...req, conv: canonicalConv(req.conv, req.lang) };
    case "invite":
    case "fit":
    case "chat":
    case "return":
      return { ...req };
  }
}
