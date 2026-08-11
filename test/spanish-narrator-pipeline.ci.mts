import { auditModelOut as baseAuditModelOut } from "../dist/model/audit.js";
import { modelPrompt, runModelSession } from "../dist/model/run.js";
import { auditSpanishNarrator } from "../dist/model/spanish-narrator.js";
import { addressViewer } from "../dist/model/viewer-narration.js";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  console.error("OPENAI_API_KEY is required for the Spanish narrator pipeline CI.");
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
const draw = {
  id: "one",
  name: "Una carta",
  purpose: "Observar el momento actual",
  cards: [card],
};

const opening = "La pregunta permanece en el aire mientras el sonido leve del papel acompaña una pausa tranquila alrededor de la mesa.";
const ritual = "Selena mantiene la carta cubierta entre ambas manos y conserva la atención en la mesa hasta que el movimiento queda completamente detenido. La quietud se reúne a tu alrededor.";

const req = {
  task: "ritual",
  lang: "es-ES",
  reader: "selena",
  name: "QuerenteCI",
  history: [],
  question: "¿Qué necesito entender de este momento?",
  spread: "one",
  card: 0,
  drawn: card,
  draw,
  priorRituals: [],
};

const correct = [
  "Selena te mira a ti mientras Selena mantiene la baraja cubierta.",
  "A ti te mira Selena mientras Selena mantiene la baraja cubierta.",
  "Selena te entrega la carta a ti sin descubrir todavía su cara.",
  "A ti te entrega Selena la carta sin descubrir todavía su cara.",
  "Selena se inclina hacia ti mientras Selena sostiene la baraja entre las manos.",
  "Selena coloca la baraja ante ti y Selena mantiene la siguiente carta cubierta.",
  "Selena deja un espacio para ti junto al borde de la mesa.",
  "Selena permanece contigo mientras el silencio vuelve a la estancia.",
  "Selena piensa en ti mientras Selena ordena los bordes de la baraja.",
  "La luz cae sobre ti mientras Selena mantiene la carta cubierta.",
  "Selena conserva cierta distancia de ti mientras Selena prepara el siguiente movimiento.",
  "Selena deja la mesa sin ti durante un instante y Selena regresa enseguida.",
  "La distancia entre tú y Selena permanece igual durante toda la pausa.",
  "Según tú, la pregunta merece otra pausa antes de continuar.",
  "Hasta tú puedes notar el cambio de ritmo cuando Selena inmoviliza la baraja.",
  "Todos guardan silencio excepto tú mientras Selena sostiene la siguiente carta.",
  "Todos permanecen quietos salvo tú mientras Selena conserva la carta cubierta.",
  "Incluso tú puedes percibir la pausa mientras Selena ordena la baraja.",
  "Nadie menos tú rompe el silencio mientras Selena mantiene la carta oculta.",
  "Tu pregunta permanece en el centro mientras Selena conserva la carta cubierta.",
];

