import { renderizarTextoDeFollowup } from "@/lib/automation/texto-do-followup";

import { TETO_DE_PASSOS_DO_MOTOR } from "../custo-no-motor";
import { flowGraphSchema, NO_REPLY_BRANCH_ID, type FlowNode } from "../graph-schema";
import { processNode, selectEdge, type EnrollmentRow } from "../node-handlers";
import { advanceVirtualClock, nextVirtualDeadline } from "./clock";
import type {
  PreviewActiveStatus,
  PreviewDiagnostic,
  PreviewEvent,
  PreviewMessage,
  PreviewOptions,
  PreviewSession,
  PreviewTraceEvent,
} from "./types";

const MAX_TRACE = 2000;

function active(session: PreviewSession): boolean {
  return (
    session.status === "running" ||
    session.status === "waiting_reply" ||
    session.status === "waiting_time"
  );
}

function record(
  session: PreviewSession,
  event: Omit<PreviewTraceEvent, "id" | "ordinal" | "atMs" | "nodeId"> & { nodeId?: string | null },
): boolean {
  // Reserva o último lugar para a interrupção; nenhum registro anterior some.
  if (session.trace.length >= MAX_TRACE - 1) {
    fail(session, {
      code: "max_trace",
      message: "A trilha atingiu o limite de 2.000 eventos. Reinicie a prévia para continuar.",
      ...(session.currentNodeId ? { nodeId: session.currentNodeId } : {}),
    });
    return false;
  }
  const ordinal = session.trace.length + 1;
  session.trace.push({
    ...event,
    id: `trace-${ordinal}`,
    ordinal,
    atMs: session.virtualNowMs,
    nodeId: event.nodeId ?? session.currentNodeId,
  });
  return true;
}

function fail(session: PreviewSession, diagnostic: PreviewDiagnostic): void {
  session.status = diagnostic.code === "unsupported_node" ? "unsupported" : "error";
  session.diagnostic = diagnostic;
  session.nextEventAtMs = null;
  session.occupancy = null;
  session.pausedStatus = null;
  if (session.trace.length < MAX_TRACE) {
    const ordinal = session.trace.length + 1;
    session.trace.push({
      id: `trace-${ordinal}`,
      ordinal,
      atMs: session.virtualNowMs,
      kind: "error",
      nodeId: diagnostic.nodeId ?? session.currentNodeId,
      message: diagnostic.message,
      details: { code: diagnostic.code },
    });
  }
}

function unsupported(node: FlowNode): boolean {
  switch (node.type) {
    case "trigger":
    case "internal_task":
    case "http_request":
    case "interactive_menu":
    case "flow_connection":
    case "conversion_pixel":
    case "carousel":
      return false;
    case "action":
      return node.config.mode !== "text";
    case "wait":
      return node.config.mode === "smart";
    case "match_reply":
      return node.config.save_to !== undefined;
    case "end":
      return node.config.ao_finalizar !== undefined && node.config.ao_finalizar.tipo !== "nada";
    default:
      return true;
  }
}

function enter(session: PreviewSession, nodeId: string): void {
  session.currentNodeId = nodeId;
  session.status = "running";
  session.occupancy = null;
  session.nextEventAtMs = null;
  if (!session.visitedNodeIds.includes(nodeId)) session.visitedNodeIds.push(nodeId);
  const node = session.graphSnapshot?.nodes.find((n) => n.id === nodeId);
  record(session, {
    kind: "node",
    nodeId,
    message: node?.label ?? nodeId,
    details: { type: node?.type ?? "unknown" },
  });
}

