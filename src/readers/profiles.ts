import generated from "./personas.generated.json" with { type: "json" };
import { READER_IDS } from "./ids.js";
import type {
  LangCode,
  Local,
  ReaderId,
  ReaderProfile,
  ReaderPronouns,
  Topic,
} from "../contracts/types.js";

type BaseLang = keyof Local<unknown>;
type RecordValue = Record<string, unknown>;

const TOPICS = new Set<Topic>([
  "love", "intimacy", "family", "grief", "death", "change",
  "career", "conflict", "purpose", "spirituality", "identity", "healing",
]);

function base(code: LangCode): BaseLang {
  return code.toLowerCase().startsWith("es") ? "es" : "en";
}

export function localText<T>(value: Local<T>, code: LangCode): T {
  return value[base(code)];
}

function object(value: unknown, path: string): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as RecordValue;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be non-empty text`);
  return value.trim();
}

function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} must be a non-empty string array`);
  return value.map((item, index) => string(item, `${path}[${index}]`));
}

function localString(value: unknown, path: string): Local<string> {
  const source = object(value, path);
  return { en: string(source.en, `${path}.en`), es: string(source.es, `${path}.es`) };
}

function localStrings(value: unknown, path: string): Local<string[]> {
  const source = object(value, path);
  return { en: strings(source.en, `${path}.en`), es: strings(source.es, `${path}.es`) };
}

function pronouns(value: unknown, path: string): ReaderPronouns {
  const source = object(value, path);
  return {
    subject: string(source.subject, `${path}.subject`),
    object: string(source.object, `${path}.object`),
    possessiveDeterminer: string(source.possessiveDeterminer, `${path}.possessiveDeterminer`),
    possessive: string(source.possessive, `${path}.possessive`),
    reflexive: string(source.reflexive, `${path}.reflexive`),
  };
}

function localPronouns(value: unknown, path: string): Local<ReaderPronouns> {
  const source = object(value, path);
  return {
    en: pronouns(source.en, `${path}.en`),
    es: pronouns(source.es, `${path}.es`),
  };
}

function topics(value: unknown, path: string): Topic[] {
  const values = strings(value, path);
  for (const value of values) {
    if (!TOPICS.has(value as Topic)) throw new Error(`${path} contains invalid topic ${value}`);
  }
  return values as Topic[];
}

function profile(value: unknown, path: string): ReaderProfile {
  const source = object(value, path);
  const id = string(source.id, `${path}.id`);
  if (!(READER_IDS as readonly string[]).includes(id)) throw new Error(`${path}.id is invalid`);
  if (source.review !== "human-cultural-and-prose-review-required") {
    throw new Error(`${path}.review must preserve the human review requirement`);
  }

  const identity = object(source.identity, `${path}.identity`);
  const name = string(identity.name, `${path}.identity.name`);
  const gender = string(identity.gender, `${path}.identity.gender`);
  if (gender !== "woman" && gender !== "man") throw new Error(`${path}.identity.gender is invalid`);

  const publicData = object(source.public, `${path}.public`);
  if (string(publicData.name, `${path}.public.name`) !== name) {
    throw new Error(`${path}.public.name must match identity.name`);
  }
  const fit = object(source.fit, `${path}.fit`);
  const strong = topics(fit.strong, `${path}.fit.strong`);
  const capable = topics(fit.capable, `${path}.fit.capable`);
  const weak = topics(fit.weak, `${path}.fit.weak`);
  const allTopics = [...strong, ...capable, ...weak];
  if (new Set(allTopics).size !== allTopics.length) throw new Error(`${path}.fit repeats a topic`);

  const persona = object(source.persona, `${path}.persona`);
  const handover = object(source.handover, `${path}.handover`);

  return {
    id: id as ReaderId,
    review: "human-cultural-and-prose-review-required",
    identity: {
      name,
      gender,
      pronouns: localPronouns(identity.pronouns, `${path}.identity.pronouns`),
    },
    public: {
      name,
      role: localString(publicData.role, `${path}.public.role`),
      blurb: localString(publicData.blurb, `${path}.public.blurb`),
      waiting: localString(publicData.waiting, `${path}.public.waiting`),
    },
    fit: { strong, capable, weak },
    persona: {
      voice: localStrings(persona.voice, `${path}.persona.voice`),
      outlook: localStrings(persona.outlook, `${path}.persona.outlook`),
      manner: localStrings(persona.manner, `${path}.persona.manner`),
      ritual: localStrings(persona.ritualStyle, `${path}.persona.ritualStyle`),
      scene: localStrings(persona.scene, `${path}.persona.scene`),
      limits: localStrings(persona.limits, `${path}.persona.limits`),
      avoid: localStrings(persona.avoid, `${path}.persona.avoid`),
      intro: localString(publicData.intro, `${path}.public.intro`),
      portrait: localString(publicData.portrait, `${path}.public.portrait`),
      invite: localStrings(source.invite, `${path}.invite`),
    },
    handover: {
      offer: localStrings(handover.offer, `${path}.handover.offer`),
      receive: localStrings(handover.receive, `${path}.handover.receive`),
      returning: localStrings(handover.returning, `${path}.handover.returning`),
    },
  };
}

