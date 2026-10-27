import { describe, expect, it } from "vitest";
import { fromReactFlow, toReactFlow } from "@/lib/followup/graph-mappers";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import { createSession, dispatch } from "@/lib/followup/preview/session";
import { decoratePreviewCanvas } from "./canvas-feedback";

const graph: FlowGraph = {
  nodes: [
    { id: "start", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
    { id: "end", type: "end", label: "Fim", position: { x: 0, y: 200 }, config: { outcome: "exhausted" } },
  ],
  edges: [{ id: "path", source: "start", target: "end", priority: 0, condition: { type: "always" } }],
};

describe("preview canvas feedback", () => {
  it("marks the actual node and traversed edge without persisting decorations", () => {
    const source = toReactFlow(graph);
    const before = JSON.stringify(source);
    let session = dispatch(createSession(graph), { type: "start" });
    session = dispatch(session, { type: "step" });
    const decorated = decoratePreviewCanvas(source.nodes, source.edges, session, (v) => v);
    expect(decorated.nodes.find((n) => n.id === "end")?.domAttributes).toMatchObject({ "data-preview-state": "running" });
    expect(decorated.nodes.find((n) => n.id === "start")?.domAttributes).toMatchObject({ "data-preview-state": "visited" });
    expect(decorated.edges[0]?.className).toContain("flow-preview-edge");
    expect(JSON.stringify(source)).toBe(before);
    expect(fromReactFlow(decorated.nodes, decorated.edges)).toEqual(graph);
    expect(decoratePreviewCanvas(source.nodes, source.edges, null, (v) => v)).toEqual(source);
  });
});
