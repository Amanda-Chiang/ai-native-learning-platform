export type IslandLayoutInput = { id: string };

export type IslandPlacement = {
  courseId: string;
  /** Percentage of the canvas width, for the island's top-left corner. */
  leftPercent: number;
  /** Percentage of ONE ROW's height. The canvas grows a row at a time. */
  topPercent: number;
};

export type IslandLayout = { placements: IslandPlacement[]; rows: number };

/**
 * Fixed, not derived from the course count.
 *
 * A sqrt(n) grid would look tidier, but it re-columns every time a
 * course is added -- so adding a fifth course would visibly relocate
 * the other four. A fixed column count means new courses only ever
 * append.
 */
export const ISLANDS_PER_ROW = 3;

/** Jitter bound, as a fraction of a cell. Kept under half a cell so
 *  two neighbouring islands can never be pushed onto each other. */
const JITTER_FRACTION = 0.22;

function hash(value: string): number {
  let result = 0;
  for (let i = 0; i < value.length; i += 1) {
    result = (result * 31 + value.charCodeAt(i)) % 100000;
  }
  return result;
}

/** A stable pseudo-random offset in [-1, 1] for one course and axis. */
function jitter(courseId: string, axis: "x" | "y"): number {
  const h = hash(`${courseId}:${axis}`);
  return ((h % 1000) / 1000) * 2 - 1;
}

/**
 * Positions one island per course on a fixed-column grid, with a
 * per-course jitter so the result reads as a scatter rather than a
 * grid.
 *
 * Deterministic: the same courses always produce the same layout, on
 * every device and every reload. That matters because the archipelago
 * is a navigation surface -- an island that moves between visits is a
 * landmark that cannot be learned.
 */
export function layoutIslands(courses: IslandLayoutInput[]): IslandLayout {
  const cellWidth = 100 / ISLANDS_PER_ROW;
  const placements = courses.map((course, ordinal) => {
    const column = ordinal % ISLANDS_PER_ROW;
    const cellLeft = column * cellWidth;

    return {
      courseId: course.id,
      leftPercent: round(cellLeft + cellWidth / 2 + jitter(course.id, "x") * cellWidth * JITTER_FRACTION),
      topPercent: round(50 + jitter(course.id, "y") * 100 * JITTER_FRACTION),
    };
  });

  return { placements, rows: Math.ceil(courses.length / ISLANDS_PER_ROW) };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
