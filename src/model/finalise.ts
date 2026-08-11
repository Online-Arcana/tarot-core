import type { ApiOut, ApiReq, ReadingOut } from "../contracts/types.js";
import { attachMedia } from "../readers/media/runtime.js";
import { futureLeaks, repairFutureLeaks } from "../reading/reveal.js";
import { addressViewer } from "./viewer-narration.js";

export interface FinalisationResult {
  readonly out: ApiOut;
  readonly diagnostics: readonly string[];
}

function spanish(req: ApiReq): boolean {
  return req.lang.toLowerCase().startsWith("es");
}

function serial(value: ApiOut): string {
  return JSON.stringify(value);
}

/**
 * Finalises generated prose inside core while preserving the public ApiOut shape.
 * Spanish narrator audience normalisation is core-side only; English keeps its
 * pre-Spanish orchestration. Media attachment and reveal repair are idempotent.
 */
export function finaliseModelOutDetailed(req: ApiReq, value: ApiOut): FinalisationResult {
  const diagnostics: string[] = [];
  let out = value;

  if (spanish(req)) {
    const before = serial(out);
    out = addressViewer(req, out);
    if (serial(out) !== before) diagnostics.push("spanish_audience_normalised");
  }

  out = attachMedia(req, out);

  if (req.task === "read") {
    const reading = out as ReadingOut;
    const leaks = futureLeaks(req.draw, reading, req.lang, req.question);
    if (leaks.length) {
      out = repairFutureLeaks(req.draw, reading, req.lang, req.question);
      diagnostics.push(...leaks.map(leak => `future_leak_repaired:${leak.card}:${leak.name}`));
    }
  }

  return { out, diagnostics: [...new Set(diagnostics)] };
}

export function finaliseModelOut(req: ApiReq, value: ApiOut): ApiOut {
  return finaliseModelOutDetailed(req, value).out;
}
