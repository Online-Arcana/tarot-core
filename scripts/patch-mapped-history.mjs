import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../src/model/prompt.ts", import.meta.url);
let source = await readFile(path, "utf8");

function replaceOnce(before, after, label) {
  if (!source.includes(before)) throw new Error(`Expected ${label} block was not found`);
  source = source.replace(before, after);
}

replaceOnce(
  'import { revealedReadingContext } from "./reading-context.js";',
  'import { revealedReadingContext } from "./reading-context.js";\nimport { mappedHandoverPayload, mappedReturnPayload } from "./mapped-history.js";',
  "mapped-history import",
);

replaceOnce(
  '        "cards debe conservar únicamente identificadores o nombres internos suministrados y nunca debe convertirse en diálogo visible.",',
  '        isMappedReader(req.reader)\n          ? "cards es estado canónico interno que completará el motor. Devuelve una lista vacía y no inventes ni nombres resultados canónicos."\n          : "cards debe conservar únicamente identificadores o nombres internos suministrados y nunca debe convertirse en diálogo visible.",',
  "Spanish handover cards contract",
);

replaceOnce(
  '        "cards must preserve only supplied internal identifiers or names and must never become visible dialogue.",',
  '        isMappedReader(req.reader)\n          ? "cards is canonical internal state that the engine will complete. Return an empty list and do not invent or name canonical results."\n          : "cards must preserve only supplied internal identifiers or names and must never become visible dialogue.",',
  "English handover cards contract",
);

replaceOnce(
  '    case "handover":\n      return {',
  '    case "handover":\n      if (isMappedReader(req.reader)) return mappedHandoverPayload(req);\n      return {',
  "handover payload",
);

replaceOnce(
  '    case "return":\n      return {',
  '    case "return":\n      if (isMappedReader(req.reader)) return mappedReturnPayload(req);\n      return {',
  "return payload",
);

await writeFile(path, source, "utf8");
