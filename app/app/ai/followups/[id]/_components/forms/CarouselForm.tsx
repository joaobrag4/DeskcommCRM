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
import { Plus, Trash } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { carouselConfigSchema } from "@/lib/followup/graph-schema";

import type { ConfigOf } from "./shared";

type CarouselCard = ConfigOf<"carousel">["cards"][number];
type CardButton = NonNullable<CarouselCard["buttons"]>[number];

export function CarouselForm({
  config,
  onChange,
}: {
  config: ConfigOf<"carousel">;
  onChange: (c: ConfigOf<"carousel">) => void;
}) {
  const t = useT();
  const [cards, setCards] = useState<CarouselCard[]>(
    config.cards ?? [
      {
        id: "card_1",
        media_url: "",
        media_type: "image",
        title: "Item 1",
        description: "Descrição do produto ou serviço",
        buttons: [{ id: "btn_1", label: "Ver detalhes" }],
      },
      {
        id: "card_2",
        media_url: "",
        media_type: "image",
        title: "Item 2",
        description: "Descrição do produto ou serviço",
        buttons: [{ id: "btn_2", label: "Ver detalhes" }],
      },
    ],
  );
  const [erro, setErro] = useState<string | null>(null);

  const commit = (nextCards: CarouselCard[]) => {
    const candidate = { cards: nextCards };
    const parsed = carouselConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(parsed.data);
  };

  const addCard = () => {
    if (cards.length >= 10) {
      setErro(t("Máximo de 10 cartões por carrossel."));
      return;
    }
    const newId = `card_${Date.now()}`;
    const next: CarouselCard[] = [
      ...cards,
      {
        id: newId,
        media_url: "",
        media_type: "image",
        title: `Item ${cards.length + 1}`,
        description: "Descrição",
        buttons: [{ id: `btn_${Date.now()}`, label: "Saiba mais" }],
      },
    ];
    setCards(next);
    commit(next);
  };

  const updateCard = (idx: number, patch: Partial<CarouselCard>) => {
    const next = [...cards];
    const target = next[idx];
    if (!target) return;
    next[idx] = {
      ...target,
      ...patch,
    };
    setCards(next);
    commit(next);
  };

  const removeCard = (idx: number) => {
    if (cards.length <= 2) {
      setErro(t("O carrossel precisa ter no mínimo 2 cartões."));
      return;
    }
    const next = cards.filter((_, i) => i !== idx);
    setCards(next);
    commit(next);
  };

  const addButton = (cardIdx: number) => {
    const card = cards[cardIdx];
    if (!card) return;
    const currentButtons = card.buttons ?? [];
    if (currentButtons.length >= 3) {
      setErro(t("Máximo de 3 botões por cartão."));
      return;
    }
    const nextButtons: CardButton[] = [
      ...currentButtons,
      { id: `btn_${Date.now()}`, label: `Botão ${currentButtons.length + 1}` },
    ];
    updateCard(cardIdx, { buttons: nextButtons });
  };

  const updateButton = (cardIdx: number, btnIdx: number, patch: Partial<CardButton>) => {
    const card = cards[cardIdx];
    if (!card) return;
    const nextButtons = [...(card.buttons ?? [])];
    const targetBtn = nextButtons[btnIdx];
    if (!targetBtn) return;
    nextButtons[btnIdx] = { ...targetBtn, ...patch };
    updateCard(cardIdx, { buttons: nextButtons });
  };

  const removeButton = (cardIdx: number, btnIdx: number) => {
    const card = cards[cardIdx];
    if (!card) return;
    const nextButtons = (card.buttons ?? []).filter((_, i) => i !== btnIdx);
    updateCard(cardIdx, { buttons: nextButtons });
  };

  return (
    <div className="space-y-4" data-testid="carousel-form">
      <div className="flex items-center justify-between">
        <Label>{t("Cartões do Carrossel")}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCard}
          disabled={cards.length >= 10}
        >
          <Plus size={14} className="mr-1" />
          {t("Adicionar Cartão")}
        </Button>
      </div>

      <div className="space-y-4">
        {cards.map((card, cIdx) => (
          <div
            key={card.id}
            className="space-y-3 rounded-lg border border-border p-3 bg-surface/50"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {t("Cartão")} #{cIdx + 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-text-muted hover:text-destructive"
                onClick={() => removeCard(cIdx)}
                disabled={cards.length <= 2}
              >
                <Trash size={14} />
              </Button>
            </div>

            <div className="space-y-2">
              <Input
                placeholder={t("Título do item")}
                maxLength={60}
                value={card.title}
                onChange={(e) => updateCard(cIdx, { title: e.target.value })}
              />
              <Input
                placeholder={t("Descrição curta")}
                maxLength={120}
                value={card.description ?? ""}
                onChange={(e) => updateCard(cIdx, { description: e.target.value })}
              />
              <div className="grid grid-cols-[1fr_8rem] gap-2">
                <Input
                  type="url"
                  placeholder={t("URL da imagem/vídeo")}
                  value={card.media_url}
                  onChange={(e) => updateCard(cIdx, { media_url: e.target.value })}
                />
                <Select
                  value={card.media_type}
                  onValueChange={(v) => updateCard(cIdx, { media_type: v as "image" | "video" })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">{t("Imagem")}</SelectItem>
                    <SelectItem value="video">{t("Vídeo")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 border-t border-border pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  {t("Botões")} ({(card.buttons ?? []).length}/3)
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => addButton(cIdx)}
                  disabled={(card.buttons ?? []).length >= 3}
                >
                  <Plus size={12} className="mr-1" />
                  {t("Botão")}
                </Button>
              </div>

              {(card.buttons ?? []).map((btn, bIdx) => (
                <div key={btn.id} className="flex items-center gap-2">
                  <Input
                    className="h-8 text-xs flex-1"
                    maxLength={20}
                    placeholder={t("Rótulo")}
                    value={btn.label}
                    onChange={(e) => updateButton(cIdx, bIdx, { label: e.target.value })}
                  />
                  <Input
                    className="h-8 text-xs flex-1"
                    placeholder="URL (opcional)"
                    value={btn.url ?? ""}
                    onChange={(e) => updateButton(cIdx, bIdx, { url: e.target.value || undefined })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-text-muted hover:text-destructive"
                    onClick={() => removeButton(cIdx, bIdx)}
                  >
                    <Trash size={12} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
