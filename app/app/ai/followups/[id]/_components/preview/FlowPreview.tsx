"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import type { PreviewMediaOrigins } from "@/lib/followup/preview/media-url";
import type { PreviewSession } from "@/lib/followup/preview/types";
import { RESULTADOS_DO_FIM } from "@/lib/followup/vocabulario";
import {
  CaretDown,
  ChatCircle,
  CheckCircle,
  Clock,
  GitBranch,
  Info,
  PaperPlaneTilt,
  Pause,
  Play,
  Warning,
  X,
} from "@/lib/ui/icons";

import { formatPreviewDuration, PreviewControls } from "./PreviewControls";
import { PreviewTranscript } from "./PreviewTranscript";
import { useFlowPreview } from "./useFlowPreview";

interface Props {
  graph: FlowGraph;
  origins?: PreviewMediaOrigins;
  cancelOnReply?: boolean;
  handoffPolicy?: "pause" | "cancel" | "allow";
  onSessionChange: (session: PreviewSession) => void;
  onLocateNode: (nodeId: string) => void;
  onClose: () => void;
}

const STATUS: Record<PreviewSession["status"], string> = {
  ready: "Pronta para iniciar",
  running: "Executando",
  paused: "Pausada",
  waiting_reply: "Aguardando resposta",
  waiting_time: "Aguardando prazo",
  completed: "Concluída",
  unsupported: "Etapa não suportada",
  error: "Prévia interrompida",
  stopped: "Encerrada",
};

