"use client";

import { useRef, useState } from "react";
import type { GraphLayout } from "@/features/visual-assessment/graph-layout.ts";
import type { TreeLayout } from "@/features/visual-assessment/tree-layout.ts";
import type { SubmitConfirmedVisualResponseInput } from "@/features/visual-assessment/actions.ts";
import { ConfirmExtraction } from "@/features/visual-assessment/components/ConfirmExtraction.tsx";

type SubmitDrawingResult = {
  attemptDraftId: string | null;
  claimFields: Record<string, unknown> | null;
  confidence: number | null;
  needsConfirmation: boolean;
  error: string | null;
};

const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 500;

function drawLayout(ctx: CanvasRenderingContext2D, layout: GraphLayout | TreeLayout) {
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 1;
  for (const edge of layout.edges) {
    const source = layout.nodes.find((n) => n.id === edge.sourceId);
    const target = layout.nodes.find((n) => n.id === edge.targetId);
    if (!source || !target) continue;
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
  }
  ctx.fillStyle = "#1f2937";
  ctx.font = "14px sans-serif";
  for (const node of layout.nodes) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 18, 0, 2 * Math.PI);
    ctx.fillStyle = "#e5e7eb";
    ctx.fill();
    ctx.strokeStyle = "#374151";
    ctx.stroke();
    ctx.fillStyle = "#1f2937";
    ctx.fillText(node.label, node.x - 6, node.y + 5);
  }
}

/**
 * Renders the question's real structure (via graph-layout.ts/
 * tree-layout.ts, given the safe-to-render problem setup) and lets the
 * student draw their answer on top with pointer input (FR-002) --
 * submitting captures the whole canvas as a PNG data URL.
 */
export function QuestionCanvas({
  courseId,
  questionBankEntryId,
  questionText,
  layout,
  conceptIds,
  edgeIds,
  submitDrawing,
  submitConfirmedVisualResponse,
}: {
  courseId: string;
  questionBankEntryId: string;
  questionText: string;
  layout: GraphLayout | TreeLayout;
  conceptIds: string[];
  edgeIds: string[];
  submitDrawing: (courseId: string, questionBankEntryId: string, imageDataUrl: string) => Promise<SubmitDrawingResult>;
  submitConfirmedVisualResponse: (input: SubmitConfirmedVisualResponseInput) => Promise<{ result: unknown; error: string | null }>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ claimFields: Record<string, unknown>; confidence: number } | null>(null);
  const [result, setResult] = useState<unknown>(null);

  function initCanvas(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawLayout(ctx, layout);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    ctx?.beginPath();
    ctx?.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  }

  function handlePointerUp() {
    drawing.current = false;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    if (canvas) initCanvas(canvas);
  }

  async function handleSubmit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPending(true);
    setError(null);
    const imageDataUrl = canvas.toDataURL("image/png");
    const outcome = await submitDrawing(courseId, questionBankEntryId, imageDataUrl);
    setPending(false);
    if (outcome.error || !outcome.claimFields || outcome.confidence === null) {
      setError(outcome.error ?? "Could not read this drawing.");
      return;
    }
    if (outcome.needsConfirmation) {
      setConfirmState({ claimFields: outcome.claimFields, confidence: outcome.confidence });
      return;
    }
    await grade(outcome.claimFields);
  }

  async function grade(confirmedClaimFields: Record<string, unknown>) {
    setPending(true);
    const outcome = await submitConfirmedVisualResponse({
      courseId,
      questionBankEntryId,
      conceptIds,
      edgeIds,
      confirmedClaimFields,
      evidenceMeta: { evidenceType: "application", assistanceLevel: 0, difficulty: 0.5, transferDistance: 0 },
    });
    setPending(false);
    setConfirmState(null);
    if (outcome.error) {
      setError(outcome.error);
      return;
    }
    setResult(outcome.result);
  }

  return (
    <div>
      <p>{questionText}</p>
      <canvas
        ref={(el) => {
          canvasRef.current = el;
          if (el) initCanvas(el);
        }}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ border: "1px solid #d1d5db", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div>
        <button type="button" onClick={handleClear}>Clear</button>
        <button type="button" onClick={handleSubmit} disabled={pending}>Submit</button>
      </div>
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      {confirmState && (
        <ConfirmExtraction
          claimFields={confirmState.claimFields}
          confidence={confirmState.confidence}
          onConfirm={grade}
          pending={pending}
        />
      )}
      {result !== null && <p>Result: {JSON.stringify(result)}</p>}
    </div>
  );
}
