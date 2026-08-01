import type { LangCode, ReaderId } from "../contracts/types.js";

type Gender = "woman" | "man";

interface ReaderMeta {
  gender: Gender;
  en: string;
  es: string;
}

const META: Record<ReaderId, ReaderMeta> = {
  selena: { gender: "woman", en: "she/her", es: "ella" },
  brennos: { gender: "man", en: "he/him", es: "él" },
  yejide: { gender: "woman", en: "she/her", es: "ella" },
  ngaru: { gender: "man", en: "he/him", es: "él" },
  ame: { gender: "woman", en: "she/her", es: "ella" },
  amaru: { gender: "man", en: "he/him", es: "él" },
  nahid: { gender: "woman", en: "she/her", es: "ella" },
  mictli: { gender: "man", en: "he/him", es: "él" }
};

export function readerIdentity(id: ReaderId, lang?: LangCode): string {
  const meta = META[id];
  const active = lang?.toLowerCase().startsWith("es") ? meta.es : meta.en;
  return `${meta.gender}; ${active}; English ${meta.en}; Spanish ${meta.es}`;
}
