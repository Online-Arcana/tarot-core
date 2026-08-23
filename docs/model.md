# Model orchestration

The model layer converts a validated, core-canonicalised `ApiReq` into the unchanged `ApiOut` contract used by Online Arcana. Generation is bilingual, reader-aware and medium-aware. Card, spread, reader, ritual and reveal facts come from core-owned canonical data rather than client prose.

## Production pipeline

For ordinary free model prose, the canonical production flow is:

```text
canonical request
    -> build prompt from reader + querent + task + ritual/reveal state
    -> strict structured-output generation
    -> deterministic preparation/canonicalisation of known facts and state
    -> deterministic production audit
    -> if deterministic correction is required and safely repairable:
         bounded model correction
         -> deterministic preparation + audit again
    -> if no usable parsed model candidate exists and guaranteeOutput is enabled:
         deterministic availability reserve
    -> otherwise keep the usable LLM candidate
    -> GPT-5.6 Luna low semantic audit (isolated, conversation:false)
         -> pass: preserve the candidate byte-for-byte
         -> findings: send untouched candidate + exact findings + canonical context
              to GPT-5.6 Luna medium atomic repair
              -> deterministic safety audit of patched candidate
              -> GPT-5.6 Luna low re-audit
              -> if concrete findings remain after a safe first patch:
                   one bounded second Luna-medium atomic repair
                   -> deterministic safety audit
                   -> one final Luna-low re-audit
              -> stop; never loop
    -> attach/retain public mapped-media presentation data
    -> unchanged ApiOut contract
```

The low semantic auditor **never edits**. Luna medium is a reviser, not a second author: it may only apply exact-span surgical patches. Whole-field semantic rewrites are rejected.

The important availability rule is that **quality findings do not route usable model prose to deterministic prose**. Deterministic reconstruction is an availability reserve for cases where generation fails to produce a usable parsed candidate. If semantic infrastructure itself fails, usable model prose is preserved and observability records `semantic_final:unknown`.

Canonical handover state is the exception to the semantic path. Handover summary/questions/conclusions/cards/unresolved are rebuilt from canonical conversation state, while facts are transcript-grounded. After deterministic validation, handover skips Luna semantic review so a reviewer can never mutate accepted state such as exact result identity/orientation.

`prepareModelOutDetailed()` canonicalises facts and state the core already knows. It does not mechanically rewrite narrator perspective, audience, grammar or style.

`finaliseModelOutDetailed()` remains the compatibility helper for direct callers and is idempotent.

## Model lanes

The default generation lanes use GPT-5.6 Luna. Semantic audit and repair are fixed separately:

```text
generation:                gpt-5.6-luna (task-appropriate cheap effort)
semantic correctness audit: gpt-5.6-luna, low
semantic atomic repair:     gpt-5.6-luna, medium
semantic re-audit:          gpt-5.6-luna, low
```

Generation, semantic audit and semantic repair use separate `OpenAISchema` instances and semantic calls use `conversation:false`, preventing mutable schema/conversation contamination.

`DEFAULT_MODEL_TIERS` keeps primary and escalation generation roles independently configurable. The structured-output parse/shape retry budget defaults to one retry when callers omit `retries`.

## Language and voice contract

English visible prose is natural British English. Spanish visible prose is natural Spain Spanish with tuteo and normal pro-drop when the actor remains unambiguous.

Narrator and reader voices have distinct ownership:

- narrator fields are external scene prose describing the selected reader in third person
- narrator fields may address the querent/viewer naturally in second person (`you/your`, `tú/te/ti/contigo/tu/tus`)
- reader-dialogue fields are the selected reader speaking directly and may use first person for self-reference
- suggestion chips are `querent_question` fields: editable questions written in the querent's own first-person voice
- narrator prose never substitutes the querent's proper name for direct viewer address
- generic labels such as `the reader`, `the querent`, `el lector`, `la lectora` or `la persona consultante` are not substitutes for configured voices
- structured identity notation and private prompt metadata must never become visible prose

Spanish pro-drop has an actor-switch boundary: omission is safe only while the actor stays unambiguous. If narration switches between querent and reader, the new actor must be explicitly re-established before omission resumes. This prevents a third-person reader action after second-person querent action from being misread as an imperative.

Mapped readers receive the same language and voice contract. Their public medium augments rather than replaces those rules.

There is **no deterministic audience transformer** in the production path. The deprecated `addressViewer()` compatibility symbol returns prose unchanged.

## Deterministic production audit

`src/model/production-audit.ts` is the production synchronous audit boundary. The package-root `auditModelOut` points to this deterministic-only auditor.

It owns facts that code can establish objectively, including structural contracts and exact lexical/private-boundary violations. Examples include an exact querent proper name in narrator-only prose, private/internal references and structural output faults.

It deliberately does **not** decide semantic Spanish gender/person, grammatical actor attribution, naturalness, negation meaning, ritual continuity meaning, reader voice semantics or other contextual judgements that previously produced regex false positives.

The lower-level/legacy audit modules and `contextualAuditModelOut` remain explicit compatibility and sensor surfaces. They are useful for regression tests, but they are not a second production semantic authority and paid harnesses must not use them as final gates.

## Semantic audit context

`src/model/semantic-audit.ts` builds a fresh request-specific context for Luna low. It includes:

- language and task
- configured reader identity and voice
- querent name and optional grammatical gender
- explicit field roles (`narrator`, `reader_dialogue`, `querent_question`, etc.)
- mapped ritual phase, actor, action, medium and grounding
- prior ritual theatre and current position
- revealed and still-hidden **public** result identities
- exact conversation/handover context relevant to the task