const immersion = [
  ["Selena se inclina hacia QuerenteCI mientras Selena sostiene la baraja entre las manos.", "Selena se inclina hacia ti mientras Selena sostiene la baraja entre las manos."],
  ["Selena coloca la baraja ante QuerenteCI y Selena mantiene la siguiente carta cubierta.", "Selena coloca la baraja ante ti y Selena mantiene la siguiente carta cubierta."],
  ["Selena deja un espacio para QuerenteCI junto al borde de la mesa.", "Selena deja un espacio para ti junto al borde de la mesa."],
  ["Selena piensa en QuerenteCI mientras Selena ordena los bordes de la baraja.", "Selena piensa en ti mientras Selena ordena los bordes de la baraja."],
  ["Selena deja la mesa sin QuerenteCI durante un instante y Selena regresa enseguida.", "Selena deja la mesa sin ti durante un instante y Selena regresa enseguida."],
  ["La luz cae sobre QuerenteCI mientras Selena mantiene la carta cubierta.", "La luz cae sobre ti mientras Selena mantiene la carta cubierta."],
  ["Selena camina tras QuerenteCI mientras Selena mantiene la carta oculta.", "Selena camina tras ti mientras Selena mantiene la carta oculta."],
  ["Selena mantiene la carta bajo QuerenteCI durante la pausa.", "Selena mantiene la carta bajo ti durante la pausa."],
  ["Selena gira la silla contra QuerenteCI antes de volver a la mesa.", "Selena gira la silla contra ti antes de volver a la mesa."],
  ["Selena acerca la baraja desde QuerenteCI y Selena vuelve a cubrirla.", "Selena acerca la baraja desde ti y Selena vuelve a cubrirla."],
  ["Selena mueve la vela por QuerenteCI mientras Selena sostiene la baraja.", "Selena mueve la vela por ti mientras Selena sostiene la baraja."],
  ["Selena permanece con QuerenteCI mientras el silencio vuelve a la estancia.", "Selena permanece contigo mientras el silencio vuelve a la estancia."],
  ["Según QuerenteCI, la pregunta merece otra pausa antes de continuar.", "Según tú, la pregunta merece otra pausa antes de continuar."],
  ["Todos guardan silencio excepto QuerenteCI mientras Selena sostiene la siguiente carta.", "Todos guardan silencio excepto tú mientras Selena sostiene la siguiente carta."],
  ["Todos permanecen quietos salvo QuerenteCI mientras Selena conserva la carta cubierta.", "Todos permanecen quietos salvo tú mientras Selena conserva la carta cubierta."],
  ["Todos guardan silencio, incluso QuerenteCI, mientras Selena ordena la baraja.", "Todos guardan silencio, incluso tú, mientras Selena ordena la baraja."],
  ["Nadie menos QuerenteCI rompe el silencio mientras Selena mantiene la carta oculta.", "Nadie menos tú rompe el silencio mientras Selena mantiene la carta oculta."],
  ["Selena mira a QuerenteCI mientras Selena mantiene la baraja cubierta.", "Selena te mira a ti mientras Selena mantiene la baraja cubierta."],
  ["Selena observa a QuerenteCI mientras la carta permanece oculta.", "Selena te observa a ti mientras la carta permanece oculta."],
  ["Selena escucha a QuerenteCI antes de mover nuevamente la baraja.", "Selena te escucha a ti antes de mover nuevamente la baraja."],
  ["Selena toca a QuerenteCI apenas en el hombro antes de apartar la mano.", "Selena te toca a ti apenas en el hombro antes de apartar la mano."],
  ["Selena abraza a QuerenteCI brevemente antes de regresar a la mesa.", "Selena te abraza a ti brevemente antes de regresar a la mesa."],
  ["Selena ayuda a QuerenteCI a mantener las manos lejos de la baraja.", "Selena te ayuda a ti a mantener las manos lejos de la baraja."],
  ["Selena entrega la carta a QuerenteCI sin descubrir todavía su cara.", "Selena te entrega la carta a ti sin descubrir todavía su cara."],
  ["Selena ofrece una pausa a QuerenteCI antes del siguiente movimiento.", "Selena te ofrece una pausa a ti antes del siguiente movimiento."],
  ["Selena muestra el reverso de la baraja a QuerenteCI sin revelar la carta.", "Selena te muestra el reverso de la baraja a ti sin revelar la carta."],
  ["Selena dice una frase breve a QuerenteCI antes de guardar silencio.", "Selena te dice una frase breve a ti antes de guardar silencio."],
  ["Selena cuenta un detalle pequeño a QuerenteCI mientras Selena sostiene la baraja.", "Selena te cuenta un detalle pequeño a ti mientras Selena sostiene la baraja."],
  ["Selena explica el gesto a QuerenteCI sin interpretar todavía la carta.", "Selena te explica el gesto a ti sin interpretar todavía la carta."],
  ["Selena trae la baraja a QuerenteCI mientras Selena conserva la carta cubierta.", "Selena te trae la baraja a ti mientras Selena conserva la carta cubierta."],
  ["A QuerenteCI mira Selena mientras Selena sostiene la baraja cubierta.", "A ti te mira Selena mientras Selena sostiene la baraja cubierta."],
  ["A QuerenteCI entrega Selena la carta sin descubrir todavía su cara.", "A ti te entrega Selena la carta sin descubrir todavía su cara."],
  ["Selena espera frente a QuerenteCI con la carta todavía cubierta.", "Selena espera frente a ti con la carta todavía cubierta."],
  ["Selena permanece junto a QuerenteCI mientras la carta sigue oculta.", "Selena permanece junto a ti mientras la carta sigue oculta."],
  ["Selena coloca la carta cerca de QuerenteCI sin mostrar su cara.", "Selena coloca la carta cerca de ti sin mostrar su cara."],
  ["Selena coloca la silla delante de QuerenteCI antes de sentarse.", "Selena coloca la silla delante de ti antes de sentarse."],
  ["La pregunta de QuerenteCI permanece en el centro mientras Selena sostiene la baraja.", "Tu pregunta permanece en el centro mientras Selena sostiene la baraja."],
  ["Las manos de QuerenteCI permanecen quietas mientras Selena prepara la carta.", "Tus manos permanecen quietas mientras Selena prepara la carta."],
  ["En silencio, QuerenteCI espera junto a la mesa mientras Selena sostiene la baraja.", "En silencio, tú esperas junto a la mesa mientras Selena sostiene la baraja."],
  ["En silencio, QuerenteCI se queda junto a la mesa mientras Selena prepara la carta.", "En silencio, tú te quedas junto a la mesa mientras Selena prepara la carta."],
];

