export type IslandShape = {
  /** Stable forever. A course row stores this entry's INDEX, so an id
   *  is here to make an accidental reorder visible in a test diff. */
  id: string;
  /** SVG path data, drawn in ISLAND_VIEWBOX's coordinate space. */
  path: string;
};

export const ISLAND_VIEWBOX = "0 0 100 100";

/**
 * PLACEHOLDER ART, DELIBERATELY UNFINISHED.
 *
 * These are plain uniform blob outlines. They are not meant to look
 * like the final islands, and they must not be prettied up into
 * something that does: per this project's no-silent-placeholders rule,
 * a placeholder that looks finished is indistinguishable from real
 * work, and nobody would know art was still owed. A commissioned set
 * drops in here later at the same indices.
 *
 * APPEND-ONLY. A course stores its shape INDEX once, at creation, and
 * that index is never recomputed -- so entry N must mean the same
 * shape forever. Add new shapes at the end. Never reorder, never
 * remove, never re-point an existing entry. `island-shapes.test.ts`
 * fails if you do.
 */
export const ISLAND_SHAPES: readonly IslandShape[] = [
  { id: "blob-01", path: "M50 8 C72 8 92 26 92 50 C92 74 72 92 50 92 C28 92 8 74 8 50 C8 26 28 8 50 8 Z" },
  { id: "blob-02", path: "M52 10 C78 12 90 30 88 54 C86 78 66 92 44 90 C22 88 10 68 12 46 C14 24 30 8 52 10 Z" },
  { id: "blob-03", path: "M48 9 C70 6 90 24 91 46 C92 70 74 90 50 91 C26 92 9 74 9 50 C9 28 26 12 48 9 Z" },
  { id: "blob-04", path: "M55 11 C76 14 91 32 89 55 C87 76 68 91 46 89 C24 87 9 67 11 45 C13 25 34 8 55 11 Z" },
  { id: "blob-05", path: "M50 10 C74 10 90 28 90 52 C90 74 70 90 48 90 C26 90 10 72 10 48 C10 26 28 10 50 10 Z" },
  { id: "blob-06", path: "M46 10 C70 8 92 26 90 50 C88 76 68 92 44 90 C20 88 8 66 10 44 C12 24 26 12 46 10 Z" },
  { id: "blob-07", path: "M54 9 C74 12 92 30 90 54 C88 78 66 93 44 89 C22 85 8 66 11 44 C14 24 34 6 54 9 Z" },
  { id: "blob-08", path: "M50 12 C72 9 88 28 89 50 C90 72 72 88 50 89 C28 90 11 72 11 50 C11 28 28 15 50 12 Z" },
];

/**
 * The shape a stored index refers to.
 *
 * Throws rather than falling back, on purpose. An index with no shape
 * means a course row points past the library -- a real data problem.
 * Rendering shape 0 instead would show a plausible island for a course
 * whose actual shape is unknown, which is precisely the stand-in this
 * project forbids.
 */
export function shapeForIndex(index: number): IslandShape {
  if (!Number.isInteger(index) || index < 0 || index >= ISLAND_SHAPES.length) {
    throw new Error(
      `Unknown island shape index ${index}: the library has ${ISLAND_SHAPES.length} shapes (0..${ISLAND_SHAPES.length - 1}).`,
    );
  }
  return ISLAND_SHAPES[index];
}

/**
 * Island fill color. Unlike the shape, this is a pure hash with no
 * stored column: the brand palette is fixed and will not grow the
 * way the shape library will, so there is no reshuffling risk to
 * protect against.
 *
 * These encode WHICH COURSE this is, never how well it is known --
 * mastery is not represented on this screen at all.
 */
const ISLAND_COLORS = [
  "var(--periwinkle)",
  "var(--wisteria-blue)",
  "var(--alice-blue)",
  "var(--prussian-blue)",
] as const;

export function islandColorForCourseId(courseId: string): string {
  let hash = 0;
  for (let i = 0; i < courseId.length; i += 1) {
    hash = (hash * 31 + courseId.charCodeAt(i)) % 100000;
  }
  return ISLAND_COLORS[hash % ISLAND_COLORS.length];
}