Mapped result identity must be the same identity generation sees. For mapped `return`, semantic context is derived through the same public handover translation used by generation; Luna must never "correct" Nahid, Amaru or another mapped reader back into canonical tarot names.

The auditor is instructed to be conservative: valid alternative wording is not a defect, uncertainty should pass, and Spanish tokens must be interpreted in the complete sentence rather than through isolated morphological guesses.

## Semantic findings

A semantic finding is structured and local:

```ts
type SemanticFinding = {
  path: string;
  code:
    | "grammar"
    | "naturalness"
    | "direct_address"
    | "voice"
    | "querent_gender"
    | "reader_identity"
    | "actor"
    | "ritual_continuity"
    | "medium_grounding"
    | "repetition"
    | "result_reference"
    | "semantic_consistency"
    | "other";
  evidence: string;   // short exact substring from the field
  expected: string;   // objective correction requirement, not replacement prose
};
```

The finding identifies the suspected defect. It does not author replacement prose.

## Atomic semantic revision

`finalProofreadShape()` constrains corrections to exact edits. Each ordinary edit identifies one short exact `before` span and a minimal `after` replacement. Oversized, overlapping or whole-field rewrites are rejected.

For semantic repair:

1. Luna medium receives the untouched candidate, canonical generation context and exact Luna-low findings.
2. It reviews every finding independently; one false positive does not justify ignoring the rest.
3. Confirmed findings receive the smallest exact-span patch.
4. Unrelated fields remain byte-for-byte unchanged.
5. The patched candidate must still pass deterministic production safety checks.
6. Luna low re-audits the patched result using a fresh isolated schema.
7. If concrete findings remain, one bounded second medium → low pass is allowed.
8. If a later patch is unsafe or fails to improve the candidate, the safer earlier usable revision/original is preserved.
9. The pipeline stops after the bounded retry; there is no semantic loop.

The repair prompt also owns generic subject/actor correction: when fixing an actor switch it must restore the actor established by canonical ritual context and update dependent agreement, rather than reassigning reader-owned choreography to the querent.

## Ritual participation

Mapped ritual semantics are owned by `src/readers/media/rituals.json` and exposed through the media runtime. The registry supplies actor, action, language-specific verbs, objects, grounding and ritual mode.

Examples:

- Ngaru: querent-operated `draw-from-container`
- Amaru: querent-operated `draw-from-container`
- Brennos: reader-operated `reader-shake-release`
- Yejide: reader-operated cast
- Ame: reader-operated single cast
- Nahid: reader-operated observation

Natural Spanish pro-drop is valid when actor continuity is clear. A phrase such as `Introduces la mano sin mirar y extraes una concha` establishes the querent naturally without explicit `tú`. If the following action returns to Ngaru, generation should re-establish `Ngaru` (or another unambiguous reader reference) before omitting the subject again.

Semantic Luna owns meaning-dependent actor and ritual-continuity judgements. Deterministic code continues to own canonical participation/state data and structural impossibilities it can prove exactly.

## Recovery and availability reserve

When `guaranteeOutput` is false, a bounded failed model path produces `ModelOutputError`.

When `guaranteeOutput` is true:

- if parsed model candidates exist, the runner prefers the best usable LLM candidate after bounded correction/semantic repair
- usable model prose is not replaced merely because a quality finding remains
- if no usable parsed model candidate exists because generation/structured output is unavailable, deterministic reconstruction may be used
- legacy/bare/panic reserve paths remain availability-only

`src/model/fallbacks.xml` is the authoritative shared fallback source. `scripts/generate-fallbacks.mjs` validates it and emits generated runtime data.

Mapped ritual choreography is owned by canonical media data. `ritual-recovery.ts` selects authored ritual/atmosphere material instead of creating reader choreography ad hoc in shared TypeScript.

## Result provenance

`runModelSession` reports how a result was obtained:

```ts
type ModelResult = {
  out: ApiOut;
  source: "primary" | "escalation" | "reconstructed";
  primaryModel: string;
  escalationModel: string;
  auditErrors: readonly string[];
  sessionKey?: string;
};
```

`auditErrors` is non-customer-facing observability data. Semantic diagnostics include initial pass/findings, repair edit counts, re-audit results, bounded retry results, `semantic_final:pass`, `semantic_final:unknown` and exact `semantic_final_issue:*` entries for surviving findings.

## Paid/live reporting

Paid workers use the same production boundary as `runModelSession`:

- deterministic `productionAuditModelOut` for objective final checks
- the runner's `semantic_final_issue:*` diagnostics for surviving semantic findings
- `semantic_final:unknown` as an explicit hard failure in release reporting
- bounded semantic generation/audit/repair/re-audit calls excluded from `retryRequests`
- `retryRequests` reserved for actual extra transport/parse request attempts

The single-cell matrix uses schema-v3 reports. Full aggregation refuses legacy report schemas so old regex-era counters cannot silently mix with current semantic-final metrics.

The chained smoke directly emits production-accounted summaries for seven mapped readers across accepted handovers; its wrapper also retains defensive provenance/normalisation logic for older saved chain artefacts.

## Release gates

The normal CI path is deterministic and does not require an API key:

```text
npm run check
npm run check:live-harness
npm run build
npm run test
```

The deterministic release matrix covers all configured readers, both languages, all supported spreads and applicable task/state combinations.

Paid live validation is separate. The latest targeted validation strategy uses single reader/language cells to investigate regressions, followed by the bilingual seven-reader chained smoke. Automated paid success remains necessary but not sufficient for cultural/persona approval; human review of visible prose is still required before release.
