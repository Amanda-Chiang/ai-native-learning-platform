import type { CheckerDomain } from "./problem-setup.ts";

/**
 * One small Structured Outputs schema per checker domain, describing
 * ONLY that domain's claim field(s) -- never the whole checkerInput,
 * since the problem-setup fields are already known and shown to the
 * student separately (problem-setup.ts). Same bounded set of five
 * domains deterministic-grading already covers, not a per-subject/
 * per-concept schema (this project's checker domains are fixed by the
 * exact-checker mechanism itself, not by course content).
 */
export type ExtractionSchema = { name: string; strict: true; schema: object };

const TREE_NODE_SCHEMA = {
  $ref: "#/$defs/treeNode",
} as const;

const TREE_NODE_DEFS = {
  treeNode: {
    type: ["object", "null"],
    properties: {
      value: { type: "number" },
      left: { $ref: "#/$defs/treeNode" },
      right: { $ref: "#/$defs/treeNode" },
    },
    required: ["value", "left", "right"],
    additionalProperties: false,
  },
} as const;

export const EXTRACTION_SCHEMAS: Record<CheckerDomain, ExtractionSchema> = {
  "bfs-dfs": {
    name: "extracted_bfs_dfs_claim",
    strict: true,
    schema: {
      type: "object",
      properties: { claimedOrder: { type: "array", items: { type: "string" } } },
      required: ["claimedOrder"],
      additionalProperties: false,
    },
  },
  heap: {
    name: "extracted_heap_claim",
    strict: true,
    schema: {
      type: "object",
      properties: {
        claimedExtractedSequence: { type: "array", items: { type: "number" } },
        claimedFinalState: { type: "array", items: { type: "number" } },
      },
      required: ["claimedExtractedSequence", "claimedFinalState"],
      additionalProperties: false,
    },
  },
  "tree-traversal": {
    name: "extracted_tree_traversal_claim",
    strict: true,
    schema: {
      type: "object",
      properties: { claimedResult: { type: "array", items: { type: "number" } } },
      required: ["claimedResult"],
      additionalProperties: false,
    },
  },
  "tree-insertion": {
    name: "extracted_tree_insertion_claim",
    strict: true,
    schema: {
      type: "object",
      $defs: TREE_NODE_DEFS,
      properties: { claimedResultTree: TREE_NODE_SCHEMA },
      required: ["claimedResultTree"],
      additionalProperties: false,
    },
  },
  "topological-sort": {
    name: "extracted_topological_sort_claim",
    strict: true,
    schema: {
      type: "object",
      properties: { claimedOrder: { type: "array", items: { type: "string" } } },
      required: ["claimedOrder"],
      additionalProperties: false,
    },
  },
  "shortest-path": {
    name: "extracted_shortest_path_claim",
    strict: true,
    schema: {
      type: "object",
      properties: {
        claimedPath: { type: "array", items: { type: "string" } },
        claimedTotalDistance: { type: "number" },
      },
      required: ["claimedPath", "claimedTotalDistance"],
      additionalProperties: false,
    },
  },
};

const CONFIDENCE_HONESTY_INSTRUCTION =
  "Report your own honest confidence (0-1) that you read this correctly. Be strict: if the image is blank, shows no legible marking of the student's actual answer (only the rendered question itself), or the marks are too messy/overlapping to make out a clear order, your confidence MUST be low (below 0.3) -- do not report high confidence just because the image itself is clear if the student's answer within it isn't.";

export const EXTRACTION_PROMPT_BY_DOMAIN: Record<CheckerDomain, string> = {
  "bfs-dfs": `This image shows a student's hand-drawn traversal order over a graph. Identify the order in which nodes were visited, using the exact node labels shown in the image. ${CONFIDENCE_HONESTY_INSTRUCTION}`,
  heap: `This image shows a student's hand-drawn heap after a sequence of operations. Identify the sequence of values extracted (in order) and the final remaining heap state (as a flat array), using the exact values shown. ${CONFIDENCE_HONESTY_INSTRUCTION}`,
  "tree-traversal": `This image shows a student's hand-drawn traversal order over a binary tree. Identify the sequence of values in the order traversed, using the exact values shown. ${CONFIDENCE_HONESTY_INSTRUCTION}`,
  "tree-insertion": `This image shows a student's hand-drawn binary tree after inserting a value. Identify the resulting tree's exact structure (each node's value and its left/right children, or null where absent). ${CONFIDENCE_HONESTY_INSTRUCTION}`,
  "topological-sort": `This image shows a student's hand-drawn topological order over a directed graph. Identify the order, using the exact node labels shown in the image. ${CONFIDENCE_HONESTY_INSTRUCTION}`,
  "shortest-path": `This image shows a student's hand-drawn shortest path between two nodes in a weighted graph. Identify the sequence of nodes on the path and the total distance the student claims, using the exact node labels and weights shown. ${CONFIDENCE_HONESTY_INSTRUCTION}`,
};