export function createSession(graph: unknown, options: PreviewOptions = {}): PreviewSession {
  const session: PreviewSession = {
    graphSnapshot: null,
    options: structuredClone({ ...options, startAtMs: options.startAtMs ?? 0 }),
    status: "ready",
    currentNodeId: null,
    visitedNodeIds: [],
    traversedEdgeIds: [],
    trace: [],
    transcript: [],
    virtualNowMs: options.startAtMs ?? 0,
    nextEventAtMs: null,
    steps: 0,
    outcome: null,
    diagnostic: null,
    occupancy: null,
    pausedStatus: null,
    inboundSequence: 0,
    consumedInboundIds: [],
  };

  // Todas as entradas passam pelo mesmo contrato do editor/produção, inclusive
  // integridade de arestas. Um erro de configuração não vira envio parcial.
  const parsed = flowGraphSchema.safeParse(graph);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const raw = graph && typeof graph === "object" ? (graph as Record<string, unknown>) : {};
    const collection =
      first?.path[0] === "nodes" ? raw.nodes : first?.path[0] === "edges" ? raw.edges : null;
    const index = first?.path[1];
    const item =
      Array.isArray(collection) && typeof index === "number"
        ? (collection[index] as unknown)
        : null;
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const nodeId = first?.path[0] === "edges" ? row.source : row.id;
    if (typeof nodeId === "string") session.currentNodeId = nodeId;
    fail(session, {
      code: "invalid_graph",
      message: first?.message ?? "O grafo é inválido.",
      ...(typeof nodeId === "string" ? { nodeId } : {}),
    });
    return session;
  }
  session.graphSnapshot = structuredClone(parsed.data);
  if (!Number.isFinite(new Date(session.virtualNowMs).getTime())) {
    session.virtualNowMs = 0;
    fail(session, { code: "invalid_clock", message: "O início do relógio virtual é inválido." });
    return session;
  }
  if (parsed.data.nodes.filter((node) => node.type === "trigger").length !== 1) {
    fail(session, {
      code: "invalid_graph",
      message: "O fluxo precisa ter exatamente um nó de início.",
    });
    return session;
  }
  const unavailable = parsed.data.nodes.find(unsupported);
  if (unavailable) {
    session.currentNodeId = unavailable.id;
    fail(session, {
      code: "unsupported_node",
      nodeId: unavailable.id,
      message: `A etapa “${unavailable.label}” usa um tipo ou modo ainda não suportado na prévia local.`,
    });
  }
  return session;
}

function enrollment(session: PreviewSession): EnrollmentRow {
  return {
    id: "preview",
    organization_id: "preview",
    pointer_id: "preview",
    version_id: "preview",
    contact_id: "preview",
    conversation_id: null,
    current_node_id: session.currentNodeId ?? "",
    status:
      session.status === "waiting_reply"
        ? "waiting_reply"
        : session.occupancy?.immuneToReply
          ? "dormente"
          : "active",
    next_eval_at:
      session.nextEventAtMs === null ? null : new Date(session.nextEventAtMs).toISOString(),
    claimed_until: null,
    attempts: 0,
    max_attempts: 0,
    last_error: null,
    steps_taken: session.steps,
    outcome: null,
    cancel_reason: null,
    started_at: new Date(session.options.startAtMs ?? 0).toISOString(),
    completed_at: null,
    updated_at: new Date(session.occupancy?.startedAtMs ?? session.virtualNowMs).toISOString(),
  };
}

function render(session: PreviewSession, body: string): string {
  const context = session.options.context ?? {};
  const variables = [
    ...new Set(
      [...body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)]
        .filter((match) => renderizarTextoDeFollowup(match[0], context) === "")
        .map((match) => match[1]!),
    ),
  ];
  if (variables.length > 0)
    record(session, {
      kind: "warning",
      message: "Há variáveis sem valor no contato fictício.",
      details: { variables },
    });
  return renderizarTextoDeFollowup(body, context);
}

function media(url: string): Pick<PreviewMessage, "mediaUrl" | "filename"> {
  try {
    const filename = decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "");
    // PreviewMedia usa o classificador de produção para inferir o tipo pela
    // URL; "audio"/"video" não são MIME types e não podem sobrescrevê-lo.
    return { mediaUrl: url, filename };
  } catch {
    return { mediaUrl: url };
  }
}

function addMessage(
  session: PreviewSession,
  input: Omit<PreviewMessage, "id" | "atMs" | "simulated">,
  kind: "message" | "task" | "reply",
): boolean {
  if (
    !record(session, {
      kind,
      message:
        kind === "task"
          ? "Tarefa simulada; nenhuma tarefa foi criada e a conversa não foi transferida."
          : kind === "reply"
            ? "Resposta local recebida."
            : "Envio simulado; entrega pelo canal não verificada.",
    })
  )
    return false;
  session.transcript.push({
    ...input,
    id: `message-${session.transcript.length + 1}`,
    atMs: session.virtualNowMs,
    simulated: true,
  });
  return true;
}

