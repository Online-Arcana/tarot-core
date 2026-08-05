import ritualsRaw from "./reader-rituals.json" with { type: "json" };
import type { ReaderId } from "../../contracts/types.js";

export type RitualActor = "reader" | "querent";
export type RitualAction = "draw-shell" | "draw-cord";

export interface RitualParticipation {
  readonly actor: RitualActor;
  readonly action?: RitualAction;
}

interface RawParticipation {
  readonly actor?: unknown;
  readonly action?: unknown;
}

interface RawReader {
  readonly participation?: RawParticipation;
}

const readers = ritualsRaw.readers as Readonly<Record<string, RawReader>>;

function actor(value: unknown): RitualActor {
  return value === "querent" ? "querent" : "reader";
}

function action(value: unknown): RitualAction | undefined {
  if (value === "draw-shell" || value === "draw-cord") return value;
  return undefined;
}

export function ritualParticipation(reader: ReaderId): RitualParticipation {
  const raw = readers[reader]?.participation;
  const selectedActor = actor(raw?.actor);
  const selectedAction = action(raw?.action);
  if (selectedActor === "reader") return { actor: "reader" };
  if (selectedAction) return { actor: "querent", action: selectedAction };
  throw new Error(`Querent-operated ritual ${reader} has no supported action`);
}
