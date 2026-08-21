import selenaOpening from "./reserve-corpus-data.json" with { type: "json" };
import selenaContinuation from "./reserve/selena-ritual-continuation.json" with { type: "json" };
import ngaruRitual from "./reserve/ngaru-ritual.json" with { type: "json" };
import {
  findReserveBucket,
  validateReserveCorpus,
  type ReserveCorpus,
  type ReserveLookupKey,
} from "./reserve-corpus.js";

const CORPUS = {
  version: 1,
  buckets: [
    ...(selenaOpening as unknown as ReserveCorpus).buckets,
    ...(selenaContinuation as unknown as ReserveCorpus).buckets,
    ...(ngaruRitual as unknown as ReserveCorpus).buckets,
  ],
} as const satisfies ReserveCorpus;
const ERRORS = validateReserveCorpus(CORPUS);
if (ERRORS.length) {
  throw new Error(`deterministic reserve corpus is invalid: ${ERRORS.join("; ")}`);
}

export function reserveCorpus(): ReserveCorpus {
  return CORPUS;
}

export function reserveCorpusBucket(lookup: ReserveLookupKey) {
  return findReserveBucket(CORPUS, lookup);
}

export function reserveCorpusCoverage(): {
  readonly buckets: number;
  readonly variants: number;
} {
  return {
    buckets: CORPUS.buckets.length,
    variants: CORPUS.buckets.reduce((total, bucket) => total + bucket.variants.length, 0),
  };
}
