import type { ApiOut, ApiReq } from "../contracts/types.js";

/**
 * @deprecated Audience perspective is authored by the generation prompt and,
 * when necessary, corrected by the contextual atomic LLM reviewer.
 *
 * This compatibility export intentionally performs no transformation. The old
 * implementation attempted to infer grammatical role and rewrite generated
 * English/Spanish prose deterministically, which could damage otherwise-natural
 * text. Keep this symbol only so existing consumers do not break while they
 * remove obsolete post-processing calls.
 */
export function addressViewer(_req: ApiReq, out: ApiOut): ApiOut {
  return out;
}