const broken = [
  "Selena se inclina hacia tú mientras Selena sostiene la baraja entre las manos.",
  "Selena coloca la baraja ante tú y Selena mantiene la siguiente carta cubierta.",
  "Selena deja un espacio para tú junto al borde de la mesa.",
  "Selena piensa en tú mientras Selena ordena los bordes de la baraja.",
  "Selena deja la mesa sin tú durante un instante y Selena regresa enseguida.",
  "La luz cae sobre tú mientras Selena mantiene la carta cubierta.",
  "Selena conserva cierta distancia de tú mientras Selena prepara el siguiente movimiento.",
  "Selena camina tras tú mientras Selena mantiene la carta oculta.",
  "Selena mantiene la carta bajo tú durante la pausa.",
  "Selena gira la silla contra tú antes de volver a la mesa.",
  "Selena acerca la baraja desde tú y Selena vuelve a cubrirla.",
  "Selena mueve la vela por tú mientras Selena sostiene la baraja.",
  "Selena permanece con tú mientras el silencio vuelve a la estancia.",
  "Selena habla con ti mientras Selena sostiene la baraja cubierta.",
  "Según ti, la pregunta merece otra pausa antes de continuar.",
  "Todos guardan silencio excepto ti mientras Selena sostiene la siguiente carta.",
  "Todos permanecen quietos salvo ti mientras Selena conserva la carta cubierta.",
  "Incluso ti puedes percibir la pausa mientras Selena ordena la baraja.",
  "Nadie menos ti rompe el silencio mientras Selena mantiene la carta oculta.",
  "Selena mira a ti mientras Selena mantiene la baraja cubierta.",
  "Selena observa a ti mientras la carta permanece oculta.",
  "Selena escucha a ti antes de mover nuevamente la baraja.",
  "Selena toca a ti apenas en el hombro antes de apartar la mano.",
  "Selena abraza a ti brevemente antes de regresar a la mesa.",
  "Selena ayuda a ti a mantener las manos lejos de la baraja.",
  "Selena saluda a ti con un gesto pequeño antes de comenzar.",
  "Selena ve a ti desde el otro lado de la mesa.",
  "Selena oye a ti mientras Selena sostiene la carta cubierta.",
  "Selena espera a ti junto a la mesa antes de continuar.",
  "Selena acompaña a ti hasta el borde de la mesa.",
  "Selena entrega la carta a ti sin descubrir todavía su cara.",
  "Selena ofrece una pausa a ti antes del siguiente movimiento.",
  "Selena muestra el reverso de la baraja a ti sin revelar la carta.",
  "Selena dice una frase breve a ti antes de guardar silencio.",
  "Selena cuenta un detalle pequeño a ti mientras Selena sostiene la baraja.",
  "Selena explica el gesto a ti sin interpretar todavía la carta.",
  "Selena trae la baraja a ti mientras Selena conserva la carta cubierta.",
  "A ti mira Selena mientras Selena sostiene la baraja cubierta.",
  "A ti entrega Selena la carta sin descubrir todavía su cara.",
  "Tú pregunta permanece en el centro mientras Selena conserva la carta cubierta.",
];

