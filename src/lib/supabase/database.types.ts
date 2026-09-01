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

/** Matches supabase/migrations/0003_course_ontology.sql. */
export type CourseUnitRow = {
  id: string;
  course_id: string;
  owner_id: string;
  title: string;
  created_at: string;
};

export type OntologyStatus = "proposed" | "confirmed" | "archived";

export type SourceAnchorJson = { artifactId: string; locator: string; excerpt: string };

export type CourseConceptRow = {
  id: string;
  course_id: string;
  owner_id: string;
  unit_id: string;
  canonical_name: string;
  aliases: string[];
  description: string;
  importance_score: number;
  source_anchors: SourceAnchorJson[];
  status: OntologyStatus;
  confidence: number;
  extraction_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export const STANDARD_RELATION_TYPES_DB = [
  "prerequisite_for",
  "part_of",
  "mechanism_for",
  "contrasts_with",
  "used_in",
  "generalizes_to",
  "example_of",
] as const;

export type RelationTypeDb = (typeof STANDARD_RELATION_TYPES_DB)[number] | "other";

export type ConceptEdgeRow = {
  id: string;
  course_id: string;
  owner_id: string;
  source_concept_id: string;
  target_concept_id: string;
  relation_type: RelationTypeDb;
  relation_type_note: string | null;
  explanation: string;
  source_anchors: SourceAnchorJson[];
  status: OntologyStatus;
  confidence: number;
  extraction_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExtractionRunStatus = "queued" | "processing" | "completed" | "failed";

export type ExtractionRunRow = {
  id: string;
  course_id: string;
  owner_id: string;
  artifact_id: string;
  status: ExtractionRunStatus;
  failure_reason: string | null;
  concepts_extracted: number;
  edges_extracted: number;
  edges_dropped_self_referential: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type ReconciliationDecisionKind = "concept" | "edge";
export type ReconciliationDecisionOutcome = "merge" | "distinct" | "uncertain";

export type ReconciliationDecisionRow = {
  id: string;
  course_id: string;
  owner_id: string;
  extraction_run_id: string;
  candidate_kind: ReconciliationDecisionKind;
  decision: ReconciliationDecisionOutcome;
  matched_concept_id: string | null;
  reasoning: string;
  created_at: string;
};

export type ConceptFlagTargetKind = "concept" | "edge";

export type ConceptFlagRow = {
  id: string;
  course_id: string;
  target_kind: ConceptFlagTargetKind;
  target_id: string;
  reporter_id: string;
  reason: string;
  created_at: string;
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
      course_units: {
        Row: CourseUnitRow;
        Insert: Omit<CourseUnitRow, "id" | "created_at">;
        Update: Partial<Omit<CourseUnitRow, "id">>;
        Relationships: [];
      };
      course_concepts: {
        Row: CourseConceptRow;
        Insert: Omit<CourseConceptRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<CourseConceptRow, "id">>;
        Relationships: [];
      };
      concept_edges: {
        Row: ConceptEdgeRow;
        Insert: Omit<ConceptEdgeRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<ConceptEdgeRow, "id">>;
        Relationships: [];
      };
      extraction_runs: {
        Row: ExtractionRunRow;
        Insert: Omit<ExtractionRunRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<ExtractionRunRow, "id">>;
        Relationships: [];
      };
      reconciliation_decisions: {
        Row: ReconciliationDecisionRow;
        Insert: Omit<ReconciliationDecisionRow, "id" | "created_at">;
        Update: Partial<Omit<ReconciliationDecisionRow, "id">>;
        Relationships: [];
      };
      concept_flags: {
        Row: ConceptFlagRow;
        Insert: Omit<ConceptFlagRow, "id" | "created_at">;
        Update: Partial<Omit<ConceptFlagRow, "id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
