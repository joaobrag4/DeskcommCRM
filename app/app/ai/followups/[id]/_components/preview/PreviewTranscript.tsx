"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import type { PreviewMediaOrigins } from "@/lib/followup/preview/media-url";
import type { PreviewSession } from "@/lib/followup/preview/types";
import { Bell } from "@/lib/ui/icons";
import { PRIORIDADES_DA_TAREFA } from "@/lib/followup/vocabulario";

import { formatPreviewDuration } from "./PreviewControls";
import { PreviewMedia } from "./PreviewMedia";

interface Props {
  messages: PreviewSession["transcript"];
  contactName: string;
  startedAtMs: number;
  origins?: PreviewMediaOrigins;
  onLocateNode: (nodeId: string) => void;
}

// Intenção: ler como cliente. Balões, autoria escrita e tempo mono distinguem
// falas; tarefas ficam na superfície neutra, fora da voz da automação.
export function PreviewTranscript({
  messages,
  contactName,
  startedAtMs,
  origins,
  onLocateNode,
}: Props) {
  const t = useT();
  return (
    <ol className="space-y-5" aria-label={t("Conversa simulada")} data-testid="preview-transcript">
      {messages.map((message) => {
        const inbound = message.direction === "inbound";
        const system = message.direction === "system";
        return (
          <li
            key={message.id}
            className={`flex min-w-0 ${inbound ? "justify-end" : "justify-start"}`}
          >
            <div className={`min-w-0 ${system ? "w-full" : "max-w-[92%]"}`}>
              <div
                className={`mb-1.5 flex items-center gap-2 text-xs text-text-muted ${inbound ? "justify-end" : ""}`}
              >
                <span className="font-medium">
                  {system ? t("Efeito simulado") : inbound ? contactName : t("Automação")}
                </span>
                <span className="font-mono text-[11px] tabular-nums">
                  +{formatPreviewDuration(message.atMs - startedAtMs)}
                </span>
              </div>
              <div
                className={`space-y-3 rounded-lg px-4 py-3 text-sm leading-relaxed ${system ? "border border-border bg-surface-elevated text-text" : inbound ? "rounded-tr-sm bg-accent-soft text-text" : "rounded-tl-sm border border-border bg-surface text-text"}`}
              >
                {message.task ? (
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-semibold text-text-muted">
                      <Bell size={16} aria-hidden />
                      {t("Tarefa simulada")}
                    </p>
                    <p className="font-medium break-words">{message.task.titulo}</p>
                    <p className="text-xs text-text-muted">
                      {t("Prioridade")}: {t(PRIORIDADES_DA_TAREFA[message.task.prioridade])}
                      {" · "}
                      {t("Prazo")}: {message.task.vence_em_dias} {t("dias")}
                    </p>
                    <p className="text-xs text-text-muted">
                      {t("Responsável")}:{" "}
                      {message.task.atribuir_a === "dono_do_lead"
                        ? t("Dono do negócio")
                        : t("Pessoa configurada no fluxo")}
                    </p>
                    <p className="text-xs text-text-muted">
                      {t("Esta tarefa não foi criada e não transfere a conversa.")}
                    </p>
                  </div>
                ) : message.body ? (
                  <p className="[overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                    {message.body}
                  </p>
                ) : null}
                {message.mediaUrl && (
                  <PreviewMedia
                    mediaUrl={message.mediaUrl}
                    mediaType={message.mediaType}
                    filename={message.filename}
                    origins={origins}
                  />
                )}
              </div>
              {system && (
                <Button
                  type="button"
                  variant="link"
                  className="mt-2 min-h-8 text-xs"
                  onClick={() => onLocateNode(message.nodeId)}
                >
                  {t("Ir para etapa")}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
