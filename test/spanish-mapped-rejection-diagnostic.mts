import { runModelSession, ModelOutputError } from "../dist/model/run.js";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  console.error("OPENAI_API_KEY is required.");
  process.exit(2);
}

const pack = {
  prompt: {
    reading: "Interpreta los resultados visibles directamente.",
    chat: "Responde directamente.",
  },
};

const card = {
  pos: 1,
  posName: "El presente",
  posMeaning: "Lo que está activo ahora",
  place: "En el centro",
  id: "major-fool",
  name: "The Fool",
  suit: "major",
  side: "upright",
  meaning: "Beginnings, freedom, trust and a leap into the unknown.",
};

function request(reader) {
  const draw = {
    id: "mapped-diagnostic",
    name: "Una carta",
    purpose: "Comprender qué está activo ahora",
    cards: [card],
  };
  return {
    task: "ritual",
    lang: "es-ES",
    reader,
    name: "QuerenteDiagnostico",
    history: [],
    question: "¿Qué necesito entender de esta situación antes de decidir qué hacer?",
    spread: draw.id,
    card: 0,
    drawn: card,
    draw,
    priorRituals: [],
  };
}

function cfg() {
  return {
    apiKey,
    conversation: false,
    guaranteeOutput: false,
    body: {
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 900,
    },
  };
}

function prose(out) {
  return [out.gesture, out.opening, out.ritual].join(" ").replace(/\s+/gu, " ").trim();
}

console.log("=== MAPPED SPANISH REJECTION DIAGNOSTIC ===");
console.log("No reconstruction is allowed here. If both model attempts are rejected, the exact audit messages are printed.\n");

for (const reader of ["ngaru", "amaru", "nahid"]) {
  console.log(`=== ${reader.toUpperCase()} ===`);
  try {
    const result = await runModelSession(pack, request(reader), cfg());
    console.log(`ACCEPTED source=${result.source}`);
    console.log(prose(result.out));
    if (result.auditErrors.length) {
      console.log("AUDIT HISTORY:");
      for (const error of result.auditErrors) console.log(`- ${error}`);
    }
  } catch (error) {
    if (error instanceof ModelOutputError) {
      console.log(`REJECTED after ${error.primaryModel} + ${error.escalationModel}`);
      console.log("AUDIT ERRORS:");
      for (const message of error.auditErrors) console.log(`- ${message}`);
    } else {
      console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log();
}