// Pessoa: quem revisou o rascunho e quer experimentar a conversa. Verbo: ensaiar.
// Domínio: fala, resposta, ramo, espera, tarefa, desfecho. A assinatura é o par
// conversa/etapa, com retorno direto ao canvas. Sage, greige, superfície, borda
// e estados semânticos vêm do app; sem moldura de telefone, gradiente ou cards
// de métricas. Conversa em 14px, título 16px/600, metadados 12px, ritmo de 4px.
export function FlowPreview({
  graph,
  origins,
  cancelOnReply,
  handoffPolicy,
  onSessionChange,
  onLocateNode,
  onClose,
}: Props) {
  const t = useT();
  const id = useId();
  const [contactName, setContactName] = useState("Ana");
  const [body, setBody] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const replyInput = useRef<HTMLTextAreaElement>(null);
  const wasNearBottom = useRef(true);
  const preview = useFlowPreview({
    graph,
    contactName,
    cancelOnReply,
    handoffPolicy,
    onSessionChange,
  });
  const { session, startedAtMs } = preview;
  const ready = session.status === "ready";
  const waiting = session.status === "waiting_reply" || session.status === "waiting_time";
  const active = waiting || session.status === "running" || session.status === "paused";
  const canReply = waiting;
  const problem = session.status === "unsupported" || session.status === "error";
  const currentNode = session.graphSnapshot?.nodes.find(
    (node) => node.id === session.currentNodeId,
  );
  const StatusIcon = problem
    ? Warning
    : session.status === "paused"
      ? Pause
      : session.status === "completed"
        ? CheckCircle
        : waiting
          ? Clock
          : Play;
  const statusColor = problem
    ? "text-error-fg"
    : waiting
      ? "text-info-fg"
      : session.status === "completed"
        ? "text-success-fg"
        : "text-text-muted";

  useEffect(() => {
    const area = viewport.current;
    if (area && wasNearBottom.current) area.scrollTop = area.scrollHeight;
  }, [session.transcript.length]);

  const restart = () => {
    setBody("");
    wasNearBottom.current = true;
    preview.restart();
  };
  const submit = () => {
    if (!canReply || !body.trim()) return;
    preview.reply(body.trim());
    setBody("");
    wasNearBottom.current = true;
    replyInput.current?.focus();
  };

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface text-text"
      aria-labelledby={`${id}-title`}
      data-testid="flow-preview"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-base font-semibold tracking-tight">
            {t("Prévia da conversa")}
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">{t("Rascunho · simulação local")}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={t("Fechar prévia")}
          onClick={() => {
            preview.stop();
            onClose();
          }}
        >
          <X size={18} aria-hidden />
        </Button>
      </header>

      <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
        {ready ? (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-contact`} className="text-xs text-text-muted">
              {t("Nome do contato fictício")}
            </Label>
            <Input
              id={`${id}-contact`}
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              maxLength={80}
              autoComplete="off"
            />
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-sm font-semibold text-text-muted"
              aria-hidden
            >
              {(contactName.trim() || "Ana").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{contactName.trim() || "Ana"}</p>
              <p className="text-xs text-text-muted">{t("Contato fictício")}</p>
            </div>
            <span className="ml-auto shrink-0 rounded-sm bg-surface-elevated px-2 py-1 text-[11px] font-medium text-text-muted">
              {t("Ensaio")}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={`flex items-center gap-1.5 text-xs font-medium ${statusColor}`}
          >
            <StatusIcon size={14} aria-hidden />
            {t(STATUS[session.status])}
          </p>
          <span
            className="shrink-0 text-right text-xs text-text-muted"
            title={t("Tempo virtual decorrido")}
          >
            <span className="sr-only">{t("Tempo virtual decorrido")}: </span>
            <span className="font-mono tabular-nums" data-testid="preview-virtual-clock">
              +{formatPreviewDuration(session.virtualNowMs - startedAtMs)}
            </span>
          </span>
        </div>
        {currentNode && !problem && (
          <button
            type="button"
            className="flex min-h-8 w-full items-center gap-1.5 rounded-sm text-left text-xs text-text-muted hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden"
            onClick={() => onLocateNode(currentNode.id)}
            aria-label={`${t("Localizar etapa atual")}: ${currentNode.label}`}
          >
            <GitBranch size={14} aria-hidden className="shrink-0" />
            <span className="truncate">{currentNode.label}</span>
          </button>
        )}
      </div>

      <div
        ref={viewport}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5"
        onScroll={(event) => {
          const area = event.currentTarget;
          wasNearBottom.current = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
        }}
      >
        {ready ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-2 py-6 text-center">
            <ChatCircle size={32} aria-hidden className="mb-4 text-accent" />
            <h3 className="text-lg font-semibold tracking-tight">
              {t("Veja o fluxo como cliente")}
            </h3>
            <p className="mt-2 max-w-64 text-sm leading-relaxed text-text-muted">
              {t("Percorra as mensagens, teste respostas e avance as esperas.")}
            </p>
            <Button type="button" className="mt-5" onClick={preview.start} autoFocus>
              <Play size={16} aria-hidden />
              {t("Iniciar prévia")}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <PreviewTranscript
              messages={session.transcript}
              contactName={contactName.trim() || "Ana"}
              startedAtMs={startedAtMs}
              origins={origins}
              onLocateNode={onLocateNode}
            />
            {problem && session.diagnostic && (
              <div
                className="space-y-3 rounded-md border border-error/20 bg-error-bg p-4"
                data-testid="preview-diagnostic"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-error-fg">
                  <Warning size={18} aria-hidden />
                  {t(STATUS[session.status])}
                </p>
                <p className="text-sm leading-relaxed text-error-fg">
                  {t(session.diagnostic.message)}
                </p>
                {session.diagnostic.nodeId && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onLocateNode(session.diagnostic!.nodeId!)}
                  >
                    {t("Ir para etapa")}
                  </Button>
                )}
              </div>
            )}
            {session.status === "completed" && (
              <div className="rounded-md bg-success-bg p-3 text-sm text-success-fg">
                <p className="font-medium">{t("Percurso concluído")}</p>
                {session.outcome && (
                  <p className="mt-1 text-xs">
                    {t("Resultado simulado")}:{" "}
                    {t(
                      RESULTADOS_DO_FIM[session.outcome as keyof typeof RESULTADOS_DO_FIM] ??
                        session.outcome,
                    )}
                  </p>
                )}
              </div>
            )}
            {session.status === "stopped" && (
              <p className="rounded-md bg-surface-elevated p-4 text-sm text-text-muted">
                {t("Ensaio encerrado. Reinicie para testar o rascunho atual.")}
              </p>
            )}
            {session.trace.length > 0 && (
              <details className="group border-t border-border pt-3">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-sm text-xs font-medium text-text-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden">
                  <span>{t("Histórico de decisões")}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono tabular-nums">{session.trace.length}</span>
                    <CaretDown
                      size={14}
                      aria-hidden
                      className="transition-transform group-open:rotate-180"
                    />
                  </span>
                </summary>
                <ol className="mt-3 space-y-3" aria-label={t("Decisões da prévia")}>
                  {session.trace.map((event) => {
                    const node = session.graphSnapshot?.nodes.find(
                      (candidate) => candidate.id === event.nodeId,
                    );
                    return (
                      <li key={event.id} className="border-l border-border pl-3">
                        <div className="flex items-center gap-2 text-[11px] text-text-muted">
                          <span className="font-mono tabular-nums">
                            #{event.ordinal} · +{formatPreviewDuration(event.atMs - startedAtMs)}
                          </span>
                          {node && <span className="truncate">{node.label}</span>}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-text">{t(event.message)}</p>
                        {event.details && (
                          <details className="mt-1">
                            <summary className="cursor-pointer py-1 text-xs text-text-muted">
                              {t("Detalhes")}
                            </summary>
                            <pre className="mt-1 overflow-x-auto rounded-sm bg-bg p-2 text-[11px] break-words whitespace-pre-wrap text-text-muted">
                              {JSON.stringify(event.details, null, 2)}
                            </pre>
                          </details>
                        )}
                        {event.nodeId && (
                          <Button
                            type="button"
                            variant="link"
                            className="mt-1 min-h-8 text-xs"
                            aria-label={`${t("Ir para etapa")}: ${node?.label ?? event.nodeId}`}
                            onClick={() => onLocateNode(event.nodeId!)}
                          >
                            {t("Ir para etapa")}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </details>
            )}
          </div>
        )}
      </div>

      <footer className="shrink-0 space-y-3 border-t border-border bg-surface px-4 py-3">
        {!ready && (
          <PreviewControls
            session={session}
            onPause={preview.pause}
            onResume={preview.resume}
            onAdvance={preview.advance}
            onRestart={restart}
            onStop={preview.stop}
          />
        )}
        {!ready && (active || session.status === "completed") && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="space-y-2"
          >
            <Label htmlFor={`${id}-reply`} className="text-xs text-text-muted">
              {t("Resposta do contato fictício")}
            </Label>
            <div className="flex items-end gap-2">
              <Textarea
                ref={replyInput}
                id={`${id}-reply`}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={!canReply}
                maxLength={10_000}
                rows={2}
                className="min-h-20 resize-none px-3 py-2"
                placeholder={
                  session.status === "paused"
                    ? t("Continue a prévia para responder")
                    : session.status === "running"
                      ? t("Aguarde a próxima etapa para responder")
                      : t("Escreva como cliente…")
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!canReply || !body.trim()}
                aria-label={t("Enviar resposta")}
              >
                <PaperPlaneTilt size={18} aria-hidden />
              </Button>
            </div>
          </form>
        )}
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-text-muted">
          <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            {t("Simulação local. Não envia mensagens, cria tarefas ou confirma pagamentos.")}
          </span>
        </p>
      </footer>
    </section>
  );
}
