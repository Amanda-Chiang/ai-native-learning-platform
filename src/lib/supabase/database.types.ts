/**
 * Hand-written row types matching supabase/migrations/0001_courses_artifacts.sql.
 * Replace with `supabase gen types typescript` output once a live
 * project exists (research.md) -- keep this file's shape in sync with
 * the migration until then.
 *
 * Shape matches what @supabase/postgrest-js's GenericTable/GenericSchema
 * require (Row/Insert/Update/Relationships per table; Tables/Views/
 * Functions per schema) -- omitting any of these makes TypeScript fall
 * back to `never` for every `.from(...)` call instead of erroring
 * loudly, which is what happened here before this was fixed.
 */

export type ArtifactStatus = "queued" | "processing" | "ready" | "failed";

export type CourseRow = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
};

export type ArtifactRow = {
  id: string;
  course_id: string;
  owner_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: ArtifactStatus;
  created_at: string;
  updated_at: string;
};

export type ArtifactProcessingRunRow = {
  id: string;
  artifact_id: string;
  owner_id: string;
  status: ArtifactStatus;
  failure_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

/** Matches supabase/migrations/0002_graph_layouts.sql. */
export type GraphLayoutEntityType = "unit" | "concept";

export type GraphLayoutRow = {
  id: string;
  owner_id: string;
  course_id: string;
  entity_id: string;
  entity_type: GraphLayoutEntityType;
  collapsed: boolean | null;
  x: number | null;
  y: number | null;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      courses: {
        Row: CourseRow;
        Insert: Omit<CourseRow, "id" | "created_at">;
        Update: Partial<Omit<CourseRow, "id">>;
        Relationships: [];
      };
      artifacts: {
        Row: ArtifactRow;
        Insert: Omit<ArtifactRow, "id" | "created_at" | "updated_at" | "status"> & {
          status?: ArtifactStatus;
        };
        Update: Partial<Omit<ArtifactRow, "id">>;
        Relationships: [];
      };
      artifact_processing_runs: {
        Row: ArtifactProcessingRunRow;
        Insert: Omit<ArtifactProcessingRunRow, "id" | "created_at">;
        Update: Partial<Omit<ArtifactProcessingRunRow, "id">>;
        Relationships: [];
      };
      graph_layouts: {
        Row: GraphLayoutRow;
        Insert: Omit<GraphLayoutRow, "id" | "updated_at"> & { updated_at?: string };
        Update: Partial<Omit<GraphLayoutRow, "id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
