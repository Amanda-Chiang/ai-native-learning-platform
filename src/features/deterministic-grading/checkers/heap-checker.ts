/**
 * Pure heap checker (data-model.md). `checkHeapOperations` grades a
 * claimed operation-trace result; `checkHeapProperty` independently
 * validates a bare array against the min-/max-heap property with no
 * operation trace involved.
 *
 * A heap's array layout is not unique for a given set of values (two
 * correct implementations can sift-down differently and still both
 * satisfy the heap property) -- final state is compared as a multiset
 * of values, not exact array position, same property-over-exact-match
 * philosophy the other checkers use. The extracted-value sequence,
 * however, IS uniquely determined by value order (ties among equal
 * values don't matter since the values are the same), so that is
 * compared exactly.
 */

export type HeapType = "min" | "max";

export type HeapOperation = { kind: "insert"; value: number } | { kind: "extract" };

export type HeapCheckInput = {
  heapType: HeapType;
  operations: HeapOperation[];
  claimedExtractedSequence: number[];
  claimedFinalState: number[];
};

export type HeapCheckResult =
  | { outcome: "correct" }
  | { outcome: "incorrect"; expectedExtractedSequence: number[]; expectedFinalState: number[]; firstDivergence: string }
  | { outcome: "invalid_input"; reason: string };

function better(a: number, b: number, heapType: HeapType): boolean {
  return heapType === "min" ? a < b : a > b;
}

class ReferenceHeap {
  private items: number[] = [];
  private heapType: HeapType;

  constructor(heapType: HeapType) {
    this.heapType = heapType;
  }

  insert(value: number): void {
    this.items.push(value);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (better(this.items[i], this.items[parent], this.heapType)) {
        [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  extract(): number | null {
    if (this.items.length === 0) return null;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let bestIndex = i;
        if (left < this.items.length && better(this.items[left], this.items[bestIndex], this.heapType)) bestIndex = left;
        if (right < this.items.length && better(this.items[right], this.items[bestIndex], this.heapType)) bestIndex = right;
        if (bestIndex === i) break;
        [this.items[i], this.items[bestIndex]] = [this.items[bestIndex], this.items[i]];
        i = bestIndex;
      }
    }
    return top;
  }

  get state(): number[] {
    return [...this.items];
  }
}

function sortedValues(values: number[], heapType: HeapType): number[] {
  return [...values].sort((a, b) => (heapType === "min" ? a - b : b - a));
}

export function checkHeapOperations(input: HeapCheckInput): HeapCheckResult {
  const heap = new ReferenceHeap(input.heapType);
  const expectedExtractedSequence: number[] = [];

  for (const op of input.operations) {
    if (op.kind === "insert") {
      heap.insert(op.value);
    } else {
      const extracted = heap.extract();
      if (extracted === null) {
        return { outcome: "invalid_input", reason: "extract on an empty heap." };
      }
      expectedExtractedSequence.push(extracted);
    }
  }

  const expectedFinalState = heap.state;

  const extractedMatches =
    input.claimedExtractedSequence.length === expectedExtractedSequence.length &&
    input.claimedExtractedSequence.every((v, i) => v === expectedExtractedSequence[i]);

  const finalStateMatches =
    JSON.stringify(sortedValues(input.claimedFinalState, input.heapType)) ===
    JSON.stringify(sortedValues(expectedFinalState, input.heapType));

  if (extractedMatches && finalStateMatches) {
    return { outcome: "correct" };
  }

  return {
    outcome: "incorrect",
    expectedExtractedSequence,
    expectedFinalState,
    firstDivergence: !extractedMatches ? "extracted sequence" : "final heap state",
  };
}

export function checkHeapProperty(
  heapType: HeapType,
  array: number[],
): { valid: true } | { valid: false; violatingIndex: number } {
  for (let i = 0; i < array.length; i++) {
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    if (left < array.length && better(array[left], array[i], heapType)) {
      return { valid: false, violatingIndex: left };
    }
    if (right < array.length && better(array[right], array[i], heapType)) {
      return { valid: false, violatingIndex: right };
    }
  }
  return { valid: true };
}
