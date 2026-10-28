import { describe, expect, it } from "vitest";

import fixture from "@/tests/fixtures/followup-preview/cifras-gospel.fluxo.json";
import { flowGraphSchema, type FlowEdge, type FlowGraph, type FlowNode } from "../graph-schema";
import { createSession, dispatch } from "./session";
import type { PreviewSession } from "./types";

function stepUntilBlocked(initial: PreviewSession): PreviewSession {
  let session = initial.status === "ready" ? dispatch(initial, { type: "start" }) : initial;
  for (let i = 0; session.status === "running" && i < 100; i++)
    session = dispatch(session, { type: "step" });
  return session;
}
function makeGraph(wait = false, immune = false): FlowGraph {
  const position = { x: 0, y: 0 };
  const nodes: FlowNode[] = [
    { id: "start", type: "trigger", label: "Início", position, config: {} },
    ...(wait
      ? [
          {
            id: "wait",
            type: "wait",
            label: "Espera",
            position,
            config: { mode: "fixed", duration_ms: 5000, immune_to_reply: immune },
          } as FlowNode,
        ]
      : []),
    {
      id: "question",
      type: "match_reply",
      label: "Pergunta",
      position,
      config: {
        grace_timeout_ms: 900_000,
        branches: [
          { id: "first", label: "Primeira", op: "contains", pattern: "SIM" },
          { id: "second", label: "Segunda", op: "eq", pattern: "sim" },
          { id: "accent", label: "Não", op: "eq", pattern: "não" },
        ],
      },
    },
    {
      id: "question2",
      type: "match_reply",
      label: "Outra pergunta",
      position,
      config: {
        grace_timeout_ms: 900_000,
        branches: [{ id: "yes", label: "Sim", op: "eq", pattern: "sim" }],
      },
    },
    {
      id: "fallback",
      type: "end",
      label: "Fallback",
      position,
      config: { outcome: "custom", note: "Não reconhecido" },
    },
    { id: "silence", type: "end", label: "Silêncio", position, config: { outcome: "exhausted" } },
    { id: "no", type: "end", label: "Não", position, config: { outcome: "exhausted" } },
  ];
  const edges: FlowEdge[] = [
    {
      id: "enter",
      source: "start",
      target: wait ? "wait" : "question",
      priority: 0,
      condition: { type: "always" },
    },
    ...(wait
      ? [
          {
            id: "after_wait",
            source: "wait",
            target: "question",
            priority: 0,
            condition: { type: "always" },
          } as FlowEdge,
        ]
      : []),
    {
      id: "first-low",
      source: "question",
      target: "question2",
      priority: 1,
      condition: { type: "branch", branch_id: "first" },
    },
    {
      id: "first-high",
      source: "question",
      target: "question2",
      priority: 9,
      condition: { type: "branch", branch_id: "first" },
    },
    {
      id: "second",
      source: "question",
      target: "no",
      priority: 20,
      condition: { type: "branch", branch_id: "second" },
    },
    {
      id: "accent",
      source: "question",
      target: "no",
      priority: 0,
      condition: { type: "branch", branch_id: "accent" },
    },
    {
      id: "fallback",
      source: "question",
      target: "fallback",
      priority: 99,
      condition: { type: "always" },
    },
    {
      id: "silence",
      source: "question",
      target: "silence",
      priority: 0,
      condition: { type: "branch", branch_id: "no_reply" },
    },
    {
      id: "q2fallback",
      source: "question2",
      target: "fallback",
      priority: 0,
      condition: { type: "always" },
    },
  ];
  return { nodes, edges };
}