function step(session: PreviewSession, replyBody?: string): void {
  const graph = session.graphSnapshot;
  const node = graph?.nodes.find((n) => n.id === session.currentNodeId);
  if (!graph || !node) {
    fail(session, {
      code: "node_failed",
      message: "A etapa atual não existe no snapshot do fluxo.",
    });
    return;
  }
  if (unsupported(node)) {
    fail(session, {
      code: "unsupported_node",
      nodeId: node.id,
      message: `A etapa “${node.label}” ainda não é suportada.`,
    });
    return;
  }
  // Igual a engine.ts: o tick não começa quando o contador JÁ excedeu o teto.
  if (session.steps > TETO_DE_PASSOS_DO_MOTOR) {
    fail(session, {
      code: "max_steps",
      nodeId: node.id,
      message: "A prévia atingiu o teto de passos do motor. Verifique ciclos no fluxo.",
    });
    return;
  }

  if (node.type === "interactive_menu") {
    if (session.occupancy?.phase !== "waiting") {
      const optionsText = node.config.options.map((o) => `🔘 ${o.title}`).join("\n");
      const menuBody = `${node.config.header ? `${node.config.header}\n\n` : ""}${render(session, node.config.body)}\n\n${optionsText}${node.config.footer ? `\n\n_${node.config.footer}_` : ""}`;
      addMessage(session, {
        nodeId: node.id,
        direction: "outbound",
        body: menuBody,
      }, "message");
      session.steps++;
      session.occupancy = {
        nodeId: node.id,
        phase: "waiting",
        startedAtMs: session.virtualNowMs,
        immuneToReply: false,
      };
      session.status = "waiting_reply";
      session.nextEventAtMs = session.virtualNowMs + node.config.timeout_ms;
      return;
    }

    if (replyBody !== undefined) {
      const clean = replyBody.trim().toLowerCase();
      const matched = node.config.options.find(
        (opt) => opt.title.toLowerCase() === clean || opt.id.toLowerCase() === clean,
      );
      const targetBranchId = matched ? matched.id : NO_REPLY_BRANCH_ID;
      const branchEdge = selectEdge(graph.edges, node.id, { type: "branch", branch_id: targetBranchId })
        ?? selectEdge(graph.edges, node.id, { type: "always" });
      if (branchEdge) {
        session.traversedEdgeIds.push(branchEdge.id);
        enter(session, branchEdge.target);
        return;
      }
    }
  }
  const nextAlways = selectEdge(graph.edges, node.id, { type: "always" });
  // O handler devolve só o alvo. Alvos opacos preservam a identidade da aresta
  // escolhida, mesmo quando duas arestas levam ao mesmo nó. A decisão continua
  // INTEIRA em processNode/selectEdge: sem outra implementação de eq/fallback.
  const projectedEdges = graph.edges.map((edge, index) => ({
    ...edge,
    target: `preview-edge:${index}`,
  }));
  const result = processNode({
    node,
    edges: projectedEdges,
    enrollment: enrollment(session),
    lead: { lead_stage: null, tags: [], steps_taken: session.steps, last_outcome: null },
    clock: () => new Date(session.virtualNowMs),
    waitElapsed: session.occupancy?.phase === "waiting",
    wokeEarly: replyBody !== undefined,
    ...(replyBody !== undefined ? { lastInboundBody: replyBody } : {}),
    actionCompleted: session.occupancy?.phase === "action_sent",
    actionEnqueued: session.occupancy?.phase === "action_sent",
    proximo: nextAlways ? (graph.nodes.find((n) => n.id === nextAlways.target) ?? null) : null,
  });

  switch (result.kind) {
    case "enqueue_turn": {
      if (
        node.type !== "action" ||
        node.config.mode !== "text" ||
        result.purpose !== "send_message"
      ) {
        fail(session, {
          code: "unsupported_node",
          nodeId: node.id,
          message: "Esta etapa exige uma integração externa não disponível na prévia.",
        });
        return;
      }
      const body = render(session, node.config.body);
      if (!active(session)) return;
      if (
        !addMessage(
          session,
          {
            nodeId: node.id,
            direction: "outbound",
            body,
            ...(node.config.media_url ? media(node.config.media_url) : {}),
          },
          "message",
        )
      )
        return;
      session.steps++;
      session.occupancy = {
        nodeId: node.id,
        phase: "action_sent",
        startedAtMs: session.virtualNowMs,
        immuneToReply: false,
      };
      return;
    }
    case "wait": {
      const deadline = result.next_eval_at.getTime();
      if (!Number.isFinite(deadline)) {
        fail(session, {
          code: "invalid_clock",
          nodeId: node.id,
          message: "O prazo virtual desta etapa excede o relógio suportado.",
        });
        return;
      }
      if (
        !record(session, {
          kind: "wait",
          message:
            node.type === "match_reply"
              ? "Aguardando resposta ou vencimento do prazo virtual."
              : "Aguardando prazo virtual.",
          details: { nextEventAtMs: deadline, immuneToReply: result.wake_status === "dormente" },
        })
      )
        return;
      session.steps++;
      session.status = node.type === "match_reply" ? "waiting_reply" : "waiting_time";
      session.nextEventAtMs = deadline;
      session.occupancy = {
        nodeId: node.id,
        phase: "waiting",
        startedAtMs: session.virtualNowMs,
        immuneToReply: result.wake_status === "dormente",
      };
      return;
    }
    case "advance": {
      const selected = graph.edges[Number(result.next_node_id.slice("preview-edge:".length))];
      if (!selected || !result.next_node_id.startsWith("preview-edge:")) {
        fail(session, {
          code: "node_failed",
          nodeId: node.id,
          message: "A decisão da etapa não encontrou uma aresta válida.",
        });
        return;
      }
      if (node.type === "internal_task") {
        const task = { ...node.config, titulo: render(session, node.config.titulo) };
        if (!active(session)) return;
        if (
          !addMessage(
            session,
            { nodeId: node.id, direction: "system", body: task.titulo, task },
            "task",
          )
        )
          return;
      }
      if (node.type === "http_request") {
        if (!active(session)) return;
        addMessage(
          session,
          { nodeId: node.id, direction: "system", body: `🌐 [HTTP ${node.config.method}] ${node.config.url || "sem URL"} → 200 OK` },
          "task",
        );
      }
      if (node.type === "conversion_pixel") {
        if (!active(session)) return;
        addMessage(
          session,
          { nodeId: node.id, direction: "system", body: `🎯 [Pixel] Evento "${node.config.event_name}" (${node.config.provider})` },
          "task",
        );
      }
      if (node.type === "carousel") {
        if (!active(session)) return;
        const cardsBody = node.config.cards
          .map((c) => `🎠 *${c.title}*\n${c.description ?? ""}${(c.buttons ?? []).map((b) => `\n[ ${b.label} ]`).join("")}`)
          .join("\n\n");
        addMessage(session, { nodeId: node.id, direction: "outbound", body: cardsBody }, "message");
      }
      if (
        !record(session, {
          kind: "edge",
          edgeId: selected.id,
          message: "Ramo selecionado pelo motor do fluxo.",
          details: {
            source: selected.source,
            target: selected.target,
            condition: selected.condition,
            priority: selected.priority,
            reason:
              replyBody !== undefined
                ? "reply"
                : session.occupancy?.phase === "waiting"
                  ? "deadline"
                  : "advance",
          },
        })
      )
        return;
      session.steps++;
      session.traversedEdgeIds.push(selected.id);
      enter(session, selected.target);
      return;
    }
    case "complete": {
      if (node.type === "flow_connection") {
        if (!active(session)) return;
        addMessage(
          session,
          { nodeId: node.id, direction: "system", body: `🔀 [Conexão] Lead transferido para o fluxo ${node.config.target_flow_id || "(não definido)"}` },
          "task",
        );
      }
      if (
        !record(session, {
          kind: "complete",
          message: "Prévia concluída conforme o fim configurado.",
          details: {
            outcome: result.outcome,
            note: node.type === "end" ? (node.config.note ?? null) : null,
          },
        })
      )
        return;
      session.steps++;
      session.status = "completed";
      session.outcome = result.outcome;
      session.nextEventAtMs = null;
      session.occupancy = null;
      return;
    }
    case "fail":
      fail(session, { code: "node_failed", nodeId: node.id, message: result.error });
      return;
    case "dead":
      fail(session, { code: "node_failed", nodeId: node.id, message: result.reason });
      return;
    case "recheck":
      fail(session, {
        code: "node_failed",
        nodeId: node.id,
        message: "A conclusão simulada desta etapa não foi reconhecida pelo motor.",
      });
  }
}

