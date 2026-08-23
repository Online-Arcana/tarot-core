# Paid Spanish prose audit

This document records concrete defects found during local paid Spanish prose runs and the shared core behaviour added in response. It is a regression record, not a claim that automated checks replace human Spanish, tarot or cultural review.

## Current release evidence

The production quality path is now deterministic structural validation followed by isolated GPT-5.6 Luna low semantic audit, bounded Luna-medium atomic repair when needed, and Luna-low re-audit. Legacy contextual/regex helpers are not the paid final gate.

Recent paid evidence:

- A controlled `nahid/es-ES` cell on `fdd9b055bcff609d12bfbcb8a16e0993a3ba100f` completed **5/5 readings and 65/65 tasks** with zero reconstruction, emergency fallback, semantic unknown, querent-name narrator leaks, voice leaks, mapped-canonical leaks, future-result leaks or placeholder risk. One final Spanish agreement error survived (`el Caballero ... hablan`), treated as ordinary stochastic LLM residue rather than a reason for a phrase-specific rule.
- The bilingual seven-reader chain on `73caa5bd558d212671ca8d99974e309bbc8a13a9` completed **14/14 readings and 70/70 paid tasks** across English and Spanish with zero reconstruction, emergency fallback, semantic unknown, handover acceptance failure, mapped-canonical leakage, narrator-name leakage, voice leakage or placeholder risk. English had zero final findings. Spanish had one genuine actor-continuity finding in an Ngaru ritual.
- That Ngaru finding exposed a generic Spanish pro-drop boundary: after the querent is established as actor (`extraes`, `recibes`), an omitted-subject reader action (`Aparta ... traza ...`) can be misread as an imperative to the querent. The generation contract now requires the new actor to be explicitly re-established whenever narration switches between querent and reader before pro-drop resumes. This was fixed generically, not with a Ngaru-specific regex.

The chain did not need to be repurchased after that prompt-level fix. Future paid runs exercise the rule naturally.

## What the paid runs changed

The paid runs exposed several architecture-level issues over time:

- deterministic/regex language heuristics produced false positives for Spanish gender, direct address, actor attribution and ritual continuity;
- narrator proper-name leakage (`Alex`) needed an exact deterministic boundary rather than a semantic guess;
- narrator prose legitimately addresses the viewer with `tú/te/tu`, while describing the reader in third person;
- suggestion chips are querent-first-person questions, not reader dialogue;
- semantic repair needed a bounded second attempt for concrete leftovers without becoming a loop;
- canonical handover state must never be rewritten by a semantic reviewer;
- mapped `return` audit context must use the same public result identities as mapped generation, otherwise the auditor can incorrectly demand canonical tarot names;
- sequential Spanish narrator prose must re-establish the actor after a querent↔reader subject switch before using pro-drop again;
- paid harnesses must count normal generation/audit/repair/re-audit calls separately from true transport/parse retries;
- report aggregation must not mix legacy regex-era schemas with current semantic-final reports.

The fixes are shared across readers. Reader-specific facts and choreography remain data-driven.

## Querent grammatical gender

`gender` is optional and backward-compatible. Supported values are `woman`, `man` and `nonbinary`.

For Spanish, a missing value and `nonbinary` both use natural gender-neutral phrasing. Generation must not infer agreement from a name or surrounding context and must avoid artificial `@`, `x`, slash, parenthetical or forced `-e` forms. Natural circumlocution is preferred.

Legacy deterministic gender sensors remain regression tools, but production semantic correctness is decided by Luna in full sentence/context rather than promoting noun endings or isolated morphology into facts.

User-authored wording remains opaque. If a person writes a gendered form in their own question, the core preserves it when that exact question is carried through a handover.

## Narrator direct address and actor continuity

Narrator prose is external scene narration **about the reader**, but it may address the querent naturally in second person. Spanish forms such as `tú`, `te`, `ti`, `contigo`, `tu` and `tus` are valid in narrator fields when they refer to the viewer.

The querent proper name is different: an exact configured querent name in narrator-only prose is a deterministic production violation, because visible narration should use natural direct address rather than `Alex observa...`.

Spanish pro-drop is valid while the actor remains clear. When narration switches between querent and reader, the new actor must be explicitly established first. For example:

```text
Cuando extraes la concha, la recibes con la mano cerrada.
Ngaru aparta la bolsa y traza alrededor de ella una ruta amplia...
```

is unambiguous, whereas an immediate bare `Aparta ... traza ...` after second-person actions can be read as an imperative.

## Handover and return grounding

Handover summary/questions/conclusions/cards/unresolved are canonical conversation state, not free prose. Facts are restricted to transcript-grounded statements. After deterministic validation, handover skips semantic review entirely so exact accepted state cannot be mutated by Luna.

Questions stay in question fields and exact user questions are excluded from `facts`. Receiving readers get accepted handover context; mapped readers receive the public-medium translation rather than canonical tarot internals.

Mapped `return` generation and semantic audit now share the same public handover translation. The auditor therefore sees identities such as Nahid's public smoke forms rather than canonical tarot card names and cannot "repair" mapped prose back into tarot terminology.

## Semantic correction

Production correction is language-agnostic and semantic:

1. Luna low audits the complete visible candidate conservatively.
2. Findings contain an exact field path, code, evidence substring and objective expected correction.
3. Luna medium receives the untouched original prose plus those findings and canonical context.
4. Only exact-span surgical patches are permitted; whole-field semantic rewrites are rejected.
5. The patched candidate must remain deterministically safe.
6. Luna low re-audits it.
7. One bounded second medium → low pass is allowed for concrete leftovers.
8. If a repair regresses deterministic safety or fails to improve the candidate, the safer usable candidate is retained.

No deterministic audience transformer rewrites model prose. Older Spanish-specific narrow-correction helpers remain compatibility/regression surfaces only.

## Ritual continuity

Ritual prompts preserve physical sequencing across positions. Canonical media data owns which participant performs the mapped physical action.

Semantic Luna evaluates meaning-dependent continuity such as whether an action is actually repeated, negated, remembered or hypothetical. Deterministic code retains exact canonical state and structural boundaries it can prove.

The Ngaru/Amaru querent-operated draw contracts remain compatible with natural Spanish pro-drop. Reader-operated media remain reader-owned. A semantic repair must restore the actor established by canonical context rather than reassigning reader choreography to the querent merely to make a sentence grammatical.

## Harness and human review

Paid workers now use the deterministic production audit plus `semantic_final_issue:*` / `semantic_final:unknown` diagnostics from `runModelSession()` as their final quality contract. Normal semantic calls are excluded from `retryRequests`, which represents actual additional transport/parse attempts.

Full-matrix aggregation accepts only current schema-v3 cell reports. Legacy report schemas are rejected rather than mixed into current statistics.

Human review remains mandatory after deterministic CI and paid model validation. Automated checks can establish structure, state ownership and known leakage boundaries; they cannot certify nuanced cultural accuracy, reader personality or prose taste.
