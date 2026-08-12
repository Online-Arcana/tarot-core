import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  canonicalCardAt,
  canonicalCardIds,
  canonicalSpread,
} from "../dist/domain/canonical.js";
import { auditModelOut } from "../dist/model/audit.js";
import { finaliseModelOutDetailed } from "../dist/model/finalise.js";
import { modelPayload } from "../dist/model/prompt.js";
import { reconstructModelOutDetailed } from "../dist/model/recover.js";
import { runModelSession } from "../dist/model/run.js";
import { handoverConv } from "../dist/reading/handover.js";

const apiKey = process.env.OPENAI_API_KEY?.trim();
const lang = process.env.CHAIN_LANG?.trim();
const seed = process.env.CHAIN_SEED?.trim() || "tarot-core-reader-chain-v1";
const outDir = process.env.CHAIN_OUT_DIR?.trim() || "reports/live-chain";
const commit = process.env.GITHUB_SHA?.trim() || null;

if (!apiKey) throw new Error("OPENAI_API_KEY is required for the paid chained reader smoke");
if (lang !== "en-GB" && lang !== "es-ES") throw new Error("CHAIN_LANG must be en-GB or es-ES");
if (!commit) throw new Error("GITHUB_SHA must contain the tested local checkout commit");

const readers = ["brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const spreadIds = ["three", "decision", "advice"];
const cardIds = canonicalCardIds();
const querent = "Alex";
const pack = { prompt: { reading: "", chat: "" } };
const baseQuestion = lang === "es-ES"
  ? "¿Qué necesito comprender sobre el cambio que estoy considerando?"
  : "What do I need to understand about the change I am considering?";
const nextQuestion = lang === "es-ES"
  ? "¿Qué necesito comprender después sobre este cambio sin perder de vista lo que ya está establecido?"
  : "What should I understand next about this change without losing sight of what is already established?";
const referralReason = lang === "es-ES"
  ? "Continuar la reflexión con la siguiente voz lectora."
  : "Continue the reflection with the next reader voice.";

const report = {
  schemaVersion: 1,
  kind: "chained-three-card-reader-smoke",
  generatedAt: new Date().toISOString(),
  commit,
  lang,
  seed,
  genderMode: "missing-neutral-fallback",
  expected: {
    paidReadings: 7,
    paidTasks: 35,
    ritualTasks: 21,
    readTasks: 7,
    handoverTasks: 7,
  },
  seedHandover: null,
  chain: [],
  network: [],
  summary: {
    completeReadings: 0,
    tasks: 0,
    ritualTasks: 0,
    readTasks: 0,
    handoverTasks: 0,
    primary: 0,
    escalation: 0,
    reconstructed: 0,
    emergencyFallback: 0,
    retryRequests: 0,
    narrowCorrections: 0,
    finalAuditIssues: 0,
    querentGenderIssues: 0,
    genericReaderLabels: 0,
    voiceLeaks: 0,
    mappedCanonicalLeaks: 0,
    futureResultLeaks: 0,
    repetitionIssues: 0,
    placeholderRisk: 0,
    handoverAcceptanceFailures: 0,
    failures: 0,
  },
};

let currentTask = "";

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function responseText(value) {
  if (typeof value !== "object" || value === null) return null;
  if (typeof value.output_text === "string") return value.output_text;
  if (!Array.isArray(value.output)) return null;
  for (const item of value.output) {
    if (typeof item !== "object" || item === null || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (typeof part === "object" && part !== null && typeof part.text === "string") return part.text;
    }
  }
  return null;
}

async function tracedFetch(input, init) {
  const started = performance.now();
  const body = typeof init?.body === "string" ? safeJson(init.body) : null;
  const response = await fetch(input, init);
  let responseBody = null;
  try { responseBody = await response.clone().json(); } catch {}
  const outputText = responseText(responseBody);
  report.network.push({
    task: currentTask,
    model: body?.model ?? null,
    reasoningEffort: body?.reasoning?.effort ?? null,
    status: response.status,
    durationMs: Math.round(performance.now() - started),
    rawOutputText: outputText,
    parsedOutput: outputText === null ? null : safeJson(outputText),
    error: response.ok ? null : responseBody,
  });
  return response;
}

function bodyFor(task) {
  const effort = task === "read" || task === "ritual" ? "low" : "none";
  const maxOutputTokens = task === "read" ? 5000 : task === "handover" ? 1800 : 700;
  return {
    store: false,
    max_output_tokens: maxOutputTokens,
    reasoning: { effort },
  };
}

function countIssue(issue) {
  report.summary.finalAuditIssues += 1;
  if (issue.code === "querent_gender") report.summary.querentGenderIssues += 1;
  if (issue.code === "generic_reader") report.summary.genericReaderLabels += 1;
  if (issue.code === "reader_third_person" || issue.code === "narrator_first_person" || issue.code === "ritual_voice_leak") report.summary.voiceLeaks += 1;
  if (issue.code === "canonical_medium" || issue.code === "hidden_canonical") report.summary.mappedCanonicalLeaks += 1;
  if (issue.code === "future_result") report.summary.futureResultLeaks += 1;
  if (issue.code === "duplicate" || issue.code === "repetitive" || issue.code === "theatre_repetitive" || issue.code === "ritual_reuse") report.summary.repetitionIssues += 1;
}

async function runTask(label, req) {
  currentTask = label;
  const networkStart = report.network.length;
  const started = performance.now();
  try {
    const result = await runModelSession(pack, req, {
      apiKey,
      conversation: false,
      guaranteeOutput: true,
      fetch: tracedFetch,
      retries: 1,
      body: bodyFor(req.task),
    });
    const calls = report.network.slice(networkStart);
    const expectedCalls = result.source === "primary" ? 1 : 2;
    const retries = Math.max(0, calls.length - expectedCalls);
    const audit = auditModelOut(req, result.out);

    report.summary.tasks += 1;
    report.summary[result.source] += 1;
    report.summary.retryRequests += retries;
    if (req.task === "ritual") report.summary.ritualTasks += 1;
    if (req.task === "read") report.summary.readTasks += 1;
    if (req.task === "handover") report.summary.handoverTasks += 1;
    if (result.auditErrors.includes("emergency_fallback_used")) report.summary.emergencyFallback += 1;
    if (result.auditErrors.some(value => value.includes("narrow_spanish_narrator_correction:"))) report.summary.narrowCorrections += 1;
    for (const issue of audit.issues) countIssue(issue);
    if (!audit.valid) report.summary.placeholderRisk += 1;

    return {
      label,
      task: req.task,
      durationMs: Math.round(performance.now() - started),
      source: result.source,
      primaryModel: result.primaryModel,
      escalationModel: result.escalationModel,
      auditErrors: result.auditErrors,
      finalAudit: { valid: audit.valid, issues: audit.issues },
      networkCalls: calls.length,
      retryRequests: retries,
      out: result.out,
    };
  } catch (error) {
    report.summary.failures += 1;
    report.summary.placeholderRisk += 1;
    return {
      label,
      task: req.task,
      durationMs: Math.round(performance.now() - started),
      failed: true,
      error: error instanceof Error ? error.message : String(error),
      networkCalls: report.network.length - networkStart,
    };
  } finally {
    currentTask = "";
  }
}

function seed32(value) {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function randomFor(value) {
  let state = seed32(value);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function planFor(reader) {
  const random = randomFor(`${seed}:${reader}`);
  const spread = spreadIds[Math.floor(random() * spreadIds.length)];
  const ids = [...cardIds];
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  return {
    spread,
    cards: ids.slice(0, 3).map(id => ({ id, side: random() < 0.5 ? "upright" : "reversed" })),
  };
}

function drawFromPlan(plan) {
  const spread = canonicalSpread(plan.spread, lang);
  if (spread.pos.length !== 3) throw new Error(`${plan.spread} is not a three-result spread`);
  return {
    id: spread.id,
    name: spread.name,
    purpose: spread.purpose,
    cards: plan.cards.map((item, index) => canonicalCardAt(item.id, item.side, index + 1, spread.id, lang)),
  };
}

function deterministicOut(req, label) {
  const reconstructed = reconstructModelOutDetailed(req, []);
  const out = finaliseModelOutDetailed(req, reconstructed.out).out;
  const audit = auditModelOut(req, out);
  if (!audit.valid) throw new Error(`${label}: deterministic seed fixture failed audit: ${audit.errors.join(" | ")}`);
  return out;
}

function at(index, minuteOffset = 0) {
  return new Date(Date.UTC(2026, 7, 12, 9, index * 10 + minuteOffset, 0)).toISOString();
}

function seedConversation() {
  const plan = planFor("selena");
  const draw = drawFromPlan(plan);
  const readReq = {
    task: "read",
    lang,
    reader: "selena",
    name: querent,
    history: [],
    question: baseQuestion,
    draw,
  };
  const out = deterministicOut(readReq, `${lang}/seed/selena/read`);
  const source = {
    v: 1,
    id: `${lang}-seed-selena`,
    lang,
    reader: "selena",
    created: at(0),
    updated: at(0, 1),
    name: querent,
    turns: [{
      id: `${lang}-seed-selena-reading`,
      kind: "reading",
      at: at(0, 1),
      question: baseQuestion,
      draw,
      out,
    }],
  };
  const accepted = handoverConv(
    source,
    { target: "brennos", question: baseQuestion, reason: referralReason },
    `${lang}-chain-brennos`,
    at(0, 2),
  );
  return { source, accepted, plan };
}

function acceptanceSnapshot(conv, expectedReader) {
  const handover = conv.handover;
  const lastVisit = conv.trail?.visits.at(-1) ?? null;
  const valid = Boolean(
    handover &&
    handover.to === expectedReader &&
    conv.reader === expectedReader &&
    lastVisit?.reader === expectedReader &&
    handover.results?.length,
  );
  return {
    valid,
    from: handover?.from ?? null,
    to: handover?.to ?? null,
    trailVisits: conv.trail?.visits.length ?? 0,
    lastVisitReader: lastVisit?.reader ?? null,
    resultState: handover?.results ?? [],
  };
}

const seeded = seedConversation();
let conv = seeded.accepted;
report.seedHandover = {
  sourceReader: "selena",
  targetReader: "brennos",
  plan: seeded.plan,
  accepted: acceptanceSnapshot(conv, "brennos"),
};
if (!report.seedHandover.accepted.valid) {
  report.summary.handoverAcceptanceFailures += 1;
  throw new Error("Deterministic Selena→Brennos seed handover was not accepted");
}

for (let index = 0; index < readers.length; index += 1) {
  const reader = readers[index];
  const target = readers[index + 1] ?? "selena";
  const plan = planFor(reader);
  const draw = drawFromPlan(plan);
  const incoming = acceptanceSnapshot(conv, reader);
  const question = conv.handover?.question || baseQuestion;
  const prefix = `${reader}/${lang}/${plan.spread}`;
  const entry = {
    reader,
    target,
    plan,
    draw: draw.cards.map(card => ({
      id: card.id,
      side: card.side,
      position: card.pos,
      positionName: card.posName,
    })),
    incoming,
    inboundModelContext: false,
    tasks: { rituals: [] },
    outgoing: null,
  };

  if (!incoming.valid) {
    report.summary.handoverAcceptanceFailures += 1;
    report.summary.failures += 1;
    report.chain.push(entry);
    break;
  }

  const base = {
    lang,
    reader,
    name: querent,
    history: [],
    ...(conv.trail ? { trail: conv.trail } : {}),
    ...(conv.handover ? { handover: conv.handover } : {}),
  };

  const probe = {
    ...base,
    task: "ritual",
    question,
    spread: draw.id,
    card: 0,
    drawn: draw.cards[0],
    draw,
    priorRituals: [],
  };
  const probePayload = modelPayload(probe);
  entry.inboundModelContext = Boolean(
    probePayload && typeof probePayload === "object" && "previousHandover" in probePayload,
  );
  if (!entry.inboundModelContext) {
    report.summary.handoverAcceptanceFailures += 1;
    report.summary.failures += 1;
    report.chain.push(entry);
    break;
  }

  const priorRituals = [];
  for (let card = 0; card < draw.cards.length; card += 1) {
    const ritualReq = {
      ...base,
      task: "ritual",
      question,
      spread: draw.id,
      card,
      drawn: draw.cards[card],
      draw,
      priorRituals: [...priorRituals],
    };
    const ritual = await runTask(`${prefix}/ritual/${card + 1}`, ritualReq);
    entry.tasks.rituals.push(ritual);
    if (ritual.failed === true) break;
    priorRituals.push([ritual.out.opening, ritual.out.ritual, ritual.out.gesture].join(" ").trim());
  }

  if (entry.tasks.rituals.length !== 3 || entry.tasks.rituals.some(item => item.failed === true)) {
    report.chain.push(entry);
    break;
  }

  const readReq = {
    ...base,
    task: "read",
    question,
    draw,
    ritualTheatre: priorRituals,
  };
  entry.tasks.read = await runTask(`${prefix}/read`, readReq);
  if (entry.tasks.read.failed === true) {
    report.chain.push(entry);
    break;
  }

  const turn = {
    id: `${lang}-${reader}-reading`,
    kind: "reading",
    at: at(index + 1, 4),
    question,
    draw,
    out: entry.tasks.read.out,
  };
  const sourceConv = {
    ...conv,
    updated: at(index + 1, 4),
    turns: [turn],
  };
  const history = [{ kind: "reading", question, response: entry.tasks.read.out.reading }];
  const handoverReq = {
    task: "handover",
    lang,
    reader,
    name: querent,
    history,
    ...(sourceConv.trail ? { trail: sourceConv.trail } : {}),
    ...(sourceConv.handover ? { handover: sourceConv.handover } : {}),
    question: nextQuestion,
    target,
    conv: sourceConv,
  };
  entry.tasks.handover = await runTask(`${prefix}/handover`, handoverReq);
  if (entry.tasks.handover.failed === true) {
    report.chain.push(entry);
    break;
  }

  const nextConv = handoverConv(
    sourceConv,
    { target, question: nextQuestion, reason: referralReason },
    `${lang}-chain-${target}-${index + 1}`,
    at(index + 1, 6),
    entry.tasks.handover.out,
  );
  entry.outgoing = acceptanceSnapshot(nextConv, target);
  const exactCarry = entry.outgoing.resultState.length === draw.cards.length &&
    entry.outgoing.resultState.every((result, resultIndex) =>
      result.id === draw.cards[resultIndex].id && result.side === draw.cards[resultIndex].side,
    );
  entry.outgoing.exactResultState = exactCarry;
  if (!entry.outgoing.valid || !exactCarry) {
    report.summary.handoverAcceptanceFailures += 1;
    report.summary.failures += 1;
    report.chain.push(entry);
    break;
  }

  report.summary.completeReadings += 1;
  report.chain.push(entry);
  conv = nextConv;
}

await mkdir(outDir, { recursive: true });
const file = `${outDir}/chain-${lang}.json`;
await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ file, summary: report.summary }, null, 2));

const hardFailure =
  report.summary.completeReadings !== report.expected.paidReadings ||
  report.summary.tasks !== report.expected.paidTasks ||
  report.summary.ritualTasks !== report.expected.ritualTasks ||
  report.summary.readTasks !== report.expected.readTasks ||
  report.summary.handoverTasks !== report.expected.handoverTasks ||
  report.summary.failures > 0 ||
  report.summary.finalAuditIssues > 0 ||
  report.summary.emergencyFallback > 0 ||
  report.summary.placeholderRisk > 0 ||
  report.summary.handoverAcceptanceFailures > 0;

if (hardFailure) process.exitCode = 2;