/** Redutor puro: sem timers, relógio global, rede, persistência ou credenciais. */
export function dispatch(previous: PreviewSession, event: PreviewEvent): PreviewSession {
  if (event.type === "restart") {
    return dispatch(createSession(previous.graphSnapshot, previous.options), { type: "start" });
  }
  const session = structuredClone(previous);
  if (event.type === "start") {
    if (session.status !== "ready" || !session.graphSnapshot) return previous;
    const trigger = session.graphSnapshot.nodes.find((n) => n.type === "trigger");
    if (trigger) enter(session, trigger.id);
    return session;
  }
  if (event.type === "resume") {
    if (session.status !== "paused" || !session.pausedStatus) return previous;
    session.status = session.pausedStatus;
    session.pausedStatus = null;
    record(session, {
      kind: "resume",
      message: "Prévia retomada na mesma etapa e no mesmo horário virtual.",
    });
    return session;
  }
  if (event.type === "stop") {
    if (!active(session) && session.status !== "paused" && session.status !== "ready")
      return previous;
    if (!record(session, { kind: "stop", message: "Prévia encerrada pelo operador." }))
      return session;
    session.status = "stopped";
    session.nextEventAtMs = null;
    session.occupancy = null;
    session.pausedStatus = null;
    return session;
  }
  if (!active(session)) return previous;
  switch (event.type) {
    case "pause":
      session.pausedStatus = session.status as PreviewActiveStatus;
      if (record(session, { kind: "pause", message: "Prévia pausada; relógio virtual congelado." }))
        session.status = "paused";
      break;
    case "step":
      if (session.status === "running") step(session);
      break;
    case "tick":
    case "advance": {
      const next =
        event.type === "tick"
          ? advanceVirtualClock(session.virtualNowMs, event.elapsedMs)
          : nextVirtualDeadline(session.virtualNowMs, session.nextEventAtMs);
      if (next === null || next === session.virtualNowMs) return previous;
      session.virtualNowMs = next;
      if (session.nextEventAtMs !== null && next >= session.nextEventAtMs) {
        if (
          record(session, {
            kind: "clock",
            message: "Prazo virtual alcançado.",
            details: { previousAtMs: previous.virtualNowMs, nextEventAtMs: session.nextEventAtMs },
          })
        )
          step(session);
      }
      break;
    }
    case "reply": {
      const body = event.body.trim();
      if (!body || !session.currentNodeId) return previous;
      if (
        !addMessage(session, { nodeId: session.currentNodeId, direction: "inbound", body }, "reply")
      )
        return session;
      session.inboundSequence++;
      // Mesmo ignorada por imunidade, esta entrada já pertence a ESTA etapa.
      session.consumedInboundIds.push(`inbound-${session.inboundSequence}`);
      if (session.occupancy?.immuneToReply) {
        record(session, {
          kind: "warning",
          message: "Esta espera é imune à resposta; o prazo foi preservado.",
          details: { reason: "immune_to_reply" },
        });
        break;
      }
      if (session.options.cancelOnReply) {
        if (
          !record(session, {
            kind: "complete",
            message: "A resposta encerrou o fluxo conforme sua configuração.",
            details: { reason: "cancel_on_reply", outcome: "replied" },
          })
        )
          break;
        session.status = "completed";
        session.outcome = "replied";
        session.nextEventAtMs = null;
        session.occupancy = null;
        break;
      }
      if (session.occupancy?.phase === "waiting") step(session, body);
      break;
    }
  }
  return session;
}
