import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  canonicalCardAt,
  canonicalCardIds,
  canonicalSpread,
} from "../dist/domain/canonical.js";
import { auditModelOut as productionAuditModelOut } from "../dist/model/production-audit.js";
import { finaliseModelOutDetailed } from "../dist/model/finalise.js";
import { reconstructModelOutDetailed } from "../dist/model/recover.js";
import { runModelSession } from "../dist/model/run.js";
import { handoverConv } from "../dist/reading/handover.js";

const apiKey = process.env.OPENAI_API_KEY?.trim();
const reader = process.env.MATRIX_READER?.trim();
const lang = process.env.MATRIX_LANG?.trim();
const outDir = process.env.MATRIX_OUT_DIR?.trim() || "reports/live-prose";

if (!apiKey) throw new Error("OPENAI_API_KEY is required for the paid live prose matrix");
if (!reader) throw new Error("MATRIX_READER is required");
if (lang !== "en-GB" && lang !== "es-ES") throw new Error("MATRIX_LANG must be en-GB or es-ES");

const readers = ["selena", "brennos", "yejide", "ngaru", "ame", "amaru", "nahid", "mictli"];
const spreads = ["one", "three", "decision", "advice", "celtic"];
if (!readers.includes(reader)) throw new Error(`Unknown MATRIX_READER ${reader}`);

const pack = { prompt: { reading: "", chat: "" } };
const cardIds = canonicalCardIds();
const readerIndex = readers.indexOf(reader);
const langIndex = lang === "es-ES" ? 1 : 0;
const target = readers[(readerIndex + 1) % readers.length];
const querent = "Alex";
const baseQuestion = lang === "es-ES"
  ? "¿Qué necesito comprender sobre el cambio que estoy considerando?"
  : "What do I need to understand about the change I am considering?";
const followUp = lang === "es-ES"
  ? "¿Qué debería hacer con la parte que todavía me resulta más incierta?"
  : "What should I do with the part that still feels most uncertain?";

const genericReader = /\b(?:the reader|the tarot reader|el lector|la lectora|la persona lectora|este lector|esta lectora)\b/iu;
const mappedTerms = /\b(?:deck|cards?|tarot|baraja|naipes?|cartas?)\b/iu;
const placeholderTerms = /\b(?:placeholder|something went wrong|unable to generate|generation failed|error generating|texto provisional|marcador de posición|no se pudo generar|error al generar)\b/iu;

const report = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? null,
  reader,
  lang,
  spreads: [],
  network: [],
  summary: {
    completeReadings: 0,
    tasks: 0,
    primary: 0,
    escalation: 0,
    reconstructed: 0,
    emergencyFallback: 0,
    retryRequests: 0,
    narrowCorrections: 0,
    semanticRepairs: 0,
    semanticUnknown: 0,
    finalAuditIssues: 0,
    genericReaderLabels: 0,
    querentNameNarratorLeaks: 0,
    voiceLeaks: 0,
    mappedCanonicalLeaks: 0,
    futureResultLeaks: 0,
    repetitionIssues: 0,
    placeholderRisk: 0,
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
  const effort = task === "read" || task === "chat" || task === "ritual" ? "low" : "none";
  const maxOutputTokens = task === "read" ? 5000
    : task === "chat" ? 1400
    : task === "handover" ? 1800
    : task === "continue" ? 120
    : 700;
  return {
    store: false,
    max_output_tokens: maxOutputTokens,
    reasoning: { effort },
  };
}

