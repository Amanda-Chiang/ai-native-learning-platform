/**
 * Points a course-specific claim (concept, edge, assessment) back to the
 * artifact it was grounded in. Required wherever Constitution Principle V
 * (course-grounded, provenance-preserving claims) applies.
 */
export type SourceAnchor = {
  /** References an entry in benchmark/dsa-course/artifacts.json (or, post-MVP, an ingested artifact row). */
  artifactId: string;
  /** Human-readable pointer into that artifact, e.g. "slide 14", "problem 3". */
  locator: string;
  /** Short quoted or paraphrased grounding text. */
  excerpt: string;
};
