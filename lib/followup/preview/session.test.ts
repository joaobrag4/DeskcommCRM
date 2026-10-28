import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowGraph, FlowNode } from "../graph-schema";
import { TETO_DE_PASSOS_DO_MOTOR } from "../custo-no-motor";
import { createSession, dispatch } from "./session";
import type { PreviewSession } from "./types";

const position = { x: 0, y: 0 };
function node(id: string, type: FlowNode["type"], config: unknown): FlowNode {
  return { id, type, label: id, position, config } as FlowNode;
}
function edge(
  id: string,
  source: string,
  target: string,
  condition: FlowEdge["condition"] = { type: "always" },
  priority = 0,
): FlowEdge {
  return { id, source, target, condition, priority };
}
function graph(middle: FlowNode[], edges?: FlowEdge[]): FlowGraph {
  const nodes = [
    node("start", "trigger", {}),
    ...middle,
    node("end", "end", { outcome: "exhausted" }),
  ];
  return {
    nodes,
    edges: edges ?? nodes.slice(0, -1).map((n, i) => edge(`e${i}`, n.id, nodes[i + 1]!.id)),
  };
}
function run(session: PreviewSession): PreviewSession {
  let next = session.status === "ready" ? dispatch(session, { type: "start" }) : session;
  for (let i = 0; next.status === "running" && i < 200; i++)
    next = dispatch(next, { type: "step" });
  return next;
}

