"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash, ArrowsClockwise, Shuffle } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { randomSplitConfigSchema } from "@/lib/followup/graph-schema";

import type { ConfigOf } from "./shared";

type RandomSplitPath = ConfigOf<"random_split">["paths"][number];

export function RandomSplitForm({
  config,
  onChange,
}: {
  config: ConfigOf<"random_split">;
  onChange: (c: ConfigOf<"random_split">) => void;
}) {
  const t = useT();
  const [paths, setPaths] = useState<RandomSplitPath[]>(
    config.paths ?? [
      { id: "path_a", label: "Caminho A", weight: 50 },
      { id: "path_b", label: "Caminho B", weight: 50 },
    ],
  );
  const [erro, setErro] = useState<string | null>(null);

  const totalWeight = paths.reduce(
    (acc, p) => acc + (Number.isFinite(p.weight) ? p.weight : 0),
    0,
  );

  const commit = (nextPaths: RandomSplitPath[]) => {
    const candidate = {
      paths: nextPaths,
    };
    const parsed = randomSplitConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(parsed.data);
  };

  const addPath = () => {
    if (paths.length >= 10) {
      setErro(t("Máximo de 10 caminhos permitidos."));
      return;
    }
    const letter = String.fromCharCode(65 + paths.length);
    const next: RandomSplitPath[] = [
      ...paths,
      {
        id: `path_${Date.now()}`,
        label: `Caminho ${letter}`,
        weight: 10,
      },
    ];
    setPaths(next);
    commit(next);
  };

  const removePath = (idx: number) => {
    if (paths.length <= 2) {
      setErro(t("Mínimo de 2 caminhos obrigatório para distribuição."));
      return;
    }
    const next = paths.filter((_, i) => i !== idx);
    setPaths(next);
    commit(next);
  };

  const updatePath = (idx: number, patch: Partial<RandomSplitPath>) => {
    const next = [...paths];
    const target = next[idx];
    if (!target) return;
    next[idx] = {
      id: target.id,
      label: patch.label !== undefined ? patch.label : target.label,
      weight: patch.weight !== undefined ? patch.weight : target.weight,
    };
    setPaths(next);
    commit(next);
  };

  const distributeEqually = () => {
    const n = paths.length;
    if (n === 0) return;
    const base = Math.floor(100 / n);
    const remainder = 100 % n;
    const next = paths.map((p, i) => ({
      ...p,
      weight: i < remainder ? base + 1 : base,
    }));
    setPaths(next);
    commit(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Shuffle className="h-4 w-4 text-warning" />
            {t("Distribuição e Variação")}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t("Sorteio percentual de caminhos para teste A/B e variação de mensagens.")}
          </p>
        </div>
      </div>

      {erro && (
        <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {erro}
        </div>
      )}

      {/* Indicador de peso total */}
      <div
        className={`flex items-center justify-between rounded-lg border p-2.5 text-xs ${
          totalWeight === 100
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : "border-amber-500/30 bg-amber-500/10 text-amber-300"
        }`}
      >
        <span className="font-medium">
          {t("Soma total dos pesos:")}{" "}
          <strong className="font-bold">{totalWeight}%</strong>
          {totalWeight === 100 ? ` (${t("100% balanceado")})` : ` (${t("Ajuste para somar 100%")})`}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          onClick={distributeEqually}
        >
          <ArrowsClockwise className="h-3.5 w-3.5" />
          {t("Distribuir igualmente")}
        </Button>
      </div>

      {/* Lista de caminhos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">{t("Caminhos de Saída")}</Label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={addPath}
            disabled={paths.length >= 10}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("Adicionar caminho")}
          </Button>
        </div>

        {paths.map((p, idx) => (
          <div
            key={p.id}
            className="flex items-center gap-2 rounded-lg border bg-card/40 p-2.5"
          >
            <div className="flex-1 space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                {t("Rótulo do caminho")}
              </Label>
              <Input
                value={p.label}
                maxLength={40}
                className="h-8 text-xs"
                placeholder={t("Ex: Caminho A")}
                onChange={(e) => updatePath(idx, { label: e.target.value })}
              />
            </div>

            <div className="w-24 space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                {t("Peso (%)")}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={p.weight}
                  className="h-8 pr-6 text-xs"
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    updatePath(idx, { weight: Number.isFinite(val) ? val : 1 });
                  }}
                />
                <span className="pointer-events-none absolute right-2 top-2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            <div className="pt-4">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                disabled={paths.length <= 2}
                onClick={() => removePath(idx)}
                title={t("Remover caminho")}
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
