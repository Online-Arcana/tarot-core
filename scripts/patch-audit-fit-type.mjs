import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../src/model/audit.ts", import.meta.url);
let source = await readFile(path, "utf8");
const beforeImport = 'import type { ApiOut, ApiReq, ReadingOut, RitualOut } from "../contracts/types.js";';
const afterImport = 'import type { ApiOut, ApiReq, FitOut, ReadingOut, RitualOut } from "../contracts/types.js";';
const beforeCast = 'const value = out as Extract<ApiOut, { level: string }>;';
const afterCast = 'const value = out as FitOut;';
if (!source.includes(beforeImport)) throw new Error("Expected audit import was not found");
if (!source.includes(beforeCast)) throw new Error("Expected fit audit cast was not found");
source = source.replace(beforeImport, afterImport).replace(beforeCast, afterCast);
await writeFile(path, source, "utf8");