function strings(value, path = "") {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${path}[${index}]`));
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, item]) => strings(item, path ? `${path}.${key}` : key));
}

function narratorStrings(task, out) {
  if (task === "ritual") return [out.gesture, out.opening, out.ritual];
  if (task === "read") return [out.note];
  if (task === "chat") return [out.gesture];
  return [];
}

function readerDialogueStrings(task, out) {
  if (task === "read") return [...out.cardText, out.synthesis, out.reading, out.closing];
  if (task === "chat") return [out.response];
  if (task === "fit") return [out.reason, out.offer];
  if (task === "invite" || task === "continue" || task === "return") return [out.text];
  if (task === "suggest") return out.suggestions;
  return [];
}

function countIssue(issue, summary) {
  summary.finalAuditIssues += 1;
  if (issue.code === "generic_reader") summary.genericReaderLabels += 1;
  if (issue.code === "querent_name_narrator") summary.querentNameNarratorLeaks += 1;
  if (issue.code === "reader_third_person" || issue.code === "narrator_first_person" || issue.code === "ritual_voice_leak" || issue.code === "voice" || issue.code === "reader_identity" || issue.code === "actor") summary.voiceLeaks += 1;
  if (issue.code === "canonical_medium" || issue.code === "hidden_canonical" || issue.code === "medium_grounding") summary.mappedCanonicalLeaks += 1;
  if (issue.code === "future_result" || issue.code === "result_reference") summary.futureResultLeaks += 1;
  if (issue.code === "duplicate" || issue.code === "repetitive" || issue.code === "theatre_repetitive" || issue.code === "ritual_reuse" || issue.code === "repetition" || issue.code === "ritual_continuity") summary.repetitionIssues += 1;
}

function semanticFinalIssues(result) {
  return result.auditErrors
    .filter(value => value.startsWith("semantic_final_issue:"))
    .map(value => {
      const rest = value.slice("semantic_final_issue:".length);
      const first = rest.indexOf(":");
      const second = first < 0 ? -1 : rest.indexOf(":", first + 1);
      if (first < 0 || second < 0) return { code: "semantic", path: "output", message: value };
      const code = rest.slice(0, first);
      const path = rest.slice(first + 1, second);
      const rawEvidence = rest.slice(second + 1);
      const parsed = safeJson(rawEvidence);
      const evidence = typeof parsed === "string" ? parsed : rawEvidence;
      return { code, path, message: `${path}: semantic ${code}; evidence=${JSON.stringify(evidence)}` };
    });
}

function logicalCallCount(result, task) {
  const diagnostics = result.auditErrors;
  let expected = 1;
  if (diagnostics.some(value => value.startsWith("atomic_review:") || value.startsWith("atomic_review_exception:"))) expected += 1;
  if (diagnostics.some(value => value.includes("broad_correction"))) expected += 1;
  if (result.source !== "reconstructed" && task !== "handover" && !diagnostics.includes("semantic_audit:skipped_due_deterministic_findings")) expected += 1;
  if (diagnostics.some(value => value.startsWith("semantic_repair:") || value === "delivery_path:semantic_atomic_revision" || value === "delivery_path:semantic_imperfect_revision" || value === "delivery_path:semantic_unconfirmed_revision" || value === "delivery_path:semantic_atomic_revision_retry")) expected += 1;
  if (diagnostics.some(value => value.startsWith("semantic_reaudit:") || value.includes("semantic_reaudit:"))) expected += 1;
  if (diagnostics.some(value => value.startsWith("semantic_retry_repair:"))) expected += 1;
  if (diagnostics.some(value => value.startsWith("semantic_retry_reaudit:"))) expected += 1;
  return expected;
}

function usedAtomicRevision(result) {
  return result.auditErrors.some(value =>
    value === "delivery_path:atomic_revision" ||
    value === "delivery_path:contextual_atomic_revision" ||
    value === "delivery_path:semantic_atomic_revision" ||
    value === "delivery_path:semantic_atomic_revision_retry" ||
    value === "delivery_path:semantic_imperfect_revision" ||
    value === "delivery_path:semantic_unconfirmed_revision" ||
    value.startsWith("atomic_review:edits:") ||
    value.startsWith("contextual_review:edits:") ||
    value.startsWith("semantic_repair:edits:") ||
    value.startsWith("semantic_retry_repair:edits:"));
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
    const retries = Math.max(0, calls.length - logicalCallCount(result, req.task));
    const deterministicAudit = productionAuditModelOut(req, result.out);
    const semanticIssues = semanticFinalIssues(result);
    const auditIssues = [...deterministicAudit.issues, ...semanticIssues];
    const semanticUnknown = result.auditErrors.includes("semantic_final:unknown");
    report.summary.tasks += 1;
    report.summary[result.source] += 1;
    report.summary.retryRequests += retries;
    if (result.auditErrors.includes("emergency_fallback_used")) report.summary.emergencyFallback += 1;
    if (usedAtomicRevision(result)) report.summary.narrowCorrections += 1;
    if (result.auditErrors.some(value => value.startsWith("semantic_repair:edits:"))) report.summary.semanticRepairs += 1;
    if (semanticUnknown) report.summary.semanticUnknown += 1;
    for (const issue of auditIssues) countIssue(issue, report.summary);

    const allVisible = strings(result.out).map(item => item.value).join(" ");
    const narrator = narratorStrings(req.task, result.out).join(" ");
    const dialogue = readerDialogueStrings(req.task, result.out).join(" ");
    const scans = {
      genericReaderLabel: genericReader.test(allVisible),
      querentNameInNarrator: narrator.includes(querent),
      mappedCanonicalTermInDialogue: reader !== "selena" && mappedTerms.test(dialogue),
      placeholderTerm: placeholderTerms.test(allVisible),
    };
    // Generic-reader, narrator-name and mapped-canonical violations are now
    // authoritative production-audit findings. Preserve raw scan booleans in
    // the artifact for human review, but do not double-count them here.
    if (scans.placeholderTerm) report.summary.placeholderRisk += 1;

    return {
      label,
      task: req.task,
      durationMs: Math.round(performance.now() - started),
      source: result.source,
      primaryModel: result.primaryModel,
      escalationModel: result.escalationModel,
      auditErrors: result.auditErrors,
      finalAudit: { valid: auditIssues.length === 0 && !semanticUnknown, issues: auditIssues },
      networkCalls: calls.length,
      retryRequests: retries,
      scans,
      out: result.out,
    };
  } catch (error) {
    report.summary.failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    return {
      label,
      task: req.task,
      durationMs: Math.round(performance.now() - started),
      failed: true,
      error: message,
      networkCalls: report.network.length - networkStart,
    };
  } finally {
    currentTask = "";
  }
}

function deterministicOut(req, label) {
  const reconstructed = reconstructModelOutDetailed(req, []);
  const out = finaliseModelOutDetailed(req, reconstructed.out).out;
  const audit = productionAuditModelOut(req, out);
  if (!audit.valid) throw new Error(`${label}: deterministic target fixture failed audit: ${audit.errors.join(" | ")}`);
  return out;
}

function deterministicTargetReading(targetReader, draw, prefix) {
  const targetBase = { lang, reader: targetReader, name: querent, history: [] };
  const priorRituals = [];
  for (let card = 0; card < draw.cards.length; card += 1) {
    const ritualReq = {
      ...targetBase,
      task: "ritual",
      question: baseQuestion,
      spread: draw.id,
      card,
      drawn: draw.cards[card],
      draw,
      priorRituals: [...priorRituals],
    };
    const ritual = deterministicOut(ritualReq, `${prefix}/target-fixture/ritual/${card + 1}`);
    priorRituals.push([ritual.gesture, ritual.opening, ritual.ritual].join(" ").trim());
  }
  const readReq = {
    ...targetBase,
    task: "read",
    question: baseQuestion,
    draw,
    ritualTheatre: priorRituals,
  };
  return {
    id: `${prefix}-target-reading`,
    kind: "reading",
    at: "2026-08-11T18:18:00.000Z",
    question: baseQuestion,
    draw,
    out: deterministicOut(readReq, `${prefix}/target-fixture/read`),
  };
}

function drawFor(spreadId, spreadIndex) {
  const spread = canonicalSpread(spreadId, lang);
  const offset = (readerIndex * 17 + langIndex * 29 + spreadIndex * 11) % cardIds.length;
  const selected = [];
  for (let index = 0; index < spread.pos.length; index += 1) {
    const id = cardIds[(offset + index * 7) % cardIds.length];
    selected.push(canonicalCardAt(id, index % 2 === 0 ? "upright" : "reversed", index + 1, spread.id, lang));
  }
  return {
    id: spread.id,
    name: spread.name,
    purpose: spread.purpose,
    cards: selected,
  };
}

for (let spreadIndex = 0; spreadIndex < spreads.length; spreadIndex += 1) {
  const spreadId = spreads[spreadIndex];
  const draw = drawFor(spreadId, spreadIndex);
  const prefix = `${reader}/${lang}/${spreadId}`;
  const history = [];
  const base = { lang, reader, name: querent, history };
  const entry = {
    spread: spreadId,
    draw: draw.cards.map(card => ({ id: card.id, side: card.side, position: card.pos, positionName: card.posName })),
    tasks: {},
  };

  entry.tasks.invite = await runTask(`${prefix}/invite`, { ...base, task: "invite" });
  entry.tasks.fit = await runTask(`${prefix}/fit`, { ...base, task: "fit", question: baseQuestion });

  const priorRituals = [];
  entry.tasks.rituals = [];
  for (let card = 0; card < draw.cards.length; card += 1) {
    const ritualReq = {
      ...base,
      task: "ritual",
      question: baseQuestion,
      spread: spreadId,
      card,
      drawn: draw.cards[card],
      draw,
      priorRituals: [...priorRituals],
    };
    const ritual = await runTask(`${prefix}/ritual/${card + 1}`, ritualReq);
    entry.tasks.rituals.push(ritual);
    if (ritual.failed !== true) {
      priorRituals.push([ritual.out.gesture, ritual.out.opening, ritual.out.ritual].join(" ").trim());
    }
  }

  const readReq = {
    ...base,
    task: "read",
    question: baseQuestion,
    draw,
    ritualTheatre: priorRituals,
  };
  entry.tasks.read = await runTask(`${prefix}/read`, readReq);
  if (entry.tasks.read.failed === true) {
    report.spreads.push(entry);
    continue;
  }

  const readOut = entry.tasks.read.out;
  const localHistory = [{ kind: "read", question: baseQuestion, response: readOut.reading }];
  const baseWithHistory = { lang, reader, name: querent, history: localHistory };
  const chatReq = { ...baseWithHistory, task: "chat", question: followUp };
  entry.tasks.chat = await runTask(`${prefix}/chat`, chatReq);

  const turn = {
    id: `${prefix}-reading`,
    kind: "reading",
    at: "2026-08-11T18:00:00.000Z",
    question: baseQuestion,
    draw,
    out: readOut,
  };
  entry.tasks.suggest = await runTask(`${prefix}/suggest`, { ...baseWithHistory, task: "suggest", turn });
  entry.tasks.continue = await runTask(`${prefix}/continue`, { ...baseWithHistory, task: "continue", turn });
  entry.tasks.title = await runTask(`${prefix}/title`, { ...baseWithHistory, task: "title", turn });

  const chatOut = entry.tasks.chat.failed === true
    ? { gesture: "", response: followUp }
    : entry.tasks.chat.out;
  const trail = {
    id: `${prefix}-trail`,
    summary: lang === "es-ES" ? "La lectura dejó una decisión todavía abierta." : "The reading left one decision still open.",
    visits: [{ reader, conv: `${prefix}-conv`, at: "2026-08-11T18:00:00.000Z", question: baseQuestion, note: "" }],
  };
  const conv = {
    v: 1,
    id: `${prefix}-conv`,
    lang,
    reader,
    created: "2026-08-11T18:00:00.000Z",
    updated: "2026-08-11T18:10:00.000Z",
    name: querent,
    trail,
    turns: [
      turn,
      { id: `${prefix}-chat`, kind: "chat", at: "2026-08-11T18:05:00.000Z", question: followUp, out: chatOut },
    ],
  };
  const referralReason = lang === "es-ES" ? "Continuar la reflexión." : "Continue the reflection.";
  const handoverReq = { ...baseWithHistory, task: "handover", question: baseQuestion, target, conv };
  entry.tasks.handover = await runTask(`${prefix}/handover`, handoverReq);

  if (entry.tasks.handover.failed !== true) {
    const targetConv = handoverConv(
      conv,
      { target, question: baseQuestion, reason: referralReason },
      `${prefix}-target`,
      "2026-08-11T18:15:00.000Z",
      entry.tasks.handover.out,
    );
    const targetReadConv = {
      ...targetConv,
      updated: "2026-08-11T18:18:00.000Z",
      turns: [deterministicTargetReading(target, draw, prefix)],
    };
    const returnedConv = handoverConv(
      targetReadConv,
      { target: reader, question: baseQuestion, reason: referralReason },
      `${prefix}-return`,
      "2026-08-11T18:20:00.000Z",
    );
    const returnReq = {
      task: "return",
      lang: returnedConv.lang,
      reader: returnedConv.reader,
      name: returnedConv.name,
      history: [],
      trail: returnedConv.trail,
      handover: returnedConv.handover,
    };
    entry.tasks.return = await runTask(`${prefix}/return`, returnReq);
  }

  const required = ["invite", "fit", "read", "chat", "suggest", "continue", "title", "handover", "return"];
  const ordinarySucceeded = required.every(key => entry.tasks[key]?.failed !== true)
    && entry.tasks.rituals.length === draw.cards.length
    && entry.tasks.rituals.every(item => item.failed !== true);
  if (ordinarySucceeded) report.summary.completeReadings += 1;
  report.spreads.push(entry);
}

await mkdir(outDir, { recursive: true });
const file = `${outDir}/${reader}-${lang}.json`;
await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ file, summary: report.summary }, null, 2));

if (report.summary.failures > 0 || report.summary.finalAuditIssues > 0 || report.summary.semanticUnknown > 0 || report.summary.placeholderRisk > 0) {
  process.exitCode = 2;
}
