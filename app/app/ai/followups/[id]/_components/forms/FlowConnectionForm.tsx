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
import { useFollowupFlows } from "@/hooks/followup/useFollowupFlows";
import { useT } from "@/hooks/i18n/useT";
import { flowConnectionConfigSchema } from "@/lib/followup/graph-schema";

import type { ConfigOf } from "./shared";

export function FlowConnectionForm({
  config,
  onChange,
}: {
  config: ConfigOf<"flow_connection">;
  onChange: (c: ConfigOf<"flow_connection">) => void;
}) {
  const t = useT();
  const { data: flows = [] } = useFollowupFlows();
  const [targetFlowId, setTargetFlowId] = useState(config.target_flow_id ?? "");
  const [inheritContext, setInheritContext] = useState(config.inherit_context ?? true);
  const [erro, setErro] = useState<string | null>(null);

  const commit = (overrides?: Partial<{
    target_flow_id: string;
    inherit_context: boolean;
  }>) => {
    const curFlowId = (overrides?.target_flow_id ?? targetFlowId).trim();
    const curInherit = overrides?.inherit_context ?? inheritContext;

    const candidate = {
      target_flow_id: curFlowId,
      inherit_context: curInherit,
    };

    const parsed = flowConnectionConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(parsed.data);
  };

  return (
    <div className="space-y-4" data-testid="flow-connection-form">
      <div className="space-y-2">
        <Label htmlFor="target-flow">{t("Fluxo de Destino")}</Label>
        {flows.length > 0 ? (
          <Select
            value={targetFlowId}
            onValueChange={(v) => {
              setTargetFlowId(v);
              commit({ target_flow_id: v });
            }}
          >
            <SelectTrigger id="target-flow">
              <SelectValue placeholder={t("Selecione um fluxo...")} />
            </SelectTrigger>
            <SelectContent>
              {flows.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id="target-flow"
            placeholder="UUID do fluxo de destino"
            value={targetFlowId}
            onChange={(e) => {
              setTargetFlowId(e.target.value);
              commit({ target_flow_id: e.target.value });
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div className="space-y-0.5 pr-2">
          <Label htmlFor="inherit-context">{t("Preservar variáveis e contexto")}</Label>
          <p className="text-xs text-text-muted">
            {t("Mantém o histórico de mensagens e campos personalizados no novo fluxo.")}
          </p>
        </div>
        <Switch
          id="inherit-context"
          checked={inheritContext}
          onCheckedChange={(checked) => {
            setInheritContext(checked);
            commit({ inherit_context: checked });
          }}
        />
      </div>

      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
