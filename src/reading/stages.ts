import type { StagedReading } from "./reveal.js";
import type { Draw, ReadingOut, RitualOut, Stage } from "../contracts/types.js";

export function compactRitual(parts: readonly string[]): string {
  return parts
    .map(text => text.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join(" ");
}

function ritualText(ritual: RitualOut | null | undefined): string {
  if (!ritual) return "";
  return compactRitual([ritual.gesture, ritual.opening, ritual.ritual]);
}

export function readingStages(
  draw: Draw,
  out: ReadingOut,
  rituals: readonly (RitualOut | null | undefined)[] = []
): Stage[] {
  const carried = rituals.length ? rituals : (out as StagedReading).rituals ?? [];
  const old = compactRitual([out.gesture, out.opening, out.link]);
  const stages: Stage[] = [{ kind: "question" }];

  draw.cards.forEach((_, card) => {
    const text = ritualText(carried[card]) || (card === 0 ? old : "");
    stages.push(
      { kind: "ritual", card, ...(text ? { text } : {}) },
      { kind: "reveal", card },
      { kind: "speech", card, text: out.cardText[card] ?? "" },
      { kind: "place", card }
    );
  });

  stages.push(
    { kind: "synthesis", text: out.synthesis },
    { kind: "answer", text: out.reading },
    { kind: "closing", text: out.closing }
  );
  return stages;
}
