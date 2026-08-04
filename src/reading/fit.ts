import { localText, profileFor, profiles } from "../readers/profiles.js";
import type { FitOut, LangCode, ReaderId, Topic } from "../contracts/types.js";

const TOPIC_PATTERNS: readonly [Topic, RegExp][] = [
  ["grief", /\b(grief|grieving|bereavement|mourning|death of (?:a|my) loved one|lost (?:a|my) loved one|someone (?:i love|close to me) died|duelo|luto|muerte de (?:un|una|mi) ser querido|perdi (?:a )?(?:un|una|mi) ser querido)\b/iu],
  ["death", /\b(death|dying|mortality|end of life|fear of dying|muerte|morir|mortalidad|fin de la vida|miedo a morir)\b/iu],
  ["intimacy", /\b(intimacy|sexual|sex life|desire|attraction|bedroom|intimidad|sexual|vida sexual|deseo|atraccion)\b/iu],
  ["love", /\b(love|romance|relationship|partner|dating|breakup|heartbreak|amor|romance|relacion|pareja|citas|ruptura|desamor)\b/iu],
  ["family", /\b(family|parent|mother|father|child|sibling|home life|familia|madre|padre|hijo|hija|hermano|hermana|vida familiar)\b/iu],
  ["career", /\b(career|job|work|promotion|business|money at work|carrera|empleo|trabajo|ascenso|negocio)\b/iu],
  ["conflict", /\b(conflict|argument|fight|dispute|enemy|confrontation|conflicto|discusion|pelea|disputa|enemigo|confrontacion)\b/iu],
  ["purpose", /\b(purpose|calling|life path|direction in life|meaning of my life|proposito|vocacion|camino de vida|rumbo en la vida|sentido de mi vida)\b/iu],
  ["spirituality", /\b(spiritual|spirituality|faith|soul|divine|spirit world|espiritual|espiritualidad|fe|alma|divino|mundo espiritual)\b/iu],
  ["healing", /\b(healing|recover|recovery|trauma|emotional wound|sanar|sanacion|recuperar|recuperacion|trauma|herida emocional)\b/iu],
  ["change", /\b(change|transition|moving on|new chapter|ending a phase|cambio|transicion|seguir adelante|nueva etapa|terminar una etapa)\b/iu],
  ["identity", /\b(identity|who am i|self worth|self-esteem|authentic self|identidad|quien soy|autoestima|valor propio|yo autentico)\b/iu],
];

const PREFERRED: Readonly<Record<Topic, ReaderId>> = {
  love: "selena",
  intimacy: "selena",
  family: "yejide",
  grief: "mictli",
  death: "mictli",
  change: "brennos",
  career: "yejide",
  conflict: "brennos",
  purpose: "brennos",
  spirituality: "ame",
  identity: "selena",
  healing: "ame",
};

const LABEL: Readonly<Record<Topic, { en: string; es: string }>> = {
  love: { en: "love and relationships", es: "el amor y las relaciones" },
  intimacy: { en: "intimacy and desire", es: "la intimidad y el deseo" },
  family: { en: "family matters", es: "los asuntos familiares" },
  grief: { en: "grief and bereavement", es: "el duelo y la pérdida" },
  death: { en: "death and mortality", es: "la muerte y la mortalidad" },
  change: { en: "change and transition", es: "el cambio y la transición" },
  career: { en: "career and work", es: "la carrera y el trabajo" },
  conflict: { en: "conflict and difficult choices", es: "el conflicto y las decisiones difíciles" },
  purpose: { en: "purpose and direction", es: "el propósito y el rumbo" },
  spirituality: { en: "spirituality", es: "la espiritualidad" },
  identity: { en: "identity and self-understanding", es: "la identidad y el autoconocimiento" },
  healing: { en: "healing and recovery", es: "la sanación y la recuperación" },
};

const spanish = (code: LangCode): boolean => code.toLowerCase().startsWith("es");

export function topicForQuestion(question: string): Topic | null {
  const clean = question.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return TOPIC_PATTERNS.find(([, pattern]) => pattern.test(clean))?.[0] ?? null;
}

function strongerReader(reader: ReaderId, topic: Topic): ReaderId | null {
  const preferred = PREFERRED[topic];
  if (preferred !== reader && profileFor(preferred).fit.strong.includes(topic)) return preferred;
  return profiles().find(profile => profile.id !== reader && profile.fit.strong.includes(topic))?.id ?? null;
}

function copy(reader: ReaderId, target: ReaderId, topic: Topic, code: LangCode): Pick<FitOut, "reason" | "offer"> {
  const current = profileFor(reader);
  const next = profileFor(target);
  const offer = localText(current.handover.offer, code)[0];
  if (spanish(code)) {
    return {
      reason: `${next.public.name} se especializa en ${LABEL[topic].es}, un terreno que no está entre las áreas más fuertes de ${current.public.name}.`,
      offer: offer ?? `Puedo entregarle esta pregunta a ${next.public.name} sin perder lo que ya has dicho.`,
    };
  }
  return {
    reason: `${next.public.name} specialises in ${LABEL[topic].en}, which is outside ${current.public.name}'s strongest ground.`,
    offer: offer ?? `I can place this question with ${next.public.name} without losing what you have already said.`,
  };
}

export function resolveFit(
  reader: ReaderId,
  question: string,
  code: LangCode,
  candidate?: FitOut,
): FitOut | null {
  const detected = topicForQuestion(question);
  const topic = detected ?? candidate?.topic;
  if (!topic) return null;

  const current = profileFor(reader);
  if (current.fit.strong.includes(topic)) {
    return candidate ? { ...candidate, level: "good", topic, recommend: null } : null;
  }
  if (current.fit.capable.includes(topic)) {
    return candidate ? { ...candidate, level: "acceptable", topic, recommend: null } : null;
  }

  const target = strongerReader(reader, topic);
  if (!target) {
    return candidate ? { ...candidate, level: "weak", topic, recommend: null } : null;
  }

  return {
    level: "very_weak",
    topic,
    recommend: target,
    ...copy(reader, target, topic, code),
  };
}
