import type {
  ApiOut,
  ApiReq,
  ChatOut,
  ReadingOut,
  RitualOut,
} from "../contracts/types.js";

const direct = /\b(?:you|your|yours|yourself|tú|tu|tus|te|ti|contigo|usted|ustedes|vos|vosotros|vuestro|vuestra|sus)\b/iu;

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function spanish(req: ApiReq): boolean {
  return req.lang.toLocaleLowerCase().startsWith("es");
}

function viewerPronouns(value: string, es: boolean): string {
  if (es) {
    return value
      .replace(/\b(?:él|ella|ellos|ellas)\b/giu, "tú")
      .replace(/\b(?:lo|la|los|las|le|les)\b/giu, "te")
      .replace(/\b(?:su|sus)\b/giu, match => match.toLocaleLowerCase() === "sus" ? "tus" : "tu")
      .replace(/\b(?:sí mismo|sí misma|sí mismos|sí mismas)\b/giu, "ti");
  }
  return value
    .replace(/\b(?:he|she|they)\b/giu, "you")
    .replace(/\b(?:him|her|them)\b/giu, "you")
    .replace(/\b(?:his|her|their)\b/giu, "your")
    .replace(/\b(?:hers|theirs)\b/giu, "yours")
    .replace(/\b(?:himself|herself|themselves)\b/giu, "yourself");
}

function sentenceAudience(sentence: string, name: string, es: boolean): string {
  if (!name) return sentence;
  const namePattern = new RegExp(`\\b${escape(name)}(?:['’]s)?\\b`, "iu");
  const match = namePattern.exec(sentence);
  if (!match || match.index === undefined) return sentence;

  const before = sentence.slice(0, match.index);
  const after = sentence.slice(match.index + match[0].length);
  const possessive = /['’]s$/iu.test(match[0]);
  const replacement = possessive ? (es ? "tu" : "your") : (es ? "tú" : "you");
  return `${before}${replacement}${viewerPronouns(after, es)}`;
}

function audience(value: string, req: ApiReq): string {
  const name = req.name.trim();
  if (!name || !value.trim()) return value;
  return value.replace(/[^.!?]+[.!?]*|[.!?]+/gu, sentence =>
    sentenceAudience(sentence, name, spanish(req))
  );
}

function count(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function ensureDirect(value: string, req: ApiReq, maxWords: number): string {
  const clean = value.trim();
  if (!clean || direct.test(clean)) return clean;
  const prefix = spanish(req) ? "Ante ti, " : "Before you, ";
  return count(clean) + count(prefix) <= maxWords ? `${prefix}${clean}` : clean;
}

function ritual(req: Extract<ApiReq, { task: "ritual" }>, out: RitualOut): RitualOut {
  const parts = [out.gesture, out.opening, out.ritual].map(value => audience(value, req));
  const combined = parts.join(" ").replace(/\s+/gu, " ").trim();
  if (!direct.test(combined)) {
    const suffix = spanish(req)
      ? "La quietud se reúne a tu alrededor."
      : "The stillness gathers around you.";
    if (count(combined) + count(suffix) <= 110) {
      parts[2] = `${parts[2].trim()} ${suffix}`.trim();
    } else {
      parts[0] = ensureDirect(parts[0], req, count(parts[0]) + 2);
    }
  }
  return { ...out, gesture: parts[0]!, opening: parts[1]!, ritual: parts[2]! };
}

function reading(req: Extract<ApiReq, { task: "read" }>, out: ReadingOut): ReadingOut {
  const note = audience(out.note, req);
  return { ...out, note: ensureDirect(note, req, 100) };
}

function chat(req: Extract<ApiReq, { task: "chat" }>, out: ChatOut): ChatOut {
  const gesture = audience(out.gesture, req);
  return { ...out, gesture: ensureDirect(gesture, req, 110) };
}

export function addressViewer(req: ApiReq, out: ApiOut): ApiOut {
  if (req.task === "ritual") return ritual(req, out as RitualOut);
  if (req.task === "read") return reading(req, out as ReadingOut);
  if (req.task === "chat") return chat(req, out as ChatOut);
  return out;
}
