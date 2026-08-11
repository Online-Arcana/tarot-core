import { auditModelOut } from "../dist/model/audit.js";
import { fallbackModelOut } from "../dist/model/recover.js";
import { runModelSession } from "../dist/model/run.js";
import { profiles } from "../dist/readers/profiles.js";
import { spanishReaderPronoun } from "../dist/readers/meta.js";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  console.error("OPENAI_API_KEY is required for the live Spanish narrator smoke test.");
  process.exit(2);
}

const pack = {
  prompt: {
    reading: "Interpreta los resultados visibles directamente.",
    chat: "Responde directamente.",
  },
};

const cards = [
  {
    pos: 1,
    posName: "El presente",
    posMeaning: "Lo que está activo ahora",
    place: "En el centro",
    id: "major-fool",
    name: "The Fool",
    suit: "major",
    side: "upright",
    meaning: "Beginnings, freedom, trust and a leap into the unknown.",
  },
  {
    pos: 2,
    posName: "Lo que conviene observar",
    posMeaning: "Lo que merece atención antes de actuar",
    place: "A la izquierda",
    id: "cups-two",
    name: "Two of Cups",
    suit: "cups",
    side: "upright",
    meaning: "Connection, reciprocity, trust and mutual recognition.",
  },
  {
    pos: 3,
    posName: "El siguiente paso",
    posMeaning: "La actitud más útil para avanzar",
    place: "A la derecha",
    id: "swords-nine",
    name: "Nine of Swords",
    suit: "swords",
    side: "reversed",
    meaning: "Relief from anxiety, perspective and loosening fear's grip.",
  },
];

const genericReader = /\b(?:el lector|la lectora|la persona lectora|persona lectora)\b/iu;
const querent = "QuerenteSmoke";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function countMatches(value, expression) {
  return [...value.matchAll(expression)].length;
}

function cfg() {
  return {
    apiKey,
    conversation: false,
    guaranteeOutput: true,
    body: {
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 900,
    },
  };
}

function request(reader, cardIndex, priorRituals, drawCards = cards) {
  const draw = {
    id: "smoke-three",
    name: "Consejo en tres pasos",
    purpose: "Comprender el momento y elegir un siguiente paso útil",
    cards: drawCards,
  };
  return {
    task: "ritual",
    lang: "es-ES",
    reader,
    name: querent,
    history: [],
    question: "¿Qué necesito entender de esta situación antes de decidir qué hacer?",
    spread: draw.id,
    card: cardIndex,
    drawn: drawCards[cardIndex],
    draw,
    priorRituals,
  };
}

function prose(out) {
  return [out.gesture, out.opening, out.ritual].join(" ").replace(/\s+/gu, " ").trim();
}

function identityStats(reader, text) {
  const profile = profiles().find(item => item.id === reader);
  if (!profile) throw new Error(`Unknown reader ${reader}`);
  const pronoun = spanishReaderPronoun(reader);
  const nameRe = new RegExp(`\\b${escapeRegExp(profile.public.name)}\\b`, "giu");
  const pronounRe = new RegExp(`\\b${escapeRegExp(pronoun)}\\b`, "giu");
  return {
    name: profile.public.name,
    pronoun,
    nameCount: countMatches(text, nameRe),
    pronounCount: countMatches(text, pronounRe),
  };
}

async function runOne(reader, cardIndex = 0, priorRituals = [], drawCards = cards) {
  const req = request(reader, cardIndex, priorRituals, drawCards);
  const result = await runModelSession(pack, req, cfg());
  const text = prose(result.out);
  const emergency = fallbackModelOut(req);
  const audit = auditModelOut(req, result.out);
  const identity = identityStats(reader, text);

  const failures = [];
  const warnings = [];

  if (result.source === "reconstructed") failures.push("RECONSTRUCTED");
  if (JSON.stringify(result.out) === JSON.stringify(emergency)) failures.push("EMERGENCY_FALLBACK");
  if (genericReader.test(text)) failures.push("GENERIC_READER_LABEL");
  if (new RegExp(`\\b${escapeRegExp(querent)}\\b`, "iu").test(text)) failures.push("QUERENT_NAME_LEAK");
  if (identity.nameCount + identity.pronounCount === 0) failures.push("READER_IDENTITY_NOT_ESTABLISHED");
  if (!audit.valid) warnings.push(`POST_SMOKE_AUDIT: ${audit.errors.join(" | ")}`);
  if (identity.nameCount + identity.pronounCount > 3) warnings.push(`READER_IDENTITY_REPEATED_${identity.nameCount + identity.pronounCount}_TIMES`);

  return { req, result, text, identity, failures, warnings };
}

console.log("=== LIVE SPANISH NARRATOR STRING SMOKE ===");
console.log("This makes real model calls. Reconstructed/emergency fallback/generic labels/name leakage are failures.\n");

let failed = 0;
let warnings = 0;

console.log("=== FIRST RITUAL: EVERY READER ===");
for (const profile of profiles()) {
  try {
    const run = await runOne(profile.id, 0, [], [cards[0]]);
    const status = run.failures.length ? "FAIL" : "PASS";
    if (run.failures.length) failed += 1;
    warnings += run.warnings.length;
    console.log(`\n[${status}] ${profile.public.name} (${spanishReaderPronoun(profile.id)}) source=${run.result.source} identity=${run.identity.nameCount} name/${run.identity.pronounCount} pronoun`);
    console.log(run.text);
    if (run.failures.length) console.log(`FAILURES: ${run.failures.join(", ")}`);
    if (run.warnings.length) console.log(`WARNINGS: ${run.warnings.join(" || ")}`);
  } catch (error) {
    failed += 1;
    console.log(`\n[ERROR] ${profile.public.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log("\n\n=== SELENA THREE-RITUAL CONTINUITY ===");
const prior = [];
const seen = new Set();
for (let index = 0; index < cards.length; index += 1) {
  try {
    const run = await runOne("selena", index, prior, cards);
    const canonical = run.text.toLocaleLowerCase("es-ES").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/gu, " ").trim();
    if (seen.has(canonical)) run.failures.push("DUPLICATE_RITUAL");
    seen.add(canonical);
    if (run.failures.length) failed += 1;
    warnings += run.warnings.length;
    console.log(`\n[${run.failures.length ? "FAIL" : "PASS"}] Selena ritual ${index + 1}/3 source=${run.result.source} identity=${run.identity.nameCount} name/${run.identity.pronounCount} pronoun`);
    console.log(run.text);
    if (run.failures.length) console.log(`FAILURES: ${run.failures.join(", ")}`);
    if (run.warnings.length) console.log(`WARNINGS: ${run.warnings.join(" || ")}`);
    prior.push(run.text);
  } catch (error) {
    failed += 1;
    console.log(`\n[ERROR] Selena ritual ${index + 1}/3: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log("\n=== SUMMARY ===");
console.log(`Hard failures: ${failed}`);
console.log(`Warnings     : ${warnings}`);
console.log(`Placeholder-risk events: ${failed}`);

if (failed > 0) process.exitCode = 1;
