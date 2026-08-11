import type { LangCode, ReaderId } from "../../contracts/types.js";
import { mediumAuditContract } from "./ritual.js";

export type RitualActor = "reader" | "querent";
export type RitualAction = string;

export interface RitualParticipation {
  readonly actor: RitualActor;
  readonly action?: RitualAction;
}

/** Compatibility helper. Canonical actor/action semantics live in rituals.json. */
export function ritualParticipation(reader: ReaderId, lang: LangCode = "en-GB"): RitualParticipation {
  const contract = mediumAuditContract(reader, lang);
  return contract ? { actor: contract.actor, action: contract.action } : { actor: "reader" };
}
