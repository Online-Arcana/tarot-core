import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  canonicalCardAt,
  canonicalCardIds,
  canonicalSpread,
} from "../dist/domain/canonical.js";
import { runModelSession } from "../dist/model/run.js";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is required for the paid ritual actor diagnostic");

const lang = "es-ES";
const reader = "selena";
const readerName = "Selena";
const querent = "Alex";
const question = "¿Qué necesito comprender para avanzar con claridad sin renunciar a mi libertad?";
const pack = { prompt: { reading: "", chat: "" } };
const spread = canonicalSpread("three", lang);
const ids = canonicalCardIds().slice(0, 3);
const draw = {
  id: spread.id,
  name: spread.name,
  purpose: spread.purpose,
  cards: ids.map((id, index) => canonicalCardAt(id, "upright", index + 1, spread.id, lang)),
};

const report = {
  kind: "spanish-ritual-actor-stage-diagnostic",
  commit: process.env.GITHUB_SHA ?? null,
  reader,
  lang,
  generatedAt: new Date().toISOString(),
  positions: [],
};

let activeCalls = [];

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

function visibleRitual(value) {
  if (typeof value !== "object" || value === null) return null;
  if (typeof value.opening !== "string" || typeof value.ritual !== "string" || typeof value.gesture !== "string") return null;
  return [value.opening, value.ritual, value.gesture].filter(Boolean).join(" ").replace(/\s+/gu, " ").trim();
}

function countName(value) {
  if (typeof value !== "string") return 0;
  return value.match(/\bSelena\b/gu)?.length ?? 0;
}

function classify(value) {
  if (visibleRitual(value) !== null) return "ritual-candidate";
  if (typeof value === "object" && value !== null && (value.verdict === "pass" || value.verdict === "repair") && Array.isArray(value.findings)) {
    return "semantic-audit";
  }
  if (typeof value === "object" && value !== null && Array.isArray(value.edits)) return "semantic-repair";
  return "other";
}

async function tracedFetch(input, init) {
  const started = performance.now();
  const requestBody = typeof init?.body === "string" ? safeJson(init.body) : null;
  const response = await fetch(input, init);
  let responseBody = null;
  try { responseBody = await response.clone().json(); } catch {}
  const rawOutputText = responseText(responseBody);
  const parsedOutput = rawOutputText === null ? null : safeJson(rawOutputText);
  const kind = classify(parsedOutput);
  const visible = visibleRitual(parsedOutput);
  activeCalls.push({
    kind,
    model: requestBody?.model ?? null,
    reasoningEffort: requestBody?.reasoning?.effort ?? null,
    status: response.status,
    durationMs: Math.round(performance.now() - started),
    parsedOutput,
    visible,
    readerNameCount: countName(visible),
  });
  return response;
}

function repairNameDelta(call) {
  if (call.kind !== "semantic-repair" || !Array.isArray(call.parsedOutput?.edits)) return 0;
  return call.parsedOutput.edits.reduce((sum, edit) => {
    if (typeof edit?.before !== "string" || typeof edit?.after !== "string") return sum;
    return sum + countName(edit.after) - countName(edit.before);
  }, 0);
}

const priorRituals = [];
for (let card = 0; card < draw.cards.length; card += 1) {
  activeCalls = [];
  const req = {
    task: "ritual",
    lang,
    reader,
    name: querent,
    history: [],
    question,
    spread: draw.id,
    card,
    drawn: draw.cards[card],
    draw,
    priorRituals: [...priorRituals],
  };

  const result = await runModelSession(pack, req, {
    apiKey,
    conversation: false,
    guaranteeOutput: true,
    fetch: tracedFetch,
    retries: 1,
    body: {
      store: false,
      max_output_tokens: 900,
      reasoning: { effort: "low" },
    },
  });

  const finalVisible = visibleRitual(result.out) ?? "";
  const ritualCandidates = activeCalls.filter(call => call.kind === "ritual-candidate");
  const lastBaseCandidate = ritualCandidates.at(-1)?.visible ?? null;
  const repairCalls = activeCalls.filter(call => call.kind === "semantic-repair");
  const repairReaderNameDelta = repairCalls.reduce((sum, call) => sum + repairNameDelta(call), 0);

  const position = {
    position: card + 1,
    finalVisible,
    finalReaderNameCount: countName(finalVisible),
    lastBaseCandidate,
    baseReaderNameCount: countName(lastBaseCandidate),
    repairReaderNameDelta,
    semanticRepairRan: repairCalls.length > 0,
    repairIntroducedReaderName: repairReaderNameDelta > 0,
    source: result.source,
    auditErrors: result.auditErrors,
    calls: activeCalls,
  };
  report.positions.push(position);
  priorRituals.push(finalVisible);

  console.log(`\n=== position ${position.position} ===`);
  console.log(`base reader-name count: ${position.baseReaderNameCount}`);
  console.log(`final reader-name count: ${position.finalReaderNameCount}`);
  console.log(`semantic repair ran: ${position.semanticRepairRan}`);
  console.log(`semantic repair reader-name delta: ${position.repairReaderNameDelta}`);
  console.log("BASE CANDIDATE:");
  console.log(position.lastBaseCandidate ?? "<none>");
  console.log("FINAL:");
  console.log(position.finalVisible);
  console.log("CALL STAGES:");
  for (const [index, call] of position.calls.entries()) {
    console.log(`${index + 1}. ${call.kind} model=${call.model} effort=${call.reasoningEffort} nameCount=${call.readerNameCount}`);
    if (call.kind === "semantic-audit") console.log(JSON.stringify(call.parsedOutput));
    if (call.kind === "semantic-repair") console.log(JSON.stringify(call.parsedOutput));
  }
}

await writeFile("spanish-ritual-actor-diagnostic.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");

const repairIntroduced = report.positions.some(position => position.repairIntroducedReaderName);
const baseRepeated = report.positions.some(position => position.baseReaderNameCount > 1);
const finalRepeated = report.positions.some(position => position.finalReaderNameCount > 1);

console.log("\n=== diagnostic summary ===");
console.log(JSON.stringify({ repairIntroduced, baseRepeated, finalRepeated }, null, 2));

if (repairIntroduced || finalRepeated) {
  process.exitCode = 2;
}
