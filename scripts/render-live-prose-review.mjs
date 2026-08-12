import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const inputDir = process.env.MATRIX_INPUT_DIR?.trim() || "reports/live-prose";
const output = process.env.MATRIX_REVIEW_MD?.trim() || "reports/live-prose-review.md";

const deck = JSON.parse(await readFile("src/data/deck.json", "utf8"));
const cardsById = new Map((deck.cards ?? []).map(card => [card.id, card]));

const files = (await readdir(inputDir)).filter(name => name.endsWith(".json")).sort();
const reports = [];
for (const name of files) {
  const value = JSON.parse(await readFile(join(inputDir, name), "utf8"));
  if (value?.schemaVersion === 1 && value?.reader && value?.lang && Array.isArray(value?.spreads)) reports.push(value);
}

const clean = value => String(value ?? "").replaceAll("```", "` ` `").trim();
const field = (title, value) => value === undefined || value === null || value === ""
  ? ""
  : `\n**${title}**\n\n${clean(value)}\n`;

function canonicalDrawReference(draw, lang) {
  const key = String(lang).toLowerCase().startsWith("es") ? "es" : "en";
  return (draw ?? []).map(item => {
    const card = cardsById.get(item.id);
    const name = card?.[key]?.name ?? item.id;
    return `${item.position}. ${name} [${item.id}; ${item.side}]`;
  }).join("\n");
}

function taskBlock(title, task) {
  if (!task) return "";
  if (task.failed) return `\n### ${title}\n\n**FAILED:** ${clean(task.error)}\n`;
  const out = task.out ?? {};
  let body = `\n### ${title}\n\nSource: \`${task.source}\`; final audit: ${task.finalAudit?.valid ? "PASS" : "FAIL"}; network calls: ${task.networkCalls}; parse/shape retries: ${task.retryRequests}.\n`;
  if (Array.isArray(task.auditErrors) && task.auditErrors.length > 0) {
    body += field("Orchestration diagnostics", task.auditErrors.map(value => `- ${value}`).join("\n"));
  }
  if (title.startsWith("Ritual ")) return body + field("Gesture", out.gesture) + field("Opening", out.opening) + field("Ritual", out.ritual);
  switch (task.task) {
    case "invite": return body + field("Invite", out.text);
    case "fit": return body + field("Reason", out.reason) + field("Offer", out.offer);
    case "read":
      for (let index = 0; index < (out.cardText?.length ?? 0); index += 1) body += field(`Result ${index + 1}`, out.cardText[index]);
      return body + field("Synthesis", out.synthesis) + field("Reading", out.reading) + field("Closing", out.closing) + field("Narrator note", out.note);
    case "chat": return body + field("Narrator gesture", out.gesture) + field("Response", out.response);
    case "suggest": return body + (out.suggestions ?? []).map((value, index) => field(`Suggestion ${index + 1}`, value)).join("");
    case "continue": return body + field("Continue", out.text);
    case "title": return body + field("Title", out.title);
    case "handover": return body
      + field("Internal summary", out.summary)
      + field("Questions", (out.questions ?? []).join("\n\n"))
      + field("Conclusions", (out.conclusions ?? []).join("\n\n"))
      + field("Canonical cards", (out.cards ?? []).join("\n\n"))
      + field("Facts", (out.facts ?? []).join("\n\n"))
      + field("Unresolved", (out.unresolved ?? []).join("\n\n"));
    case "return": return body + field("Return", out.text);
    default: return body + field("Output", JSON.stringify(out, null, 2));
  }
}

let markdown = "# Live prose human-review pack\n\nThis file contains the accepted final prose from the paid 80-reading matrix. Review naturalness, reader voice, narrator/reader ownership, Spanish grammar, mapped-medium language and cultural appropriateness. Automated audit success is not cultural approval. For mapped readers, compare the generated prose with the clearly marked internal canonical draw reference and flag any canonical card identity that leaks into visible prose without being justified by the user's own question.\n";

for (const report of reports) {
  markdown += `\n# ${report.reader} · ${report.lang}\n\nTested commit: \`${clean(report.commit ?? "MISSING")}\`\n`;
  for (const spread of report.spreads) {
    markdown += `\n## ${spread.spread}\n`;
    markdown += field("Internal canonical draw reference — review only, not public output", canonicalDrawReference(spread.draw, report.lang));
    markdown += taskBlock("Invite", spread.tasks.invite);
    markdown += taskBlock("Fit", spread.tasks.fit);
    for (let index = 0; index < (spread.tasks.rituals?.length ?? 0); index += 1) markdown += taskBlock(`Ritual ${index + 1}`, spread.tasks.rituals[index]);
    markdown += taskBlock("Read", spread.tasks.read);
    markdown += taskBlock("Chat", spread.tasks.chat);
    markdown += taskBlock("Suggest", spread.tasks.suggest);
    markdown += taskBlock("Continue", spread.tasks.continue);
    markdown += taskBlock("Title", spread.tasks.title);
    markdown += taskBlock("Handover", spread.tasks.handover);
    markdown += taskBlock("Return", spread.tasks.return);
  }
}

await writeFile(output, markdown, "utf8");
console.log(`Human-review pack written to ${output}`);