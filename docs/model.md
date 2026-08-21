# Model orchestration

The model layer converts a validated, core-canonicalised `ApiReq` into the unchanged `ApiOut` contract used by Online Arcana. Generation is bilingual, reader-aware and medium-aware. Card, spread, reader, ritual and reveal facts come from core-owned canonical data rather than client prose.

## Pipeline

```text
canonical request
    -> build prompt from reader + querent + task + ritual/reveal state
    -> strict structured-output generation
    -> deterministic preparation of facts/state only
    -> structural/base audit
    -> if a local finding is repairable:
         atomic LLM review of only the affected prose field(s)
         -> merge exact patch into original candidate
         -> prepare + audit again
    -> otherwise one bounded broader corrective model attempt
    -> if any usable LLM candidate exists:
         deliver the best model candidate
       else, when guaranteeOutput is enabled:
         deterministic contextual availability reserve
    -> attach public mapped-media presentation data
    -> request-context audit of otherwise-valid model prose
    -> if a contextual-only finding is repairable:
         atomic LLM review with compiled audit context + finding metadata
         -> merge exact patch
         -> contextual re-audit
    -> unchanged ApiOut contract
```

The important ordering rule is that **quality failures do not route usable model prose to deterministic prose**. Deterministic reconstruction is an availability reserve for cases where generation does not yield a usable parsed candidate. A minor voice, gender, identity or ritual-actor defect is handled by model correction while preserving the original response.

`prepareModelOutDetailed()` canonicalises facts and state the core already knows. It may repair deterministic reveal/handover state, but it does not rewrite narrator perspective, audience, grammar or style. Public mapped `media`/`medium` presentation metadata is attached only after the prose candidate has passed the relevant audit stage.

`finaliseModelOutDetailed()` remains the compatibility helper for direct callers: it performs preparation and presentation attachment. Preparation and public finalisation are idempotent.

## Model lanes

The current default lanes all use GPT-5.6 Luna:

```text
ordinary short tasks: gpt-5.6-luna
ritual:               gpt-5.6-luna
read / chat:           gpt-5.6-luna
```

`DEFAULT_MODEL_TIERS` still keeps primary and escalation roles independently configurable. Normal generation and atomic review use cheap reasoning effort; the bounded broader corrective attempt uses medium effort. Callers may override individual model roles through `ModelCfg.models` without changing task classification.

The structured-output parse/shape retry budget defaults to one retry when callers omit `retries`.

## Language and voice contract

English visible prose is requested as natural British English. Spanish visible prose is requested as natural Spain Spanish with tuteo and normal subject omission when the conjugation already establishes the actor.

Narrator and reader voices have different ownership:

- narrator fields are external third-person scene prose describing the reader, movement, setting and ritual
- narrator fields address the person receiving the reading naturally in second person where grammar requires it
- reader-dialogue fields are the selected reader speaking directly and may use first person for self-reference
- a reader is established by configured identity when needed, then natural discourse and Spanish pro-drop are allowed
- narrator prose never uses the querent's proper name as a substitute for second-person immersion
- generic labels such as `the reader`, `the querent`, `el lector`, `la lectora` or `la persona consultante` are not substitutes for the configured voices
- structured identity notation and private prompt metadata must never become visible prose

Mapped readers receive the same language and voice contract. Their public medium augments the prompt rather than replacing those rules.

There is **no deterministic audience transformer** in the production path. The legacy `addressViewer()` symbol remains only as a deprecated identity compatibility shim and returns prose unchanged. Perspective and grammar are authored by the model, audited, and corrected narrowly when necessary.

## Immutable request audit context

The contextual auditor compiles an immutable `AuditContext` for every request. It contains the state that determines what is valid for this specific reading, including:

- language and task
- configured reader identity, grammatical gender/pronouns, voice, manner and limits
- current querent name and optional grammatical gender
- field ownership such as narrator, reader dialogue, handover state or title
- mapped ritual mode, actor, action, verbs, objects, grounding and medium
- opening versus continuation phase
- prior ritual theatre
- current spread position
- revealed and still-hidden results
- conversation/history count

The same surface wording can therefore receive different findings under different requests. A second-person physical action can be correct for Ngaru or Amaru because their current ritual contract assigns the draw to the querent, while a second-person action on Brennos's shield can be suspicious because Brennos owns that medium action.

No global mutable audit state is used. Each request builds its own context, which keeps concurrent readings isolated.

## Sensors versus semantic verdicts

Regex, tokenisation and lexical matching are allowed as bounded **sensors**. They may observe evidence such as:

- a configured proper name appearing in a narrator-owned field
- a generic reader/querent label
- a first-person narrator marker
- a known Spanish case or language defect
- a second-person physical verb applied locally to a mapped medium object
- a contract verb/object or grounding phrase
- operational/internal terminology
- canonical tarot terminology in mapped public prose

A sensor observation is not, by itself, semantic truth. The contextual layer combines evidence with `AuditContext` before creating a request-specific finding.

