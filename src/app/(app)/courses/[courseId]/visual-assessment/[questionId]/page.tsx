import { createClient } from "@/lib/supabase/server.ts";
import { extractProblemSetup, type CheckerDomain } from "@/features/visual-assessment/problem-setup.ts";
import { layoutGraph } from "@/features/visual-assessment/graph-layout.ts";
import { layoutTree } from "@/features/visual-assessment/tree-layout.ts";
import { QuestionCanvas } from "@/features/visual-assessment/components/QuestionCanvas.tsx";
import { submitDrawing, submitConfirmedVisualResponse } from "@/features/visual-assessment/actions.ts";

const GRAPH_DOMAINS: CheckerDomain[] = ["bfs-dfs", "topological-sort", "shortest-path"];
const TREE_DOMAINS: CheckerDomain[] = ["tree-traversal", "tree-insertion"];

export default async function VisualAssessmentQuestionPage({
  params,
}: {
  params: Promise<{ courseId: string; questionId: string }>;
}) {
  const { courseId, questionId } = await params;
  const supabase = await createClient();

  const { data: entry, error } = await supabase
    .from("question_bank")
    .select("question_text, checker_domain, checker_input, source_anchors")
    .eq("id", questionId)
    .single();

  const domain = entry?.checker_domain as CheckerDomain | undefined;
  const isSupportedDomain = domain !== undefined && (GRAPH_DOMAINS.includes(domain) || TREE_DOMAINS.includes(domain));

  // Real bug fixed here: the layout choice below used to be a plain
  // GRAPH_DOMAINS/else-tree ternary, so a domain in neither list (only
  // "heap" today -- CheckerDomain's 6 values are 3 graph + 2 tree + 1
  // not visually supported) silently fell into layoutTree(undefined)
  // instead of this honest "not supported" message. TREE_DOMAINS is
  // used explicitly below so that gap can't reopen the same way.
  if (error || !entry || !entry.checker_domain || !entry.checker_input || !isSupportedDomain) {
    return (
      <main>
        <h1>Visual Assessment</h1>
        <p>This question doesn&apos;t have a checker domain -- visual assessment only supports graph/tree checker-domain questions.</p>
      </main>
    );
  }

  const problemSetup = extractProblemSetup(entry.checker_input as Record<string, unknown>);
  const layout = GRAPH_DOMAINS.includes(domain)
    ? layoutGraph(problemSetup.graph as Parameters<typeof layoutGraph>[0])
    : layoutTree(problemSetup.tree as Parameters<typeof layoutTree>[0]);

  const anchorIds = (entry.source_anchors as { conceptOrEdgeId: string }[]).map((a) => a.conceptOrEdgeId);
  const [conceptsRes, edgesRes] = await Promise.all([
    supabase.from("course_concepts").select("id").eq("course_id", courseId).in("id", anchorIds),
    supabase.from("concept_edges").select("id").eq("course_id", courseId).in("id", anchorIds),
  ]);
  const conceptIds = (conceptsRes.data ?? []).map((r) => r.id);
  const edgeIds = (edgesRes.data ?? []).map((r) => r.id);

  return (
    <main>
      <h1>Visual Assessment</h1>
      <QuestionCanvas
        courseId={courseId}
        questionBankEntryId={questionId}
        questionText={entry.question_text}
        layout={layout}
        conceptIds={conceptIds}
        edgeIds={edgeIds}
        submitDrawing={submitDrawing}
        submitConfirmedVisualResponse={submitConfirmedVisualResponse}
      />
    </main>
  );
}
