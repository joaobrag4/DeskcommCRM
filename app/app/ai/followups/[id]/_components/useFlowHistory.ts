"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { RFNode, RFEdge } from "@/lib/followup/graph-mappers";
import { fromReactFlow, graphsEqual } from "@/lib/followup/graph-mappers";

interface FlowSnapshot {
  nodes: RFNode[];
  edges: RFEdge[];
}

function cloneRF<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable ||
    target.closest("input, textarea, [contenteditable='true']") !== null
  );
}

interface UseFlowHistoryProps {
  initialNodes: RFNode[];
  initialEdges: RFEdge[];
  setNodes: React.Dispatch<React.SetStateAction<RFNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<RFEdge[]>>;
  t: (texto: string) => string;
}

export function useFlowHistory({
  initialNodes,
  initialEdges,
  setNodes,
  setEdges,
  t,
}: UseFlowHistoryProps) {
  const historyRef = useRef<FlowSnapshot[]>([
    { nodes: cloneRF(initialNodes), edges: cloneRF(initialEdges) },
  ]);
  const pointerRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isTimeTravelingRef = useRef(false);

  const pushSnapshot = useCallback((newNodes: RFNode[], newEdges: RFEdge[]) => {
    if (isTimeTravelingRef.current) return;

    const current = historyRef.current[pointerRef.current];
    if (current) {
      try {
        const g1 = fromReactFlow(current.nodes, current.edges);
        const g2 = fromReactFlow(newNodes, newEdges);
        if (graphsEqual(g1, g2)) {
          return;
        }
      } catch {
        // If graph conversion fails for any node, continue pushing snapshot
      }
    }

    const nextHistory = historyRef.current.slice(0, pointerRef.current + 1);
    nextHistory.push({
      nodes: cloneRF(newNodes),
      edges: cloneRF(newEdges),
    });

    if (nextHistory.length > 50) {
      nextHistory.shift();
    }

    historyRef.current = nextHistory;
    pointerRef.current = nextHistory.length - 1;
    setCanUndo(pointerRef.current > 0);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (pointerRef.current <= 0) return;

    pointerRef.current -= 1;
    const target = historyRef.current[pointerRef.current];
    if (!target) return;

    isTimeTravelingRef.current = true;
    setNodes(cloneRF(target.nodes));
    setEdges(cloneRF(target.edges));
    setCanUndo(pointerRef.current > 0);
    setCanRedo(pointerRef.current < historyRef.current.length - 1);

    window.setTimeout(() => {
      isTimeTravelingRef.current = false;
    }, 50);

    toast.info(t("Ação desfeita (Ctrl+Z)"));
  }, [setNodes, setEdges, t]);

  const redo = useCallback(() => {
    if (pointerRef.current >= historyRef.current.length - 1) return;

    pointerRef.current += 1;
    const target = historyRef.current[pointerRef.current];
    if (!target) return;

    isTimeTravelingRef.current = true;
    setNodes(cloneRF(target.nodes));
    setEdges(cloneRF(target.edges));
    setCanUndo(pointerRef.current > 0);
    setCanRedo(pointerRef.current < historyRef.current.length - 1);

    window.setTimeout(() => {
      isTimeTravelingRef.current = false;
    }, 50);

    toast.info(t("Ação refeita (Ctrl+Y)"));
  }, [setNodes, setEdges, t]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputElement(e.target)) return;

      const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (!modifier) return;

      const key = e.key.toLowerCase();

      // Undo: Ctrl+Z (sem Shift)
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        undo();
        return;
      }

      // Redo: Ctrl+Y ou Ctrl+Shift+Z ou Cmd+Shift+Z
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        redo();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [undo, redo]);

  return {
    pushSnapshot,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
