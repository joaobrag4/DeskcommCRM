import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FlowGraph, FlowNode } from "@/lib/followup/graph-schema";
import type { PreviewSession } from "@/lib/followup/preview/types";

import { FlowPreview } from "./FlowPreview";

function graph(body = "Olá {{primeiro_nome}}! Quer continuar?"): FlowGraph {
  const nodes: FlowNode[] = [
    { id: "start", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
    {
      id: "send",
      type: "action",
      label: "Apresentação",
      position: { x: 0, y: 100 },
      config: { mode: "text", body },
    },
    {
      id: "reply",
      type: "match_reply",
      label: "Decisão",
      position: { x: 0, y: 200 },
      config: {
        branches: [{ id: "yes", label: "Sim", op: "eq", pattern: "sim" }],
        grace_timeout_ms: 900_000,
      },
    },
    {
      id: "end",
      type: "end",
      label: "Fim",
      position: { x: 0, y: 300 },
      config: { outcome: "exhausted" },
    },
  ];
  return {
    nodes,
    edges: [
      { id: "e0", source: "start", target: "send", condition: { type: "always" }, priority: 0 },
      { id: "e1", source: "send", target: "reply", condition: { type: "always" }, priority: 0 },
      {
        id: "e2",
        source: "reply",
        target: "end",
        condition: { type: "branch", branch_id: "yes" },
        priority: 1,
      },
      { id: "e3", source: "reply", target: "end", condition: { type: "always" }, priority: 0 },
    ],
  };
}

function props(input = graph()) {
  return {
    graph: input,
    onSessionChange: vi.fn<(session: PreviewSession) => void>(),
    onLocateNode: vi.fn(),
    onClose: vi.fn(),
  };
}

function advance(ms = 2_000) {
  act(() => vi.advanceTimersByTime(ms));
}

describe("prévia de conversa no editor", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("começa vazia e usa somente o contato fictício, sem requests nem persistência", () => {
    const request = vi.spyOn(globalThis, "fetch");
    const persist = vi.spyOn(Storage.prototype, "setItem");
    const input = props();
    render(<FlowPreview {...input} />);

    expect(screen.getByRole("button", { name: "Iniciar prévia" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Iniciar prévia" })).toHaveFocus();
    expect(screen.queryByText("Olá Ana! Quer continuar?")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome do contato fictício"), {
      target: { value: "Marina Silva" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar prévia" }));
    advance();

    expect(screen.getByText("Olá Marina! Quer continuar?")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Aguardando resposta");
    expect(request).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(input.onSessionChange.mock.lastCall?.[0].status).toBe("waiting_reply");
  });

  it("envia a resposta como cliente e mantém uma única mensagem depois de pausar e continuar", () => {
    render(<FlowPreview {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar prévia" }));
    advance();
    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    const clock = screen.getByTestId("preview-virtual-clock").textContent;
    advance(10_000);
    expect(screen.getByTestId("preview-virtual-clock")).toHaveTextContent(clock!);
    expect(screen.getByLabelText("Resposta do contato fictício")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.change(screen.getByLabelText("Resposta do contato fictício"), {
      target: { value: "sim" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar resposta" }));
    advance();

    expect(screen.getByText("sim")).toBeInTheDocument();
    expect(screen.getAllByText("Olá Ana! Quer continuar?")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Concluída");
  });

  it("conserva o snapshot durante o ensaio e reinicia com o rascunho mais recente", () => {
    const input = props();
    const view = render(<FlowPreview {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar prévia" }));
    view.rerender(<FlowPreview {...input} graph={graph("Mensagem revisada")} />);
    advance();
    expect(screen.getByText("Olá Ana! Quer continuar?")).toBeInTheDocument();
    expect(screen.queryByText("Mensagem revisada")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reiniciar" }));
    advance();
    expect(screen.getByText("Mensagem revisada")).toBeInTheDocument();
    expect(screen.queryByText("Olá Ana! Quer continuar?")).not.toBeInTheDocument();
  });

  it("avança o prazo virtual sem esperar e oferece o histórico com retorno ao nó", () => {
    const input = props();
    render(<FlowPreview {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar prévia" }));
    advance();
    fireEvent.click(screen.getByRole("button", { name: "Avançar até o próximo evento" }));
    advance();
    expect(screen.getByRole("status")).toHaveTextContent("Concluída");
    expect(screen.getByTestId("preview-virtual-clock")).toHaveTextContent("15min");

    fireEvent.click(screen.getByText("Histórico de decisões"));
    const history = screen.getByRole("list", { name: "Decisões da prévia" });
    const buttons = within(history).getAllByRole("button", { name: /Ir para etapa/ });
    fireEvent.click(buttons[0]!);
    expect(input.onLocateNode).toHaveBeenCalled();
  });

  it("expõe limitações antes do início e aponta a etapa que precisa de revisão", () => {
    const unsupported = graph();
    unsupported.nodes[1] = {
      id: "send",
      type: "action",
      label: "Mensagem com IA",
      position: { x: 0, y: 100 },
      config: { mode: "ai_message", prompt_hint: "Olá" },
    };
    const input = props(unsupported);
    render(<FlowPreview {...input} />);

    expect(screen.getByRole("status")).toHaveTextContent("Etapa não suportada");
    expect(screen.queryByRole("button", { name: "Iniciar prévia" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ir para etapa" }));
    expect(input.onLocateNode).toHaveBeenCalledWith("send");
  });

  it("encerrar cancela os timers e fechar devolve o controle ao editor", () => {
    const input = props();
    const view = render(<FlowPreview {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar prévia" }));
    advance(400);
    fireEvent.click(screen.getByRole("button", { name: "Encerrar" }));
    const calls = input.onSessionChange.mock.calls.length;
    advance(10_000);
    expect(screen.getByRole("status")).toHaveTextContent("Encerrada");
    expect(input.onSessionChange).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Fechar prévia" }));
    expect(input.onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("suspende a espera real durante a pausa e retoma o relógio sem saltar o tempo pausado", () => {
    const input = graph();
    input.nodes[2] = {
      id: "reply",
      type: "wait",
      label: "Espera curta",
      position: { x: 0, y: 200 },
      config: { mode: "fixed", duration_ms: 5_000 },
    };
    input.edges = input.edges.slice(0, 2).concat({
      id: "e2",
      source: "reply",
      target: "end",
      condition: { type: "always" },
      priority: 0,
    });
    render(<FlowPreview {...props(input)} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar prévia" }));
    advance();
    expect(screen.getByRole("status")).toHaveTextContent("Aguardando prazo");
    advance(1_000);
    expect(screen.getByTestId("preview-virtual-clock")).toHaveTextContent("+1s");
    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    advance(30_000);
    expect(screen.getByTestId("preview-virtual-clock")).toHaveTextContent("+1s");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    advance(1_000);
    expect(screen.getByTestId("preview-virtual-clock")).toHaveTextContent("+2s");
    fireEvent.click(screen.getByRole("button", { name: "Avançar até o próximo evento" }));
    advance();
    expect(screen.getByRole("status")).toHaveTextContent("Concluída");
    expect(screen.getByTestId("preview-virtual-clock")).toHaveTextContent("+5s");
  });

  it("mostra tarefa, prioridade, prazo e responsável como efeito simulado", () => {
    const input = graph();
    input.nodes[2] = {
      id: "reply",
      type: "internal_task",
      label: "Conferência",
      position: { x: 0, y: 200 },
      config: {
        titulo: "Conferir pedido de {{contact.name}}",
        prioridade: "high",
        vence_em_dias: 1,
        atribuir_a: "dono_do_lead",
      },
    };
    input.edges = input.edges.slice(0, 2).concat({
      id: "e2",
      source: "reply",
      target: "end",
      condition: { type: "always" },
      priority: 0,
    });
    render(<FlowPreview {...props(input)} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar prévia" }));
    advance();
    expect(screen.getByText("Tarefa simulada")).toBeInTheDocument();
    expect(screen.getByText("Conferir pedido de Ana")).toBeInTheDocument();
    expect(screen.getByText(/Prioridade: Alta/)).toBeInTheDocument();
    expect(screen.getByText(/Responsável: Dono do negócio/)).toBeInTheDocument();
    expect(
      screen.getByText("Esta tarefa não foi criada e não transfere a conversa."),
    ).toBeInTheDocument();
  });

  it("desmontar durante a execução descarta o único timer e não notifica uma sessão fechada", () => {
    const input = props();
    const view = render(<FlowPreview {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar prévia" }));
    advance(0);
    expect(vi.getTimerCount()).toBe(1);
    const calls = input.onSessionChange.mock.calls.length;
    view.unmount();
    advance(60_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(input.onSessionChange).toHaveBeenCalledTimes(calls);
  });

  it("renderiza o áudio e o vídeo produzidos pelo motor real como players nativos", () => {
    const input = graph();
    input.nodes[1] = {
      id: "send",
      type: "action",
      label: "Áudio",
      position: { x: 0, y: 100 },
      config: {
        mode: "text",
        body: "Ouça a apresentação",
        media_url: "https://example.invalid/saudacao.ogg",
      },
    };
    input.nodes.splice(2, 0, {
      id: "video",
      type: "action",
      label: "Demonstração",
      position: { x: 0, y: 150 },
      config: {
        mode: "text",
        body: "Veja a demonstração",
        media_url: "https://example.invalid/demonstracao.mp4",
      },
    });
    input.edges = input.nodes.slice(0, -1).map((node, index) => ({
      id: `e${index}`,
      source: node.id,
      target: input.nodes[index + 1]!.id,
      condition: { type: "always" },
      priority: 0,
    }));
    render(<FlowPreview {...props(input)} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar prévia" }));
    advance(3_000);

    const audio = screen.getByLabelText("saudacao.ogg");
    const video = screen.getByLabelText("demonstracao.mp4");
    expect(audio.tagName).toBe("AUDIO");
    expect(video.tagName).toBe("VIDEO");
    for (const player of [audio, video]) {
      expect(player).toHaveAttribute("controls");
      expect(player).toHaveAttribute("preload", "metadata");
      expect(player).not.toHaveAttribute("autoplay");
    }
  });

  it("só aceita resposta quando a etapa está aguardando e preserva o texto durante o avanço", () => {
    render(<FlowPreview {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar prévia" }));
    expect(screen.getByLabelText("Resposta do contato fictício")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar resposta" })).toBeDisabled();
    advance();
    const field = screen.getByLabelText("Resposta do contato fictício");
    expect(field).toBeEnabled();
    fireEvent.change(field, { target: { value: "texto em preparação" } });
    expect(screen.getByRole("button", { name: "Enviar resposta" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Avançar até o próximo evento" }));
    expect(field).toBeDisabled();
    expect(field).toHaveValue("texto em preparação");
  });
});
