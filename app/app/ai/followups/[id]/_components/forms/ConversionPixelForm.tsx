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
import { useT } from "@/hooks/i18n/useT";
import { conversionPixelConfigSchema } from "@/lib/followup/graph-schema";

import type { ConfigOf } from "./shared";

type PixelEvent = ConfigOf<"conversion_pixel">["event_name"];
type PixelProvider = ConfigOf<"conversion_pixel">["provider"];

const STANDARD_EVENTS: PixelEvent[] = [
  "Lead",
  "Schedule",
  "Contact",
  "Purchase",
  "CompleteRegistration",
  "Custom",
];

export function ConversionPixelForm({
  config,
  onChange,
}: {
  config: ConfigOf<"conversion_pixel">;
  onChange: (c: ConfigOf<"conversion_pixel">) => void;
}) {
  const t = useT();
  const [provider, setProvider] = useState<PixelProvider>(config.provider ?? "both");
  const [eventName, setEventName] = useState<PixelEvent>(config.event_name ?? "Lead");
  const [customEventName, setCustomEventName] = useState(config.custom_event_name ?? "");
  const [value, setValue] = useState(config.value !== undefined ? String(config.value) : "");
  const [currency, setCurrency] = useState(config.currency ?? "BRL");
  const [erro, setErro] = useState<string | null>(null);

  const commit = (overrides?: Partial<{
    provider: PixelProvider;
    event_name: PixelEvent;
    custom_event_name: string;
    value: string;
    currency: string;
  }>) => {
    const curProvider = overrides?.provider ?? provider;
    const curEvent = overrides?.event_name ?? eventName;
    const curCustomEvt = overrides?.custom_event_name ?? customEventName;
    const curValStr = overrides?.value ?? value;
    const curCur = overrides?.currency ?? currency;

    const numVal = curValStr.trim() !== "" ? Number(curValStr) : undefined;

    const candidate = {
      provider: curProvider,
      event_name: curEvent,
      ...(curEvent === "Custom" && curCustomEvt.trim() ? { custom_event_name: curCustomEvt.trim() } : {}),
      ...(numVal !== undefined ? { value: numVal } : {}),
      currency: curCur.trim() ? curCur.trim() : "BRL",
    };

    const parsed = conversionPixelConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(parsed.data);
  };

  return (
    <div className="space-y-4" data-testid="conversion-pixel-form">
      <div className="space-y-2">
        <Label htmlFor="pixel-provider">{t("Provedor de Conversão")}</Label>
        <Select
          value={provider}
          onValueChange={(v) => {
            const nextP = v as PixelProvider;
            setProvider(nextP);
            commit({ provider: nextP });
          }}
        >
          <SelectTrigger id="pixel-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="both">{t("Ambos (Meta CAPI + Google Ads)")}</SelectItem>
            <SelectItem value="meta">{t("Meta Conversions API (CAPI)")}</SelectItem>
            <SelectItem value="google">{t("Google Ads / GA4 Enhanced")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="pixel-event">{t("Nome do Evento Padrão")}</Label>
        <Select
          value={eventName}
          onValueChange={(v) => {
            const nextE = v as PixelEvent;
            setEventName(nextE);
            commit({ event_name: nextE });
          }}
        >
          <SelectTrigger id="pixel-event">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STANDARD_EVENTS.map((evt) => (
              <SelectItem key={evt} value={evt}>
                {evt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {eventName === "Custom" && (
        <div className="space-y-2">
          <Label htmlFor="pixel-custom-event">{t("Nome do Evento Personalizado")}</Label>
          <Input
            id="pixel-custom-event"
            maxLength={60}
            placeholder="Ex: AssinaturaIniciada"
            value={customEventName}
            onChange={(e) => {
              setCustomEventName(e.target.value);
              commit({ custom_event_name: e.target.value });
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="pixel-value">{t("Valor da Conversão (R$)")}</Label>
          <Input
            id="pixel-value"
            type="number"
            step="0.01"
            min={0}
            placeholder="0.00"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              commit({ value: e.target.value });
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pixel-currency">{t("Moeda")}</Label>
          <Input
            id="pixel-currency"
            maxLength={3}
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              commit({ currency: e.target.value });
            }}
          />
        </div>
      </div>

      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