if (correct.length !== 20 || immersion.length !== 40 || broken.length !== 40) {
  throw new Error(`Corpus must be 20 correct + 40 immersion + 40 grammar; got ${correct.length}/${immersion.length}/${broken.length}.`);
}

const grammarAudit = (candidate) => auditSpanishNarrator(req, candidate, baseAuditModelOut(req, candidate));
const candidateFor = (gesture) => ({ gesture, opening, ritual });

const spanishPrompt = modelPrompt(pack, req);
if (!spanishPrompt.includes("nunca uses el nombre de la persona consultante") ||
    !spanishPrompt.includes("tú, te, ti, contigo, tu/tus")) {
  throw new Error("Spanish narrator prompt does not contain the direct-person grammar contract.");
}
const englishPrompt = modelPrompt(pack, { ...req, lang: "en-GB" });
if (englishPrompt.includes("nunca uses el nombre de la persona consultante")) {
  throw new Error("Spanish narrator grammar instruction leaked into English generation.");
}

const chatReq = { task: "chat", lang: "es-ES", reader: "selena", name: "QuerenteCI", history: [], question: "¿Y ahora?" };
const chatOut = {
  gesture: "Selena mira a QuerenteCI mientras el silencio vuelve a la mesa.",
  response: "QuerenteCI, quiero responderte directamente sin convertir esto en narración.",
};
const addressedChat = addressViewer(chatReq, chatOut);
if (addressedChat.response !== chatOut.response || addressedChat.gesture.includes("QuerenteCI")) {
  throw new Error("Reader dialogue and narrator immersion are not isolated correctly.");
}

console.log("=== SPANISH NARRATOR PIPELINE CI ===");
console.log("Prompt contract: PASS");
console.log("English isolation: PASS");
console.log("Reader-dialogue isolation: PASS");
console.log("Corpus: 100 sentences = 20 correct + 40 name-immersion + 40 grammar/Luna\n");
console.log("0x00 correct unchanged | 0x10 deterministic immersion | 0x56 Luna corrected | 0x30 false accept | 0x31 false reject | 0x40 immersion error | 0x57 Luna rewrite | 0x58 Luna invalid | 0x59 reconstruction | 0xFF error\n");

const cases = [
  ...correct.map((sentence, index) => ({ id: `C${String(index + 1).padStart(2, "0")}`, kind: "correct", input: sentence, expected: sentence })),
  ...immersion.map(([input, expected], index) => ({ id: `I${String(index + 1).padStart(2, "0")}`, kind: "immersion", input, expected })),
  ...broken.map((sentence, index) => ({ id: `G${String(index + 1).padStart(2, "0")}`, kind: "grammar", input: sentence, expected: null })),
];

let correctPass = 0;
let immersionPass = 0;
let lunaPass = 0;
let falseAccepts = 0;
let falseRejects = 0;
let immersionErrors = 0;
let lunaRewrites = 0;
let lunaInvalid = 0;
let reconstructed = 0;
let errors = 0;
let duplicates = 0;
const seenLunaOutputs = new Map();

