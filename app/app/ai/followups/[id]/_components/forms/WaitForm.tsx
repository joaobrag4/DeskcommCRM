"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { waitConfigSchema } from "@/lib/followup/graph-schema";
import { MODOS_DE_ESPERA, opcoes } from "@/lib/followup/vocabulario";
import { useT } from "@/hooks/i18n/useT";

import { msToMin, minToMs, type ConfigOf } from "./shared";

type ModoDeEspera = ConfigOf<"wait">["mode"];
type WaitUnit = "seconds" | "minutes";

const DIAS_DA_SEMANA = [
  { dia: 1, rotulo: "Seg" },
  { dia: 2, rotulo: "Ter" },
  { dia: 3, rotulo: "Qua" },
  { dia: 4, rotulo: "Qui" },
  { dia: 5, rotulo: "Sex" },
  { dia: 6, rotulo: "Sáb" },
  { dia: 0, rotulo: "Dom" },
];

export function WaitForm({
  config,
  onChange,
}: {
  config: ConfigOf<"wait">;
  onChange: (c: ConfigOf<"wait">) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<ModoDeEspera>(config.mode);
  const [durationUnit, setDurationUnit] = useState<WaitUnit>(
    config.mode === "fixed" && config.duration_ms < 60_000 ? "seconds" : "minutes",
  );
  const [durationValue, setDurationValue] = useState(
    config.mode === "fixed"
      ? config.duration_ms < 60_000
        ? Math.round(config.duration_ms / 1_000)
        : msToMin(config.duration_ms)
      : 10,
  );
  const [minMin, setMinMin] = useState(config.mode === "smart" ? msToMin(config.min_ms) : 5);
  const [maxMin, setMaxMin] = useState(config.mode === "smart" ? msToMin(config.max_ms) : 60);
  const [guidance, setGuidance] = useState(config.mode === "smart" ? (config.guidance ?? "") : "");

  // Smart modes state
  const [startTime, setStartTime] = useState(config.mode === "business_hours" ? config.start_time : "09:00");
  const [endTime, setEndTime] = useState(config.mode === "business_hours" ? config.end_time : "18:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    config.mode === "business_hours" ? config.days_of_week : [1, 2, 3, 4, 5],
  );
  const [targetTime, setTargetTime] = useState(config.mode === "time_of_day" ? config.target_time : "09:00");
  const [delayDays, setDelayDays] = useState(config.mode === "time_of_day" ? config.delay_days : 0);
  const [businessDaysCount, setBusinessDaysCount] = useState(config.mode === "business_days" ? config.days : 1);
  const [deliverAt, setDeliverAt] = useState(config.mode === "business_days" ? (config.deliver_at ?? "09:00") : "09:00");
  const [immuneToReply, setImmuneToReply] = useState<boolean>(
    "immune_to_reply" in config ? config.immune_to_reply === true : false,
  );
  const [error, setError] = useState<string | null>(null);

  const commit = (overrides?: Partial<{
    mode: ModoDeEspera;
    durationValue: number;
    durationUnit: WaitUnit;
    minMin: number;
    maxMin: number;
    guidance: string;
    startTime: string;
    endTime: string;
    daysOfWeek: number[];
    targetTime: string;
    delayDays: number;
    businessDaysCount: number;
    deliverAt: string;
    immuneToReply: boolean;
  }>) => {
    const curMode = overrides?.mode ?? mode;
    const curDurVal = overrides?.durationValue ?? durationValue;
    const curDurUnit = overrides?.durationUnit ?? durationUnit;
    const curMin = overrides?.minMin ?? minMin;
    const curMax = overrides?.maxMin ?? maxMin;
    const curGuidance = overrides?.guidance ?? guidance;
    const curStart = overrides?.startTime ?? startTime;
    const curEnd = overrides?.endTime ?? endTime;
    const curDays = overrides?.daysOfWeek ?? daysOfWeek;
    const curTargetTime = overrides?.targetTime ?? targetTime;
    const curDelayDays = overrides?.delayDays ?? delayDays;
    const curBDays = overrides?.businessDaysCount ?? businessDaysCount;
    const curDeliverAt = overrides?.deliverAt ?? deliverAt;
    const curImmune = overrides?.immuneToReply ?? immuneToReply;

    let candidate: unknown;
    if (curMode === "fixed") {
      candidate = {
        mode: "fixed" as const,
        duration_ms: curDurUnit === "seconds" ? Math.round(curDurVal * 1_000) : minToMs(curDurVal),
        ...(curImmune ? { immune_to_reply: true } : {}),
      };
    } else if (curMode === "smart") {
      candidate = {
        mode: "smart" as const,
        min_ms: minToMs(curMin),
        max_ms: minToMs(curMax),
        ...(curGuidance.trim() ? { guidance: curGuidance } : {}),
      };
    } else if (curMode === "business_hours") {
      candidate = {
        mode: "business_hours" as const,
        start_time: curStart,
        end_time: curEnd,
        days_of_week: curDays,
        timezone: "America/Sao_Paulo",
        ...(curImmune ? { immune_to_reply: true } : {}),
      };
    } else if (curMode === "time_of_day") {
      candidate = {
        mode: "time_of_day" as const,
        target_time: curTargetTime,
        delay_days: curDelayDays,
        timezone: "America/Sao_Paulo",
        ...(curImmune ? { immune_to_reply: true } : {}),
      };
    } else if (curMode === "business_days") {
      candidate = {
        mode: "business_days" as const,
        days: curBDays,
        ...(curDeliverAt.trim() ? { deliver_at: curDeliverAt } : {}),
        timezone: "America/Sao_Paulo",
        ...(curImmune ? { immune_to_reply: true } : {}),
      };
    }

    const parsed = waitConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const toggleDay = (day: number) => {
    const next = daysOfWeek.includes(day)
      ? daysOfWeek.filter((d) => d !== day)
      : [...daysOfWeek, day].sort();
    setDaysOfWeek(next);
    commit({ daysOfWeek: next });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="wait-mode">{t("Como calcular a espera")}</Label>
        <Select
          value={mode}
          onValueChange={(v) => {
            const next = v as ModoDeEspera;
            setMode(next);
            commit({ mode: next });
          }}
        >
          <SelectTrigger id="wait-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opcoes(MODOS_DE_ESPERA).map(({ valor, rotulo }) => (
              <SelectItem key={valor} value={valor}>
                {t(rotulo)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mode === "fixed" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="wait-duration">{t("Duração")}</Label>
            <div className="grid grid-cols-[1fr_9rem] gap-2">
              <Input
                id="wait-duration"
                type="number"
                min={durationUnit === "seconds" ? 5 : 1}
                step={1}
                value={durationValue}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDurationValue(v);
                  commit({ durationValue: v });
                }}
              />
              <Select
                value={durationUnit}
                onValueChange={(v) => {
                  const nextUnit = v as WaitUnit;
                  const currentMs =
                    durationUnit === "seconds" ? durationValue * 1_000 : minToMs(durationValue);
                  const nextValue =
                    nextUnit === "seconds"
                      ? Math.max(5, Math.round(currentMs / 1_000))
                      : Math.max(1, Math.round(currentMs / 60_000));
                  setDurationUnit(nextUnit);
                  setDurationValue(nextValue);
                  commit({ durationValue: nextValue, durationUnit: nextUnit });
                }}
              >
                <SelectTrigger aria-label={t("Unidade da espera")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seconds">{t("Segundos")}</SelectItem>
                  <SelectItem value="minutes">{t("Minutos")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5 pr-2">
              <Label htmlFor="immune-reply">{t("Imune à resposta do contato")}</Label>
              <p className="text-xs text-text-muted">
                {t("Não encurta nem cancela o timer caso o lead mande mensagem.")}
              </p>
            </div>
            <Switch
              id="immune-reply"
              checked={immuneToReply}
              onCheckedChange={(checked) => {
                setImmuneToReply(checked);
                commit({ immuneToReply: checked });
              }}
            />
          </div>
        </div>
      )}

      {mode === "smart" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="wait-min">{t("Mínimo (min)")}</Label>
              <Input
                id="wait-min"
                type="number"
                min={5}
                value={minMin}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMinMin(v);
                  commit({ minMin: v });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wait-max">{t("Máximo (min)")}</Label>
              <Input
                id="wait-max"
                type="number"
                min={5}
                value={maxMin}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMaxMin(v);
                  commit({ maxMin: v });
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wait-guidance">{t("Orientação para a IA (opcional)")}</Label>
            <Textarea
              id="wait-guidance"
              maxLength={500}
              placeholder={t("Ex: aguardar o lead almoçar, ou esperar a manhã seguinte...")}
              value={guidance}
              onChange={(e) => {
                setGuidance(e.target.value);
                commit({ guidance: e.target.value });
              }}
            />
          </div>
        </div>
      )}

      {mode === "business_hours" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bh-start">{t("Início (HH:MM)")}</Label>
              <Input
                id="bh-start"
                type="text"
                maxLength={5}
                placeholder="09:00"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  commit({ startTime: e.target.value });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bh-end">{t("Fim (HH:MM)")}</Label>
              <Input
                id="bh-end"
                type="text"
                maxLength={5}
                placeholder="18:00"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  commit({ endTime: e.target.value });
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("Dias de funcionamento")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_DA_SEMANA.map(({ dia, rotulo }) => {
                const active = daysOfWeek.includes(dia);
                return (
                  <Button
                    key={dia}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-8 w-11 px-0 text-xs"
                    onClick={() => toggleDay(dia)}
                  >
                    {rotulo}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {mode === "time_of_day" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tod-time">{t("Horário alvo (HH:MM)")}</Label>
              <Input
                id="tod-time"
                type="text"
                maxLength={5}
                placeholder="09:00"
                value={targetTime}
                onChange={(e) => {
                  setTargetTime(e.target.value);
                  commit({ targetTime: e.target.value });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tod-delay">{t("Avançar dias (+dias)")}</Label>
              <Input
                id="tod-delay"
                type="number"
                min={0}
                max={30}
                value={delayDays}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDelayDays(v);
                  commit({ delayDays: v });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {mode === "business_days" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bd-days">{t("Dias úteis")}</Label>
              <Input
                id="bd-days"
                type="number"
                min={1}
                max={30}
                value={businessDaysCount}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setBusinessDaysCount(v);
                  commit({ businessDaysCount: v });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bd-deliver">{t("Entregar às (HH:MM)")}</Label>
              <Input
                id="bd-deliver"
                type="text"
                maxLength={5}
                placeholder="09:00"
                value={deliverAt}
                onChange={(e) => {
                  setDeliverAt(e.target.value);
                  commit({ deliverAt: e.target.value });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}