For example, the ritual actor sensor requires a plausible local verb-to-medium-object relation. It does not treat an unrelated movement by the querent and a reader-owned object elsewhere in the field as one action. The resulting observation is then checked against the current ritual actor contract.

## Structured contextual findings

Contextual findings retain the legacy `AuditIssue` fields and may additionally carry machine-readable repair metadata:

```ts
interface ContextualAuditIssue extends AuditIssue {
  evidence?: string;
  expected?: string;
  repairScope?: "local";
}
```

A finding therefore says what was observed and which current invariant appears to be violated, without dictating the replacement prose.

A representative finding is conceptually:

```json
{
  "code": "querent_name_narrator",
  "path": "ritual.opening",
  "evidence": "Alex",
  "expected": "address the current querent naturally in second person",
  "repairScope": "local"
}
```

The auditor does **not** decide that a particular name must mechanically become `you`, `your`, `tú`, `te`, `ti`, `contigo`, `tu` or a dropped subject. The reviewer sees the original sentence and current context and chooses the smallest grammatical correction.

## Atomic LLM revision

`finalProofreadShape()` constrains prose correction to exact edits. For ordinary corrections, each edit identifies one short exact `before` span and a minimal `after` replacement. Oversized or whole-field rewrites are rejected.

For audit-triggered review:

1. only reviewable local findings are selected
2. only affected prose paths are editable
3. the reviewer receives the original field text
4. it receives canonical generation context
5. contextual-only review also receives `<compiled_audit_context>` and structured `<compiled_audit_findings>`
6. the reviewer may return no edits when a heuristic finding is a false positive
7. any returned patch is merged into the original candidate
8. unrelated fields remain unchanged
9. the revised candidate is audited again
10. an invalid or over-broad contextual revision is rejected and the original usable LLM candidate is preserved

The reviewer is explicitly a reviser, not a second author. It must preserve meaning, facts, result state/orientation, chronology, scene state, reader personality, imagery, emphasis and all unrelated wording.

The older Spanish-specific narrow-correction helpers remain available for compatibility and regression coverage, but the production review selector is language-agnostic.

## Ritual participation

Mapped ritual semantics are owned by `src/readers/media/rituals.json` and exposed through the media runtime. The registry supplies actor, action, language-specific verbs, objects, grounding and ritual mode.

Examples:

- Ngaru: querent-operated `draw-from-container`
- Amaru: querent-operated `draw-from-container`
- Brennos: reader-operated `reader-shake-release`
- Yejide: reader-operated cast
- Ame: reader-operated single cast
- Nahid: reader-operated observation

Natural Spanish pro-drop is part of the authored contract. Phrases such as `Introduces la mano sin mirar y extraes una concha` do not require an explicit `tú` to establish the querent as actor.

The contextual ritual auditor currently covers local findings such as missing required participation, apparent invented querent participation in a reader-operated medium, repeated single-cast action during continuation and missing medium grounding. These findings are review signals tied to the current registry state, not universal grammar rules.

## Structural/base audit

The lower-level `model/audit` module remains responsible for structural and bounded language checks such as:

- required field, count, line and word constraints
- complete sentence endings
- direct-address evidence where the task requires it
- narrator/reader field ownership
- generic labels and obvious operational/internal prose
- mapped canonical-medium leakage
- duplicate/repetitive prose
- hidden/future result leakage
- exact handover cards/questions
- title/list bounds
- known language defects

The package-root `auditModelOut` is the canonical public auditor and points to the contextual audit layer. Direct imports from `model/audit` intentionally expose the lower-level base auditor for internal/compatibility use.

Some legacy mapped ritual checks still exist in the base module while migration finishes. New semantic actor decisions belong in the contextual layer and new tests should target the package-root/contextual auditor rather than extending those legacy regex rules.

## Recovery and fallbacks

When `guaranteeOutput` is false, a bounded failed model path produces `ModelOutputError`.

When `guaranteeOutput` is true:

- if parsed model candidates exist, the runner prefers the best usable LLM candidate after bounded repair attempts
- it does not replace prose merely because deterministic heuristics still dislike it
- if no usable parsed model candidate exists because generation/structured output is unavailable, the core may use deterministic contextual reconstruction
- legacy/bare/panic reserves exist only behind that availability path

`src/model/fallbacks.xml` is the authoritative shared fallback source. `scripts/generate-fallbacks.mjs` validates it and emits generated runtime data.

Mapped ritual choreography is owned by `src/readers/media/rituals.json`. `ritual-recovery.ts` selects authored ritual and atmosphere material from canonical data instead of creating reader choreography in TypeScript.

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

`auditErrors` is non-customer-facing observability data. It can include preparation, audit, review, delivery and availability-path diagnostics and must never be rendered as reading prose.

## Release gates

The normal CI path is deterministic and does not require an API key:

```text
npm run check
npm run check:live-harness
npm run build
npm run test
```

The deterministic release matrix covers all configured readers, both languages, all supported spreads and applicable task/state combinations. Paid live matrices are separate local release gates and require `OPENAI_API_KEY`; they preserve generated strings and provenance for human review.

A paid report is not cultural or prose approval by itself. Human review remains required before release.