function registry(): Record<ReaderId, ReaderProfile> {
  const source = object(generated as unknown, "generated personas");
  if (source.version !== 1) throw new Error("generated personas.version must equal 1");
  if (source.generatedFrom !== "src/readers/personas/*.xml") {
    throw new Error("generated personas must identify the canonical XML source");
  }
  if (!Array.isArray(source.readers) || source.readers.length !== READER_IDS.length) {
    throw new Error(`generated personas must contain exactly ${READER_IDS.length} readers`);
  }
  const entries = source.readers.map((value, index) => {
    const parsed = profile(value, `generated personas.readers[${index}]`);
    return [parsed.id, parsed] as const;
  });
  const ids = entries.map(([id]) => id);
  if (new Set(ids).size !== READER_IDS.length || READER_IDS.some(id => !ids.includes(id))) {
    throw new Error("generated personas do not match the canonical reader ID set");
  }
  return Object.fromEntries(entries) as Record<ReaderId, ReaderProfile>;
}

const REG = registry();

export function profileFor(id: ReaderId): ReaderProfile {
  return REG[id];
}

export function profiles(): ReaderProfile[] {
  return READER_IDS.map(id => REG[id]);
}

const LABELS = {
  en: {
    name: "Name",
    role: "Role",
    publicCharacter: "Public character",
    strong: "Strong topics",
    capable: "Capable topics",
    weak: "Weak topics",
    voice: "Voice",
    outlook: "Outlook",
    manner: "Manner and movement",
    ritual: "Ritual style and recurring imagery",
    scene: "Environment",
    limits: "Limits",
    avoid: "Avoid",
  },
  es: {
    name: "Nombre",
    role: "Rol",
    publicCharacter: "Carácter público",
    strong: "Temas fuertes",
    capable: "Temas adecuados",
    weak: "Temas débiles",
    voice: "Voz",
    outlook: "Perspectiva",
    manner: "Manera y movimiento",
    ritual: "Estilo ritual e imágenes recurrentes",
    scene: "Entorno",
    limits: "Límites",
    avoid: "Evitar",
  },
} as const;

export function profilePrompt(id: ReaderId, code: LangCode): string {
  const reader = profileFor(id);
  const lang = base(code);
  const label = LABELS[lang];
  const lines = (values: Local<string[]>): string[] => localText(values, code).map(value => `- ${value}`);
  return [
    `${label.name}: ${reader.public.name}`,
    `${label.role}: ${localText(reader.public.role, code)}`,
    `${label.publicCharacter}: ${localText(reader.public.blurb, code)}`,
    `${label.strong}: ${reader.fit.strong.join(", ")}`,
    `${label.capable}: ${reader.fit.capable.join(", ")}`,
    `${label.weak}: ${reader.fit.weak.join(", ")}`,
    `${label.voice}:`,
    ...lines(reader.persona.voice),
    `${label.outlook}:`,
    ...lines(reader.persona.outlook),
    `${label.manner}:`,
    ...lines(reader.persona.manner),
    `${label.ritual}:`,
    ...lines(reader.persona.ritual),
    `${label.scene}:`,
    ...lines(reader.persona.scene),
    `${label.limits}:`,
    ...lines(reader.persona.limits),
    `${label.avoid}:`,
    ...lines(reader.persona.avoid),
  ].join("\n");
}