for (let index = 0; index < cases.length; index += 1) {
  const item = cases[index];
  const candidate = candidateFor(item.input);
  const rawAudit = grammarAudit(candidate);
  const locallyAddressed = addressViewer(req, candidate);
  const localAudit = grammarAudit(locallyAddressed);

  let realCalls = 0;
  let escalationModel = "none";
  let correctionPromptSeen = false;

  const instrumentedFetch = async (input, init) => {
    let body = {};
    if (typeof init?.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = {}; }
    }
    const model = typeof body.model === "string" ? body.model : "unknown";

    if (realCalls === 0) {
      realCalls += 1;
      return Response.json({ output_text: JSON.stringify(candidate) });
    }

    escalationModel = model;
    correctionPromptSeen = JSON.stringify(body).includes("Corrige únicamente los errores de gramática española indicados en la salida anterior");
    realCalls += 1;
    return fetch(input, init);
  };

  let code = "0xFF";
  let status = "ERROR";
  let source = "error";
  let output = "";
  let auditCodes = "none";

  try {
    const result = await runModelSession(pack, req, {
      apiKey,
      conversation: false,
      guaranteeOutput: true,
      retries: 0,
      fetch: instrumentedFetch,
      body: {
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 700,
      },
    });

    source = result.source;
    output = typeof result.out.gesture === "string" ? result.out.gesture : "";
    const finalAudit = grammarAudit(result.out);
    auditCodes = finalAudit.issues.map(issue => issue.code).join(",") || "none";

    if (source === "reconstructed") {
      reconstructed += 1;
      code = "0x59";
      status = "RECONSTRUCTED";
    } else if (item.kind === "correct") {
      const ok = rawAudit.valid && source === "primary" && realCalls === 1 && output === item.expected;
      if (ok) {
        correctPass += 1;
        code = "0x00";
        status = "PASS";
      } else {
        falseRejects += 1;
        code = "0x31";
        status = "FALSE_REJECT";
      }
    } else if (item.kind === "immersion") {
      const ok = !rawAudit.valid && localAudit.valid && source === "primary" && realCalls === 1 && output === item.expected && !output.includes("QuerenteCI");
      if (ok) {
        immersionPass += 1;
        code = "0x10";
        status = "PASS";
      } else {
        immersionErrors += 1;
        code = "0x40";
        status = "IMMERSION_ERROR";
      }
    } else {
      const detected = !rawAudit.valid && rawAudit.issues.some(issue => issue.code.startsWith("spanish_"));
      if (!detected || source === "primary") {
        falseAccepts += 1;
        code = "0x30";
        status = "FALSE_ACCEPT";
      } else if (!correctionPromptSeen || result.out.opening !== opening || result.out.ritual !== ritual) {
        lunaRewrites += 1;
        code = "0x57";
        status = "LUNA_REWRITE";
      } else if (!finalAudit.valid || output === item.input) {
        lunaInvalid += 1;
        code = "0x58";
        status = "LUNA_INVALID";
      } else if (source === "escalation") {
        lunaPass += 1;
        code = "0x56";
        status = "PASS";
      } else {
        lunaInvalid += 1;
        code = "0x58";
        status = "UNEXPECTED_SOURCE";
      }
    }
  } catch (cause) {
    errors += 1;
    output = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  }

  if (item.kind === "grammar" && output) {
    const earlier = seenLunaOutputs.get(output);
    if (earlier && earlier !== item.id) {
      duplicates += 1;
      status = `${status}+DUPLICATE_OF_${earlier}`;
    } else {
      seenLunaOutputs.set(output, item.id);
    }
  }

  const llmUsed = realCalls > 1;
  const tier = llmUsed ? escalationModel : "none";
  process.stdout.write(
    `[${String(index + 1).padStart(3, "0")}/100] ${item.id} KIND=${item.kind.toUpperCase()} CODE=${code} STATUS=${status} SOURCE=${source} LLM=${llmUsed ? "yes" : "no"} TIER=${tier}\n` +
    `INPUT : ${item.input}\n` +
    `OUTPUT: ${output}\n` +
    `AUDIT : ${auditCodes}\n` +
    `RUNNING: correct=${correctPass}/20 immersion=${immersionPass}/40 luna=${lunaPass}/40 false_accept=${falseAccepts} false_reject=${falseRejects} rewrite=${lunaRewrites} invalid=${lunaInvalid} reconstructed=${reconstructed} duplicates=${duplicates} errors=${errors}\n\n`
  );
}

console.log("=== FINAL ===");
console.log(`Correct unchanged : ${correctPass}/20`);
console.log(`Name immersion    : ${immersionPass}/40`);
console.log(`Luna corrected    : ${lunaPass}/40`);
console.log(`False accepts     : ${falseAccepts}`);
console.log(`False rejects     : ${falseRejects}`);
console.log(`Luna rewrites     : ${lunaRewrites}`);
console.log(`Luna invalid      : ${lunaInvalid}`);
console.log(`Reconstructed     : ${reconstructed}`);
console.log(`Duplicate Luna out: ${duplicates}`);
console.log(`Execution errors  : ${errors}`);

const green = correctPass === 20 && immersionPass === 40 && lunaPass === 40 &&
  falseAccepts === 0 && falseRejects === 0 && immersionErrors === 0 &&
  lunaRewrites === 0 && lunaInvalid === 0 && reconstructed === 0 &&
  duplicates === 0 && errors === 0;

if (!green) process.exitCode = 1;
