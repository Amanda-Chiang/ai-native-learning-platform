# Problem Set 3

> Source: MIT OpenCourseWare, 6.006 Introduction to Algorithms, Spring 2020
> (Erik Demaine, Jason Ku, Justin Solomon). Condensed from the original
> problem set PDF (questions, paraphrased from the published solutions for
> accurate scope). License: CC BY-NC-SA 4.0 (https://ocw.mit.edu/terms).
> See `sources/README.md` for full attribution.

Covers material from Lecture 2 (Data Structures) through Lecture 5
(hashing/sorting) — course emphasis on hash tables and sorting.

## Problem 3-1: Hash Practice [5 points]

(a) Insert integer keys into a size-7 hash table using
`h(k) = (10k + 4) mod 7`, with collisions resolved by chaining
(linked list per slot). Draw the resulting table.
(b) Given a two-stage hash function `h(k) = ((10k + 4) mod c) mod 7` for
positive integer `c`, find the smallest `c` producing zero collisions
for a given key set.

*Tests*: direct application of the hash-table-with-chaining concept and
hash function evaluation from Lecture 4 (Hashing).

## Problem 3-2: Dorm Hashing [15 points]

Given a family of candidate hash functions (three variants: a
multiplicative-shift family, a "leading bits" family, and the **universal
hash family** from Lecture 4), determine for each whether two specific keys
can be *forced* to collide by an adversary who chooses IDs before the hash
function is drawn, or whether the family bounds collision probability
(as the universal family provably does, at ≤ 1/n).

*Tests*: understanding of what makes a hash family "universal" and why
that property matters for adversarial inputs — a mechanism-level question
about hashing, not just plugging into a formula.

## Problem 3-3: Sorting under different key models [20 points]

Given several sorting scenarios (fixed-length ASCII identifiers,
bounded-range integer ages, bounded-precision rational thicknesses, and
comparison-only ordering via a black-box comparator), choose and justify
the asymptotically fastest correct sorting algorithm for each:
radix sort, counting sort, radix sort again (rational values scaled to
integers), and comparison-based merge sort (Θ(n log n), optimal when only
comparisons are available) respectively.

*Tests*: connection/transfer-level understanding — recognizing which
sorting algorithm's *preconditions* (bounded integer range, fixed-length
keys, comparison-only access) match a given scenario, not just reciting
each algorithm's complexity.

## Problem 3-4: Pushing Paper [20 points]

Given an array of `n` boxes each holding a unique positive integer number
of reams, and a target `r`, determine whether a "close" pair (indices
within `n/10` of each other) sums to `r`.

(a) An expected-`O(n)`-time algorithm using a hash table mapping ream
counts to box indices for `O(1)` expected lookups.
(b) A worst-case `O(n)`-time algorithm (no expected-case hashing) for the
special case `r < n²`, using bounded-range radix sort followed by a
two-pointer sweep — a real, deterministic algorithm (no hash table),
useful for the assessment-pipeline's deterministic-checker examples.

*Tests*: combining a Set/hash structure (or radix sort) with an auxiliary
geometric constraint (index closeness) — a two-concept connection problem.

## Problem 3-5: Anagram Archaeology [40 points]

Given strings `A` and `B`, build a data structure in `O(|A|)` time
supporting anagram-substring-count queries against any length-`k` string
`B` in `O(k)` time, using a rolling 26-entry letter-frequency table (updated
in O(1) time per character as a sliding window moves) plus a hash table
keyed by frequency-table tuples. Includes a full Python implementation.

*Tests*: a genuinely course-style "advanced" problem combining a sliding
window, a canonicalization trick (frequency tables as hashable keys), and
a hash table — good source for a `transfer`-tier assessment example.
