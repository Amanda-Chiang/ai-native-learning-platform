# Benchmark Source Material

Real course artifacts used to hand-build the Phase 0 benchmark corpus
(`docs/implementation-roadmap.md` Phase 0; `specs/001-course-domain-schemas/`).

**Source**: MIT OpenCourseWare, *6.006 Introduction to Algorithms*, Spring
2020, taught by Erik Demaine, Jason Ku, and Justin Solomon.
Course page: https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/

**License**: MIT OpenCourseWare content is licensed under a Creative
Commons Attribution-NonCommercial-ShareAlike 4.0 International License
unless otherwise noted (https://ocw.mit.edu/terms). Every file below
carries an attribution header. This use is non-commercial (a personal,
unpublished engineering benchmark corpus) and educational — consistent
with the CC BY-NC-SA terms. These notes are condensed, faithful summaries
of the original lecture notes/problem sets, not verbatim reproductions of
the full PDFs.

**Why this course**: it's freely and openly licensed (no scraping of
paywalled or ambiguously-licensed content), and lectures 2/6/8/9/10 map
directly onto the PRD's own worked demo domain (§28: BFS, FIFO queues,
graph traversal, trees, heaps) — the same concepts `docs/technical-prd.md`
already uses as its running example.

## Selected artifacts

| File | Original | Type | Unit |
|---|---|---|---|
| `lecture-02-data-structures.md` | Lecture 2: Data Structures | lecture | Foundations |
| `lecture-06-binary-trees-1.md` | Lecture 6: Binary Trees, Part 1 | lecture | Trees |
| `lecture-08-binary-heaps.md` | Lecture 8: Binary Heaps | lecture | Trees |
| `lecture-09-breadth-first-search.md` | Lecture 9: Breadth-First Search | lecture | Graphs |
| `lecture-10-depth-first-search.md` | Lecture 10: Depth-First Search | lecture | Graphs |
| `problem-set-3.md` | Problem Set 3 (hashing, sorting) | homework | Foundations |
| `problem-set-4.md` | Problem Set 4 (trees, heaps, design) | homework | Trees |

These 5 lectures + 2 problem sets are the `benchmark/dsa-course/artifacts.json`
source set required by spec.md FR-008.