describe("sessão local do fluxo", () => {
  it("percorre trigger, envio com mídia, tarefa e fim contabilizando ticks reais", () => {
    const session = run(
      createSession(
        graph([
          node("send", "action", {
            mode: "text",
            body: "Oi {{primeiro_nome}}!",
            media_url: "https://example.invalid/audio.ogg",
          }),
          node("task", "internal_task", {
            titulo: "Conferir {{contact.name}}",
            vence_em_dias: 1,
            atribuir_a: "dono_do_lead",
            prioridade: "high",
          }),
        ]),
        { context: { contact: { name: "Ana Silva" } }, startAtMs: 0 },
      ),
    );

    expect(session.status).toBe("completed");
    expect(session.steps).toBe(5);
    expect(session.transcript[0]).toMatchObject({
      direction: "outbound",
      body: "Oi Ana!",
      mediaUrl: "https://example.invalid/audio.ogg",
      simulated: true,
    });
    expect(session.transcript[0]).not.toHaveProperty("mediaType");
    expect(session.transcript[1]).toMatchObject({
      direction: "system",
      task: { titulo: "Conferir Ana Silva", prioridade: "high" },
    });
    expect(session.visitedNodeIds).toEqual(["start", "send", "task", "end"]);
    expect(session.traversedEdgeIds).toEqual(["e0", "e1", "e2"]);
    expect(session.trace.filter((e) => e.kind === "edge").map((e) => e.edgeId)).toEqual(
      session.traversedEdgeIds,
    );
    expect(session.trace.every((event, index) => event.ordinal === index + 1)).toBe(true);
  });

  it("preserva rascunho e snapshots anteriores de forma independente", () => {
    const draft = graph([node("send", "action", { mode: "text", body: "Original" })]);
    const initial = createSession(draft);
    (draft.nodes[1] as Extract<FlowNode, { type: "action" }>).config = {
      mode: "text",
      body: "Editado",
    };
    const started = dispatch(initial, { type: "start" });
    const completed = run(started);
    expect(initial.status).toBe("ready");
    expect(initial.transcript).toEqual([]);
    expect(started.currentNodeId).toBe("start");
    expect(completed.transcript[0]?.body).toBe("Original");
    expect(JSON.parse(JSON.stringify(completed))).toEqual(completed);
  });

  it("identifica grafo inválido e alvo de aresta ausente sem execução parcial", () => {
    const invalid = graph([]);
    invalid.edges[0]!.target = "inexistente";
    const session = createSession(invalid);
    expect(session.status).toBe("error");
    expect(session.diagnostic?.code).toBe("invalid_graph");
    expect(session.diagnostic?.nodeId).toBe("start");
    expect(session.transcript).toEqual([]);
    expect(dispatch(session, { type: "start" }).status).toBe("error");
  });

  it.each([
    node("ai", "action", { mode: "ai_message", prompt_hint: "Fale" }),
    node("smart", "wait", { mode: "smart", min_ms: 300_000, max_ms: 600_000 }),
    node("business-hours", "wait", { mode: "business_hours" }),
    node("time-of-day", "wait", { mode: "time_of_day" }),
    node("business-days", "wait", { mode: "business_days" }),
    node("classify", "ai_classify", { classes: ["sim"], grace_timeout_ms: 900_000 }),
    node("save", "match_reply", {
      branches: [{ id: "yes", label: "Sim", op: "eq", pattern: "sim" }],
      grace_timeout_ms: 900_000,
      save_to: { kind: "contact_name" },
    }),
  ])("declara o modo não suportado antes de iniciar: $id", (unsupported) => {
    const session = createSession(graph([unsupported]));
    expect(session.status).toBe("unsupported");
    expect(session.diagnostic).toMatchObject({ code: "unsupported_node", nodeId: unsupported.id });
    expect(session.transcript).toEqual([]);
  });

  it("não executa encadeamento de outro fluxo e o identifica no diagnóstico", () => {
    const input = graph([]);
    input.nodes[1] = node("end", "end", {
      outcome: "exhausted",
      ao_finalizar: { tipo: "proximo_fluxo", fluxo: "outro" },
    });
    expect(createSession(input)).toMatchObject({
      status: "unsupported",
      diagnostic: { nodeId: "end" },
    });
  });

  it("reutiliza a prioridade de arestas e registra o id exato entre alvos iguais", () => {
    const input = graph([node("send", "action", { mode: "text", body: "Oi" })]);
    input.edges.unshift(edge("highest", "start", "send", { type: "always" }, 10));
    expect(run(createSession(input)).traversedEdgeIds[0]).toBe("highest");
  });

  it("interrompe ciclo pelo mesmo teto e custo por tick do motor", () => {
    const input = graph(
      [node("send", "action", { mode: "text", body: "Oi" })],
      [edge("enter", "start", "send"), edge("loop", "send", "send")],
    );
    const session = run(createSession(input));
    expect(session.status).toBe("error");
    expect(session.diagnostic?.code).toBe("max_steps");
    expect(session.steps).toBe(TETO_DE_PASSOS_DO_MOTOR + 1);
    expect(session.transcript.length).toBe(40);
  });

  it("avisa variáveis ausentes preservando a limpeza do renderizador existente", () => {
    const session = run(
      createSession(
        graph([
          node("send", "action", {
            mode: "text",
            body: "Oi {{nome}}! Seu pedido: {{lead.title}}.",
          }),
        ]),
        { context: {} },
      ),
    );
    expect(session.transcript[0]?.body).toBe("Oi! Seu pedido:.");
    expect(session.trace.find((event) => event.kind === "warning")?.details).toMatchObject({
      variables: ["nome", "lead.title"],
    });
  });

  it("pausa após o envio e retoma sem duplicar; reinício limpa toda ocupação", () => {
    let session = dispatch(
      createSession(graph([node("send", "action", { mode: "text", body: "Oi" })])),
      { type: "start" },
    );
    session = dispatch(session, { type: "step" });
    session = dispatch(session, { type: "step" });
    expect(session.transcript).toHaveLength(1);
    session = dispatch(session, { type: "pause" });
    expect(dispatch(session, { type: "step" })).toEqual(session);
    expect(run(dispatch(session, { type: "resume" })).transcript).toHaveLength(1);
    const restarted = dispatch(session, { type: "restart" });
    expect(restarted).toMatchObject({
      currentNodeId: "start",
      status: "running",
      steps: 0,
      nextEventAtMs: null,
    });
    expect(run(restarted).transcript).toHaveLength(1);
  });
});
