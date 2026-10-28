"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import type { FollowupFlowDetailRow } from "@/hooks/followup/useFollowupFlow";
import type { PreviewMediaOrigins } from "@/lib/followup/preview/media-url";

/**
 * @xyflow/react is a large dependency — this is the ONLY route that loads it.
 * `ssr:false` + dynamic import keeps it out of the main bundle entirely; see
 * the bundle delta note in the task report.
 */
const FlowCanvas = dynamic(() => import("./FlowCanvas").then((m) => m.FlowCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[600px] items-center justify-center p-6">
      <Skeleton className="h-full w-full" />
    </div>
  ),
});

interface Props {
  flowId: string;
  initialData: FollowupFlowDetailRow;
  previewOrigins?: PreviewMediaOrigins;
}

export function FlowBuilder({ flowId, initialData, previewOrigins }: Props) {
  return (
    <div
      className="flex h-[calc(100dvh-var(--faixas-de-cima,0px)-3.5rem-var(--space-6)-max(var(--space-6),var(--rodape-ocupado,0px)))] max-h-[calc(100dvh-var(--faixas-de-cima,0px)-3.5rem-var(--space-6)-max(var(--space-6),var(--rodape-ocupado,0px)))] min-h-0 w-full flex-1 flex-col overflow-hidden"
      data-testid="flow-builder-shell"
    >
      <FlowCanvas flowId={flowId} initialData={initialData} previewOrigins={previewOrigins} />
    </div>
  );
}
