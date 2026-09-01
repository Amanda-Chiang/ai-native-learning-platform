# Evaluation Rubrics

Written pass/fail criteria for the ten evaluation areas named in PRD
§23.2, defined before any production extraction/generation/grading prompt
is written (spec.md User Story 3, FR-012). Each rubric is phrased
independently of any specific prompt or model choice — it describes what
*correct output* looks like, not how to produce it. `benchmark/dsa-course/`
(`concepts.json`, `edges.json`, `qa-pairs.json`, `edge-cases.json`) is the
reference corpus every rubric below scores against.

## Concept extraction

A pipeline's extracted concept **passes** when it can be matched to a
`concepts.json` entry such that:

- the canonical name (or a listed alias) refers to the same real-world
  idea a human reader of the source artifact would identify, and
- the extracted `sourceAnchors[].excerpt` is locatable in the cited
  artifact (verbatim or a faithful paraphrase a reviewer confirms), and
- the extracted concept is not a duplicate of one already extracted from
  the same artifact under a different surface name (see Concept
  deduplication, below).

**Fails** when: the concept is fabricated (no locatable grounding), is
too granular to be a distinct teachable idea (e.g. extracting "the letter
Q" as a concept from a hash-function example), or is too coarse to be
useful (e.g. extracting "Algorithms" as a single concept for an entire
lecture).

## Concept deduplication

**Passes** when two extractions of the same real concept under different
surface terminology (e.g. "BFS" vs "Breadth-First Search" — see
`edge-cases.json`'s `multiAliasConcept` case) are merged into one
`CourseConcept` with both names recorded as `aliases`/`canonicalName`,
not represented as two separate concept records.

**Fails** when: two genuinely distinct concepts are merged into one (a
false merge — e.g. collapsing "Max-Heap Property" and "Min-Heap Property"
into a single "Heap Property" concept loses a real distinction the course
material draws); or when the same concept is left duplicated under two
IDs after extraction.

## Relation classification

**Passes** when an extracted relationship's `relationType` matches what a
human reading the source would classify it as, using the seven standard
types (`prerequisite_for`, `part_of`, `mechanism_for`, `contrasts_with`,
`used_in`, `generalizes_to`, `example_of`) or `"other"` with a
`relationTypeNote` when none fit — see `edge-cases.json`'s
`nonStandardRelationType` case for a worked example of the latter.

**Fails** when: a relationship is force-fit into a standard type that
doesn't actually describe it (e.g. classifying an "other"-shaped
relationship as `mechanism_for` just to avoid using the escape hatch); or
when the direction of a directional relationship (e.g. `prerequisite_for`)
is reversed.

## Homework/course-style extraction

**Passes** when an extraction from a homework/practice artifact correctly
identifies: (a) which concepts/edges the problem exercises, (b) the
problem's approximate difficulty/assessment-type tier (retrieval,
mechanism, application, connection, or transfer — see `qa-pairs.json` for
worked examples of each tier), and (c) does **not** treat a completed
homework submission's correctness as strong mastery evidence by itself
(Constitution Principle III / PRD §11.5) — homework contributes to course
emphasis and style, not directly to `EvidenceEvent.evidenceType`
`"retrieval"`/`"application"`/`"transfer"` without independent
verification.

**Fails** when: the extraction conflates "homework was completed" with
"student has demonstrated mastery," or misses the assessment-type tier
entirely.

## Question correctness

**Passes** when a generated question's stated correct answer is verifiably
correct — for deterministically-checkable domains (code, data-structure
state, graph traversal), an independent checker confirms it; for
conceptual questions, the answer matches what the cited source material
actually supports (see `qa-pairs.json` entries' `answer` fields for the
expected level of grounded specificity, e.g. `qa-lecture-bfs-running-time`).

**Fails** when: the stated answer is wrong, is correct but unsupported by
the cited source anchor, or requires knowledge from outside the course
material for a question labeled as course-specific.

## Question ambiguity

**Passes** when a generated question has exactly one reasonable correct
answer given its stated constraints — no undefined terms, no missing
context a student would need to disambiguate.

**Fails** when a question could reasonably be answered two different ways
because it relies on an undefined metric or missing constraint — see
`qa-pairs.json`'s `qa-ps4-4-2-closer-to-ambiguous` entry (referenced in
`edge-cases.json`'s `ambiguousQuestion` case) for a worked example: asking
whether an array is "closer to" a max-heap or min-heap fails this rubric
because "closer to" is never defined in the course material.

## Source grounding

**Passes** when every course-specific claim (a question, an answer key, an
explanation, a relationship) carries at least one `sourceAnchors` entry
whose `excerpt` is a substring, or a close paraphrase a human reviewer can
confirm, of text actually present in the cited artifact — fail if the
excerpt cannot be located in the source. This is the single most
load-bearing rubric: Constitution Principle V and spec FR-007 both require
it.

**Fails** when: the `sourceAnchors` array is empty for a course-specific
claim; the cited `artifactId` doesn't exist (a dangling reference — see
`benchmark-corpus.test.ts`'s dangling-reference checks for the mechanical
version of this check); or the excerpt cannot actually be found in the
cited artifact.

## Text grading

**Passes** when a free-text/conceptual response is graded against a
structured rubric with required ideas, acceptable alternatives, and named
misconceptions (PRD §16.2) — not free-form model judgment — and the
grading result includes a `graderConfidence` score, with low-confidence
gradings flagged for a second pass rather than committed as high-confidence
evidence.

**Fails** when: grading is a bare correct/incorrect judgment with no
rubric trace; or a low-confidence grading is committed to `EvidenceEvent`
with no `graderConfidence` signal distinguishing it from a confident one.

## Visual-structure extraction

**Passes** when a parsed visual response (e.g. a drawn graph/tree, per PRD
§16.5) correctly extracts the structural elements (nodes, edges, labels,
order) a human would read from the same drawing, **or**, when parsing
confidence is low, triggers a confirmation step rather than silently
grading a possibly-misread answer (Constitution Principle IV).

**Fails** when: a low-confidence parse is graded as if it were
high-confidence; or a structurally correct drawing is marked wrong because
of a parsing error rather than a genuine content error. (This rubric has
no corpus example yet — visual assessment is Phase 6 of
`docs/implementation-roadmap.md`, not built as of this benchmark corpus;
it is written now so Phase 6 doesn't invent inconsistent criteria later.)

## Misconception detection

**Passes** when a genuine, repeated, confident incorrect response is
flagged as an `EvidenceEvent` with `evidenceType: "misconception"`, tied
to the specific concept(s) the error reveals confusion about — not just
marked "wrong" with no diagnostic signal.

**Fails** when: a single incorrect answer (which could be a slip, not a
misconception) is flagged as a misconception without a repetition/
confidence check; or when a real, repeated misconception pattern is missed
because grading only checks final-answer correctness and discards the
reasoning that would reveal the misconception.
