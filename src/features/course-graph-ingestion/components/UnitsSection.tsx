"use client";

import { useState } from "react";
import type { CourseUnit } from "@/types/domain/index.ts";
import { createUnit } from "@/features/course-graph-ingestion/actions.ts";
import { AddUnitForm } from "@/features/course-graph-ingestion/components/AddUnitForm.tsx";
import { ArtifactBoard } from "@/features/artifacts/artifact-board.tsx";
import type { Artifact } from "@/features/artifacts/actions.ts";

/**
 * Wraps the upload dropzone (`ArtifactBoard`) and the "Add a unit" form
 * in one client component so a newly-added unit is visible immediately
 * in the upload-time picker, without a full page reload -- Task 10's
 * `AddUnitForm` on its own had nowhere to put the new unit; this is
 * where that state actually lives.
 *
 * `ArtifactBoard` is rendered directly here (not passed in as a
 * render-prop from the Server Component page) because a Server
 * Component can't pass a function as a prop/children to a Client
 * Component -- functions aren't serializable across the RSC boundary
 * except Server Actions. Found live: the render-prop version this
 * task's brief specified 500'd the whole Materials page
 * ("Functions are not valid as a child of Client Components").
 */
export function UnitsSection({
  courseId,
  initialArtifacts,
  initialUnits,
}: {
  courseId: string;
  initialArtifacts: Artifact[];
  initialUnits: CourseUnit[];
}) {
  const [units, setUnits] = useState(initialUnits);

  return (
    <>
      <ArtifactBoard courseId={courseId} initialArtifacts={initialArtifacts} units={units} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
          Units
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          Add a unit to make sure future uploads about it land here directly, instead of relying on
          extraction to invent and later merge a duplicate.
        </p>
        <AddUnitForm courseId={courseId} createUnit={createUnit} onCreated={(u) => setUnits((cur) => [...cur, u])} />
      </div>
    </>
  );
}
