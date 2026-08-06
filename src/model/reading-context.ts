import type { ApiReq } from "../contracts/types.js";
import { isMappedReader, mediaFor } from "../readers/media/runtime.js";

export function revealedReadingContext(
  req: Extract<ApiReq, { task: "ritual" }>,
): readonly unknown[] {
  const cards = req.draw?.cards.slice(0, req.card) ?? [];
  return cards.map(card => {
    const base = {
      position: card.pos,
      positionName: card.posName,
      positionPurpose: card.posMeaning,
      meaning: card.meaning,
    };
    if (!isMappedReader(req.reader)) {
      return {
        ...base,
        resultName: card.name,
        resultFamily: card.suit,
        resultState: card.side,
      };
    }
    const medium = mediaFor(req.reader, card, req.lang);
    return medium ? {
      ...base,
      resultName: medium.publicName,
      resultFamily: medium.publicCategory,
      resultState: medium.publicState,
    } : base;
  });
}
