import type { RFEdge, RFNode } from "@/lib/followup/graph-mappers";
import type { PreviewSession } from "@/lib/followup/preview/types";

export const PREVIEW_STATUS_LABELS: Record<PreviewSession["status"], string> = {
  ready: "Pronta para começar",
  running: "Percorrendo o fluxo",
  paused: "Prévia pausada",
  waiting_reply: "Aguardando resposta",
  waiting_time: "Aguardando prazo",
  completed: "Fluxo concluído",
  unsupported: "Etapa não suportada",
  error: "Verifique esta etapa",
  stopped: "Prévia encerrada",
};

/** Decorations are render-only copies. The editor state remains the source of saved JSON. */
export function decoratePreviewCanvas(
  nodes: RFNode[],
  edges: RFEdge[],
  session: PreviewSession | null,
  translate: (value: string) => string,
): { nodes: RFNode[]; edges: RFEdge[] } {
  if (!session) return { nodes, edges };
  const visited = new Map(session.visitedNodeIds.map((id, index) => [id, index + 1]));
  const traversed = new Set(session.traversedEdgeIds);
  const lastEdge = session.traversedEdgeIds.at(-1);
  return {
    nodes: nodes.map((node) => {
      const current = node.id === session.currentNodeId;
      const order = visited.get(node.id);
      if (!current && !order) return node;
      const state = current ? session.status : "visited";
      const label = current ? translate(PREVIEW_STATUS_LABELS[session.status]) : translate("Etapa percorrida");
      return {
        ...node,
        className: `${node.className ?? ""} flow-preview-node`,
        domAttributes: {
          ...node.domAttributes,
          "data-preview-state": state,
          "data-preview-order": order ?? 0,
          "data-preview-label": current ? label : `${order} · ${label}`,
        },
        ariaLabel: `${node.data.label} · ${label}`,
      };
    }),
    edges: edges.map((edge) => traversed.has(edge.id) ? {
      ...edge,
      className: `${edge.className ?? ""} flow-preview-edge`,
      // Only the latest connection moves; history remains a quiet solid trail.
      animated: edge.id === lastEdge && session.status === "running",
      style: { ...edge.style, stroke: "var(--color-accent-500)", strokeWidth: 3 },
      labelStyle: { ...edge.labelStyle, fill: "var(--color-accent-700)", fontWeight: 600 },
    } : edge),
  };
}
