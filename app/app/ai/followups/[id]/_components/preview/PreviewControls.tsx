"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import type { PreviewSession } from "@/lib/followup/preview/types";
import { ArrowsClockwise, Clock, Pause, Play, SkipForward } from "@/lib/ui/icons";

/** Tempo decorrido da sessão, sem alterar o relógio ou a configuração do fluxo. */
export function formatPreviewDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}min`;
  if (minutes) return `${minutes}min ${rest}s`;
  return `${rest}s`;
}

interface Props {
  session: PreviewSession;
  onPause: () => void;
  onResume: () => void;
  onAdvance: () => void;
  onRestart: () => void;
  onStop: () => void;
}

// Intenção: testar cadência com calma. O salto de prazo lidera só na espera;
// demais controles usam superfície neutra, borda sutil e passos de 4px do app.
export function PreviewControls({
  session,
  onPause,
  onResume,
  onAdvance,
  onRestart,
  onStop,
}: Props) {
  const t = useT();
  const waiting = session.status === "waiting_time" || session.status === "waiting_reply";
  const active = waiting || session.status === "running" || session.status === "paused";
  if (session.status === "ready") return null;

  return (
    <div className="space-y-3" data-testid="preview-controls">
      {waiting && session.nextEventAtMs !== null && (
        <div className="space-y-2 rounded-md bg-info-bg p-3 text-info-fg">
          <p className="flex items-start gap-2 text-xs leading-relaxed">
            <Clock size={16} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              {session.status === "waiting_reply"
                ? t("Responda como cliente ou avance o prazo para testar o silêncio.")
                : t("O fluxo aguarda o prazo configurado.")}
              <span className="mt-1 block font-mono tabular-nums">
                {t("Próximo evento em")}{" "}
                {formatPreviewDuration(session.nextEventAtMs - session.virtualNowMs)}
              </span>
            </span>
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full whitespace-normal"
            onClick={onAdvance}
          >
            <SkipForward size={16} aria-hidden />
            {t("Avançar até o próximo evento")}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {active && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={session.status === "paused" ? onResume : onPause}
          >
            {session.status === "paused" ? (
              <Play size={16} aria-hidden />
            ) : (
              <Pause size={16} aria-hidden />
            )}
            {session.status === "paused" ? t("Continuar") : t("Pausar")}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onRestart}>
          <ArrowsClockwise size={16} aria-hidden />
          {t("Reiniciar")}
        </Button>
        {active && (
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onStop}>
            {t("Encerrar")}
          </Button>
        )}
      </div>
    </div>
  );
}
