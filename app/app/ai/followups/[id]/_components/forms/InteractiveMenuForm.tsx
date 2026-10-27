"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { interactiveMenuConfigSchema } from "@/lib/followup/graph-schema";

import type { ConfigOf } from "./shared";

type MenuOption = ConfigOf<"interactive_menu">["options"][number];

export function InteractiveMenuForm({
  config,
  onChange,
}: {
  config: ConfigOf<"interactive_menu">;
  onChange: (c: ConfigOf<"interactive_menu">) => void;
}) {
  const t = useT();
  const [menuType, setMenuType] = useState<"buttons" | "list">(config.menu_type ?? "buttons");
  const [body, setBody] = useState(config.body ?? "Escolha uma opção:");
  const [header, setHeader] = useState(config.header ?? "");
  const [footer, setFooter] = useState(config.footer ?? "");
  const [options, setOptions] = useState<MenuOption[]>(
    config.options ?? [
      { id: "opt_1", title: "Opção 1" },
      { id: "opt_2", title: "Opção 2" },
    ],
  );
  const [erro, setErro] = useState<string | null>(null);

  const commit = (overrides?: Partial<{
    menu_type: "buttons" | "list";
    body: string;
    header: string;
    footer: string;
    options: MenuOption[];
  }>) => {
    const curType = overrides?.menu_type ?? menuType;
    const curBody = overrides?.body ?? body;
    const curHeader = overrides?.header ?? header;
    const curFooter = overrides?.footer ?? footer;
    const curOptions = overrides?.options ?? options;

    const candidate = {
      menu_type: curType,
      body: curBody,
      ...(curHeader.trim() ? { header: curHeader.trim() } : {}),
      ...(curFooter.trim() ? { footer: curFooter.trim() } : {}),
      options: curOptions,
      timeout_ms: config.timeout_ms ?? 86400000,
    };

    const parsed = interactiveMenuConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(parsed.data);
  };

  const addOption = () => {
    const max = menuType === "buttons" ? 3 : 10;
    if (options.length >= max) {
      setErro(t(`Máximo de ${max} opções permitido.`));
      return;
    }
    const next: MenuOption[] = [
      ...options,
      { id: `opt_${Date.now()}`, title: `Opção ${options.length + 1}` },
    ];
    setOptions(next);
    commit({ options: next });
  };

  const updateOption = (idx: number, patch: Partial<MenuOption>) => {
    const next = [...options];
    const target = next[idx];
    if (!target) return;
    next[idx] = {
      id: target.id,
      title: patch.title !== undefined ? patch.title : target.title,
      ...(patch.description !== undefined
        ? patch.description.trim() ? { description: patch.description.trim() } : {}
        : target.description ? { description: target.description } : {}),
    };
    setOptions(next);
    commit({ options: next });
  };

  const removeOption = (idx: number) => {
    if (options.length <= 1) {
      setErro(t("O menu precisa ter no mínimo 1 opção."));
      return;
    }
    const next = options.filter((_, i) => i !== idx);
    setOptions(next);
    commit({ options: next });
  };

  return (
    <div className="space-y-4" data-testid="interactive-menu-form">
      <div className="space-y-2">
        <Label htmlFor="menu-type">{t("Formato do Menu")}</Label>
        <Select
          value={menuType}
          onValueChange={(v) => {
            const nextType = v as "buttons" | "list";
            setMenuType(nextType);
            const clamped =
              nextType === "buttons" && options.length > 3 ? options.slice(0, 3) : options;
            setOptions(clamped);
            commit({ menu_type: nextType, options: clamped });
          }}
        >
          <SelectTrigger id="menu-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="buttons">{t("Botões Rápidos (até 3)")}</SelectItem>
            <SelectItem value="list">{t("Lista de Opções (até 10)")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="menu-body">{t("Texto da Mensagem")}</Label>
        <Textarea
          id="menu-body"
          rows={3}
          placeholder={t("Ex: Como podemos te ajudar hoje?")}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            commit({ body: e.target.value });
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="menu-header">{t("Cabeçalho (opcional)")}</Label>
          <Input
            id="menu-header"
            maxLength={60}
            value={header}
            onChange={(e) => {
              setHeader(e.target.value);
              commit({ header: e.target.value });
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="menu-footer">{t("Rodapé (opcional)")}</Label>
          <Input
            id="menu-footer"
            maxLength={60}
            value={footer}
            onChange={(e) => {
              setFooter(e.target.value);
              commit({ footer: e.target.value });
            }}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <Label>{t("Opções do Menu")}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addOption}
            disabled={options.length >= (menuType === "buttons" ? 3 : 10)}
          >
            <Plus size={14} className="mr-1" />
            {t("Adicionar Opção")}
          </Button>
        </div>

        <div className="space-y-2">
          {options.map((opt, idx) => (
            <div
              key={opt.id}
              className="flex items-center gap-2 rounded-lg border border-border p-2 bg-surface/50"
            >
              <div className="flex-1 space-y-1">
                <Input
                  placeholder={t("Título da opção")}
                  maxLength={menuType === "buttons" ? 20 : 24}
                  value={opt.title}
                  onChange={(e) => updateOption(idx, { title: e.target.value })}
                />
                {menuType === "list" && (
                  <Input
                    placeholder={t("Descrição curta (opcional)")}
                    maxLength={72}
                    value={opt.description ?? ""}
                    onChange={(e) => updateOption(idx, { description: e.target.value })}
                  />
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-text-muted hover:text-destructive"
                onClick={() => removeOption(idx)}
                disabled={options.length <= 1}
              >
                <Trash size={14} />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