describe("respostas, esperas e cenários do funil", () => {
  it("aplica trim/lowercase, ordem dos ramos e prioridade real sem reutilizar inbound", () => {
    let session = stepUntilBlocked(createSession(makeGraph()));
    session = dispatch(session, { type: "reply", body: "  SiM  " });
    expect(session.currentNodeId).toBe("question2");
    expect(session.traversedEdgeIds.at(-1)).toBe("first-high");
    session = stepUntilBlocked(session);
    expect(session).toMatchObject({ status: "waiting_reply", currentNodeId: "question2" });
    expect(session.consumedInboundIds).toHaveLength(1);
    expect(session.transcript.filter((message) => message.direction === "inbound")).toHaveLength(1);
  });

  it("não remove acentos e o texto desconhecido segue o fallback existente", () => {
    const session = dispatch(stepUntilBlocked(createSession(makeGraph())), {
      type: "reply",
      body: "nao",
    });
    expect(session.currentNodeId).toBe("fallback");
    expect(session.traversedEdgeIds.at(-1)).toBe("fallback");
  });

  it("silêncio usa no_reply, inclusive branch reservada v2", () => {
    const input = makeGraph();
    input.edges.find((edge) => edge.id === "silence")!.condition = {
      type: "branch",
      branch_id: "no_reply",
    };
    const session = dispatch(stepUntilBlocked(createSession(input)), { type: "advance" });
    expect(session.currentNodeId).toBe("silence");
    expect(session.traversedEdgeIds.at(-1)).toBe("silence");
  });

  it("resposta antecipada corta espera comum e não responde à pergunta seguinte", () => {
    let session = stepUntilBlocked(createSession(makeGraph(true)));
    expect(session.currentNodeId).toBe("wait");
    session = dispatch(session, { type: "reply", body: "sim" });
    expect(session.currentNodeId).toBe("question");
    expect(session.virtualNowMs).toBe(0);
    session = stepUntilBlocked(session);
    expect(session).toMatchObject({ status: "waiting_reply", currentNodeId: "question" });
    expect(session.consumedInboundIds).toHaveLength(1);
  });

  it("espera imune mantém prazo e não cancela mesmo com cancelOnReply", () => {
    const initial = stepUntilBlocked(createSession(makeGraph(true, true), { cancelOnReply: true }));
    const session = dispatch(initial, { type: "reply", body: "sim" });
    expect(session).toMatchObject({
      status: "waiting_time",
      currentNodeId: "wait",
      nextEventAtMs: initial.nextEventAtMs,
    });
    expect(dispatch(session, { type: "advance" }).currentNodeId).toBe("question");
  });

  it.each([false, true])("cancelOnReply encerra a ocupação ativa (wait=%s)", (wait) => {
    const session = dispatch(
      stepUntilBlocked(createSession(makeGraph(wait), { cancelOnReply: true })),
      { type: "reply", body: "sim" },
    );
    expect(session).toMatchObject({ status: "completed", outcome: "replied", nextEventAtMs: null });
    expect(session.trace.at(-1)?.details).toMatchObject({ reason: "cancel_on_reply" });
  });

  it("palavras HUMANO e PARAR seguem o grafo sem produzir eventos globais", () => {
    for (const body of ["HUMANO", "PARAR", "paguei"]) {
      const session = dispatch(stepUntilBlocked(createSession(makeGraph())), {
        type: "reply",
        body,
      });
      expect(session.currentNodeId).toBe("fallback");
      expect(session.outcome).toBeNull();
    }
  });

  it("empate de resposta/vencimento segue a ordem explícita de dispatch", () => {
    const initial = stepUntilBlocked(createSession(makeGraph()));
    const replyFirst = dispatch(initial, { type: "reply", body: "sim" });
    expect(dispatch(replyFirst, { type: "tick", elapsedMs: 900_000 }).currentNodeId).toBe(
      "question2",
    );
    const deadlineFirst = dispatch(initial, { type: "advance" });
    expect(dispatch(deadlineFirst, { type: "reply", body: "sim" }).currentNodeId).toBe("silence");
  });

  it("interrompe trilha lotada sem podar registros ou crescer além de 2.000", () => {
    let session = stepUntilBlocked(createSession(makeGraph(true, true)));
    for (let i = 0; session.status !== "error" && i < 2100; i++)
      session = dispatch(session, { type: "reply", body: `Mensagem ${i}` });
    expect(session.diagnostic?.code).toBe("max_trace");
    expect(session.trace).toHaveLength(2000);
    expect(session.trace[0]?.ordinal).toBe(1);
    expect(session.trace.at(-1)).toMatchObject({ kind: "error", ordinal: 2000 });
  });

  it("fixture anonimizada conserva48 nós97 arestas e seis mídias", () => {
    const graph = flowGraphSchema.parse(fixture.flow.graph);
    expect(graph.nodes).toHaveLength(48);
    expect(graph.edges).toHaveLength(97);
    expect(
      graph.nodes.filter(
        (n) => n.type === "action" && n.config.mode === "text" && n.config.media_url,
      ),
    ).toHaveLength(6);
    expect(JSON.stringify(fixture)).not.toMatch(
      /11959138493|Breno|Marcela|chat\.whatsapp\.com|supabase_kong/,
    );
    let session = stepUntilBlocked(createSession(graph, { context: { contact: { name: "Ana" } } }));
    session = stepUntilBlocked(dispatch(session, { type: "advance" }));
    expect(session.currentNodeId).toBe("reply_start");
    session = stepUntilBlocked(dispatch(session, { type: "reply", body: "humano" }));
    // A referência real está sem a saída desta tarefa. O ensaio expõe o
    // defeito em vez de inventar a aresta human_task -> end_human.
    expect(session.status).toBe("error");
    expect(session.diagnostic).toMatchObject({ code: "node_failed", nodeId: "human_task" });
    expect(session.transcript.find((message) => message.task)).toBeUndefined();
    expect(session.outcome).toBeNull();
  });

  it.each([
    { body: "sim", nodeId: "ask_delivery", status: "error", visited: "video1" },
    { body: "não", nodeId: "end_decline", status: "completed", visited: "decline" },
    { body: "PARAR", nodeId: "end_stop", status: "completed", visited: "stop_ack" },
    { body: "HUMANO", nodeId: "human_task", status: "error", visited: "human_ack" },
    { body: "texto não previsto", nodeId: "human_task", status: "error", visited: "human_ack" },
    { body: null, nodeId: "end_timeout", status: "completed", visited: "reminder1" },
  ])("percurso real desde a apresentação: $body", ({ body, nodeId, status, visited }) => {
    let session = stepUntilBlocked(
      createSession(fixture.flow.graph, { context: { contact: { name: "Ana" } } }),
    );
    session = stepUntilBlocked(dispatch(session, { type: "advance" }));
    expect(session).toMatchObject({ currentNodeId: "reply_start", status: "waiting_reply" });
    session = stepUntilBlocked(
      dispatch(session, body === null ? { type: "advance" } : { type: "reply", body }),
    );
    expect(session).toMatchObject({ status, currentNodeId: nodeId });
    expect(session.visitedNodeIds).toContain(visited);
    if (status === "error")
      expect(session.diagnostic).toMatchObject({ code: "node_failed", nodeId });
    expect(session.outcome).not.toBe("handoff");
    expect(session.outcome).not.toBe("opted_out");
  });

  it.each([
    {
      entry: "reply_delivery",
      body: "sim",
      nodeId: "reply_material",
      status: "waiting_reply",
      visited: "pdf",
    },
    {
      entry: "reply_material",
      body: "pix",
      nodeId: "reply_main_pix",
      status: "waiting_reply",
      visited: "main_pix",
    },
    {
      entry: "reply_material",
      body: "aula",
      nodeId: "reply_demo",
      status: "waiting_reply",
      visited: "upsell_intro",
    },
    {
      entry: "reply_main_pix",
      body: "paguei",
      nodeId: "end_payment",
      status: "completed",
      visited: "proof_task",
    },
    {
      entry: "reply_main_pix",
      body: "comprovante",
      nodeId: "end_payment",
      status: "completed",
      visited: "proof_task",
    },
    {
      entry: "reply_demo",
      body: "sim",
      nodeId: "reply_buy",
      status: "waiting_reply",
      visited: "video2",
    },
    {
      entry: "reply_buy",
      body: "sim",
      nodeId: "reply_upsell_pix",
      status: "waiting_reply",
      visited: "upsell_pix",
    },
    {
      entry: "reply_upsell_pix",
      body: "paguei",
      nodeId: "end_payment",
      status: "completed",
      visited: "upsell_task",
    },
  ])("ramos reais após a etapa $entry: $body", ({ entry, body, nodeId, status, visited }) => {
    // Seed explícito de um snapshot serializável: a referência tem uma aresta
    // ausente em ask_delivery. O fixture permanece48/97; este ensaio cobre o
    // subgrafo posterior sem fingir que o caminho desde start está íntegro.
    const initial = createSession(fixture.flow.graph, { context: { contact: { name: "Ana" } } });
    let session = stepUntilBlocked({
      ...initial,
      status: "running",
      currentNodeId: entry,
      visitedNodeIds: [entry],
    });
    session = stepUntilBlocked(dispatch(session, { type: "reply", body }));
    if (session.status === "waiting_time")
      session = stepUntilBlocked(dispatch(session, { type: "advance" }));
    expect(session).toMatchObject({ status, currentNodeId: nodeId, diagnostic: null });
    expect(session.visitedNodeIds).toContain(visited);
    if (visited === "proof_task" || visited === "upsell_task") {
      expect(session.transcript.some((message) => message.task && message.simulated)).toBe(true);
      expect(session.outcome).toBe("exhausted");
      expect(
        session.transcript.some((message) =>
          message.body.toLowerCase().includes("pagamento aprovado"),
        ),
      ).toBe(false);
    }
  });
});
