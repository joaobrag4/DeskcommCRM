import { describe, expect, it } from "vitest";

import { advanceVirtualClock, nextVirtualDeadline } from "./clock";
import { createSession, dispatch } from "./session";
import type { FlowGraph } from "../graph-schema";

const graph: FlowGraph = {
  nodes: [
    { id: "start", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
    {
      id: "wait",
      type: "wait",
      label: "Esperar",
      position: { x: 0, y: 0 },
      config: { mode: "fixed", duration_ms: 86_400_000 },
    },
    {
      id: "end",
      type: "end",
      label: "Fim",
      position: { x: 0, y: 0 },
      config: { outcome: "exhausted" },
    },
  ],
  edges: [
    { id: "enter", source: "start", target: "wait", priority: 0, condition: { type: "always" } },
    { id: "finish", source: "wait", target: "end", priority: 0, condition: { type: "always" } },
  ],
};

function waiting() {
  let session = dispatch(createSession(graph, { startAtMs: 1000 }), { type: "start" });
  session = dispatch(session, { type: "step" });
  return dispatch(session, { type: "step" });
}

describe("relógio virtual", () => {
  it("soma somente durações finitas positivas e preserva monotonicidade", () => {
    expect(advanceVirtualClock(1000, 500)).toBe(1500);
    for (const invalid of [-1, NaN, Infinity])
      expect(advanceVirtualClock(1000, invalid)).toBe(1000);
    expect(nextVirtualDeadline(1000, 500)).toBe(1000);
    expect(nextVirtualDeadline(1000, null)).toBeNull();
  });

  it("arma o prazo sem mudar a duração e salta 24 horas imediatamente", () => {
    const initial = waiting();
    expect(initial).toMatchObject({
      status: "waiting_time",
      virtualNowMs: 1000,
      nextEventAtMs: 86_401_000,
      steps: 2,
    });
    const next = dispatch(initial, { type: "advance" });
    expect(next).toMatchObject({
      status: "running",
      virtualNowMs: 86_401_000,
      currentNodeId: "end",
      nextEventAtMs: null,
      steps: 3,
    });
    expect(initial.graphSnapshot?.nodes[1]?.config).toMatchObject({ duration_ms: 86_400_000 });
  });

  it("vencimento exato resolve uma vez e registra o salto do relógio", () => {
    let session = dispatch(waiting(), { type: "tick", elapsedMs: 86_399_999 });
    expect(session.status).toBe("waiting_time");
    session = dispatch(session, { type: "tick", elapsedMs: 1 });
    expect(session.currentNodeId).toBe("end");
    expect(session.traversedEdgeIds).toEqual(["enter", "finish"]);
    expect(dispatch(session, { type: "tick", elapsedMs: 1 }).traversedEdgeIds).toEqual([
      "enter",
      "finish",
    ]);
  });

  it("pausa congela relógio e prazo; continuar retoma a mesma ocupação", () => {
    const initial = waiting();
    const paused = dispatch(initial, { type: "pause" });
    expect(dispatch(paused, { type: "tick", elapsedMs: 86_400_000 })).toEqual(paused);
    expect(dispatch(paused, { type: "advance" })).toEqual(paused);
    const resumed = dispatch(paused, { type: "resume" });
    expect(resumed).toMatchObject({
      status: "waiting_time",
      virtualNowMs: initial.virtualNowMs,
      nextEventAtMs: initial.nextEventAtMs,
    });
    expect(dispatch(resumed, { type: "advance" }).currentNodeId).toBe("end");
  });

  it("encerrar e reiniciar descartam prazos e nenhuma ação tardia reanima a sessão", () => {
    const stopped = dispatch(waiting(), { type: "stop" });
    expect(stopped).toMatchObject({ status: "stopped", nextEventAtMs: null, occupancy: null });
    expect(dispatch(stopped, { type: "tick", elapsedMs: 100_000_000 })).toEqual(stopped);
    const restarted = dispatch(stopped, { type: "restart" });
    expect(restarted).toMatchObject({
      status: "running",
      currentNodeId: "start",
      virtualNowMs: 1000,
      nextEventAtMs: null,
      steps: 0,
    });
  });

  it("ignora incrementos de tempo inválidos sem resolver etapas", () => {
    const initial = waiting();
    for (const elapsedMs of [NaN, -1, Infinity])
      expect(dispatch(initial, { type: "tick", elapsedMs })).toEqual(initial);
    expect(createSession(graph, { startAtMs: Infinity })).toMatchObject({
      status: "error",
      diagnostic: { code: "invalid_clock" },
    });
  });
});
