import ritualAuthored from "./contextual-ritual-data.json" with { type: "json" };
import type { ApiReq, RitualOut, Topic } from "../contracts/types.js";
import { isMappedReader } from "../readers/media/runtime.js";
import { topicForQuestion } from "../reading/fit.js";
import { auditModelOut } from "./audit.js";
import { fallbackFor } from "./fallback.js";
import { recoverRitual } from "./ritual-recovery.js";

type RitualReq = Extract<ApiReq, { task: "ritual" }>;
type Lang = "en" | "es";

interface RitualBank {
  readonly opening: readonly string[];
  readonly action: readonly string[];
  readonly context: readonly string[];
}
interface RitualData {
  readonly version: number;
  readonly readers: Readonly<Record<string, Partial<Record<Lang, RitualBank>>>>;
}

const RITUALS = ritualAuthored as RitualData;
if (RITUALS.version !== 1) throw new Error("contextual ritual data version must equal 1");

const TOPIC: Readonly<Record<Topic, Readonly<Record<Lang, string>>>> = {
  love: { en: "love and reciprocity", es: "el amor y la reciprocidad" },
  intimacy: { en: "intimacy and desire", es: "la intimidad y el deseo" },
  family: { en: "family and obligation", es: "la familia y las obligaciones" },
  grief: { en: "grief and what remains", es: "el duelo y lo que permanece" },
  death: { en: "endings and mortality", es: "los finales y la mortalidad" },
  change: { en: "the change you are considering", es: "el cambio que estás considerando" },
  career: { en: "work and direction", es: "el trabajo y el rumbo" },
  conflict: { en: "the conflict and its consequences", es: "el conflicto y sus consecuencias" },
  purpose: { en: "purpose and direction", es: "el propósito y el rumbo" },
  spirituality: { en: "meaning and belief", es: "el sentido y las creencias" },
  identity: { en: "identity and self-understanding", es: "la identidad y el autoconocimiento" },
  healing: { en: "healing and recovery", es: "la sanación y la recuperación" },
};

function lang(req: RitualReq): Lang {
  return req.lang.toLowerCase().startsWith("es") ? "es" : "en";
}
function hash(value: string): number {
  let out = 2166136261;
  for (const char of value) {
    out ^= char.codePointAt(0) ?? 0;
    out = Math.imul(out, 16777619);
  }
  return out >>> 0;
}
function pick(values: readonly string[], key: string, offset = 0): string {
  return values[(hash(key) + offset) % values.length]!;
}
function currentPosition(req: RitualReq): { name: string; meaning: string } | null {
  const card = req.draw?.cards[req.card] ?? req.drawn;
  return card ? { name: card.posName, meaning: card.posMeaning } : null;
}
function topicLine(req: RitualReq): string {
  const code = lang(req);
  const topic = topicForQuestion(req.question);
  const phrase = topic ? TOPIC[topic][code] : null;
  const pos = currentPosition(req);
  if (code === "es") {
    if (phrase && pos) return `Esta parte de la tirada mantiene la atención en ${phrase}, ahora desde ${pos.name.toLocaleLowerCase()}.`;
    if (phrase) return `Esta parte de la tirada mantiene la atención en ${phrase} sin convertirla todavía en una conclusión.`;
    if (pos) return `Esta parte de la tirada mantiene tu pregunta en ${pos.name.toLocaleLowerCase()} sin anticipar el resultado.`;
    return "Esta pausa mantiene tu pregunta presente sin anticipar el resultado.";
  }
  if (phrase && pos) return `This part of the spread keeps the attention on ${phrase}, now through ${pos.name.toLocaleLowerCase()}.`;
  if (phrase) return `This part of the spread keeps the attention on ${phrase} without turning it into a conclusion yet.`;
  if (pos) return `This part of the spread keeps your question with ${pos.name.toLocaleLowerCase()} without anticipating the result.`;
  return "This pause keeps your question present without anticipating the result.";
}
function authored(req: RitualReq, bank: RitualBank): RitualOut {
  const key = `${req.lang}:${req.spread}:${req.card}:${req.question}`;
  const phase = req.card === 0 ? 0 : req.card;
  const out: RitualOut = {
    opening: pick(bank.opening, key, phase),
    ritual: `${pick(bank.action, key, phase + 2)} ${topicLine(req)}`,
    gesture: pick(bank.context, key, phase + 4),
  };
  const audit = auditModelOut(req, out);
  if (!audit.valid) {
    const fallback = fallbackFor(req.lang, req.reader);
    return recoverRitual(req, {
      gesture: fallback.ritualGesture,
      opening: fallback.ritualOpening,
      ritual: fallback.ritual,
    });
  }
  return out;
}
function mapped(req: RitualReq): RitualOut {
  const fallback = fallbackFor(req.lang, req.reader);
  const base = recoverRitual(req, {
    gesture: fallback.ritualGesture,
    opening: fallback.ritualOpening,
    ritual: fallback.ritual,
  });
  const candidates: RitualOut[] = [
    { ...base, ritual: `${base.ritual} ${topicLine(req)}` },
    { ...base, gesture: `${base.gesture} ${topicLine(req)}` },
    base,
  ];
  return candidates.find(candidate => auditModelOut(req, candidate).valid) ?? base;
}

export function contextualRitualOut(req: RitualReq): RitualOut {
  if (isMappedReader(req.reader)) return mapped(req);
  const bank = RITUALS.readers[req.reader]?.[lang(req)];
  if (bank) return authored(req, bank);
  const fallback = fallbackFor(req.lang, req.reader);
  return recoverRitual(req, {
    gesture: fallback.ritualGesture,
    opening: fallback.ritualOpening,
    ritual: fallback.ritual,
  });
}
