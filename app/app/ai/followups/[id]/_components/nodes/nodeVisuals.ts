import type { ComponentType } from "react";

import {
  Bell,
  Play,
  Clock,
  GitBranch,
  Brain,
  ChatCircle,
  ArrowsClockwise,
  PaperPlaneTilt,
  Flag,
  Question,
  PuzzlePiece,
  Funnel,
  Tag,
  Globe,
  ListChecks,
  FlowArrow,
  Megaphone,
  ImageSquare,
  Shuffle,
} from "@/lib/ui/icons";
import type { FlowNode, NodeType } from "@/lib/followup/graph-schema";
import { RESULTADOS_DO_FIM } from "@/lib/followup/vocabulario";
import { NOS_DA_SUPERFICIE } from "@/lib/followup/validate-publish";

/**
 * Visual identity per node type — shared by the palette (Task 6.2 increment 2)
 * and the custom node cards (increment 3). Each type gets a DISTINCT icon +
 * Sage token pairing (never a bare default React Flow box): trigger=accent
 * (start), wait=info (calm/waiting), condition=warning (branch), ai_classify=
 * solid accent (the "smart" step), action=success (send/go), end=error
 * (terminal — reads as "stop", not literally an error).
 */
export interface NodeVisual {
  type: NodeType;
  paletteLabel: string;
  icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  /** Icon chip background + text. */
  chipClassName: string;
  /** Left accent border on the node card. */
  borderClassName: string;
  defaultLabel: string;
  defaultConfig: () => FlowNode["config"];
}

type RegraDeCondicao = Extract<FlowNode, { type: "condition" }>["config"]["checks"][number];

/**
 * A regra com que o nó de condição nasce, e a que o "+ Condição" acrescenta.
 *
 * Era `passos ≥ 0` — válida no schema e VERDADEIRA PARA TODO LEAD (o contador
 * nasce em zero e só soma). No modo uma-saída-por-regra ela desviava todo mundo
 * e tornava "Nenhuma delas" inalcançável; num OU, fixava o nó em "Sim". E o card
 * a mostrava com cara de regra pronta.
 *
 * Agora nasce INCOMPLETA de propósito: o schema aceita (o rascunho salva), o
 * motor nunca a satisfaz e o publish a recusa até alguém escolher a etapa. Etapa
 * porque é a pergunta mais comum de um funil — e a que o seletor responde sem
 * digitar nada.
 */
export function regraEmBranco(): RegraDeCondicao {
  return { field: "lead_stage", op: "eq", value: "" };
}

/**
 * Nó de mensagem novo: IA, salvo o gatilho de retorno — ali o padrão é texto
 * fixo, porque a saudação de quem voltou não pede o LLM (e duas vozes
 * nasceriam se o default fosse `ai_message` + o turno inbound).
 */
export function configPadraoDaAcao(triggerKind?: string): FlowNode["config"] {
  if (triggerKind === "inbound_after_silence") {
    return { mode: "text", body: "Configure esta mensagem." };
  }
  return { mode: "ai_message", prompt_hint: "Configure esta etapa." };
}

export const NODE_VISUALS: Record<NodeType, NodeVisual> = {
  trigger: {
    type: "trigger",
    paletteLabel: "Gatilho",
    icon: Play,
    chipClassName: "bg-accent-soft text-accent",
    borderClassName: "border-l-accent-500",
    defaultLabel: "Início do fluxo",
    defaultConfig: () => ({}),
  },
  wait: {
    type: "wait",
    paletteLabel: "Aguardar",
    icon: Clock,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Aguardar",
    defaultConfig: () => ({ mode: "fixed", duration_ms: 300_000 }),
  },
  condition: {
    type: "condition",
    paletteLabel: "Condição",
    icon: GitBranch,
    chipClassName: "bg-warning-bg text-warning-fg",
    borderClassName: "border-l-warning",
    defaultLabel: "Verificar condição",
    defaultConfig: () => ({ combinator: "and", checks: [regraEmBranco()] }),
  },
  ai_classify: {
    type: "ai_classify",
    paletteLabel: "Classificar (IA)",
    icon: Brain,
    chipClassName: "bg-accent text-accent-foreground",
    borderClassName: "border-l-accent-700",
    defaultLabel: "Classificar resposta",
    defaultConfig: () => ({
      // Em português, e dizendo o CRITÉRIO: estes nomes são a definição inteira
      // que o modelo recebe para classificar a resposta (`followup-flow-classify`),
      // e aparecem crus na saída do card, na aresta e no dossiê. "hot"/"cold"
      // pedia ao dono da loja que adivinhasse o critério — e ao modelo também.
      // Fora do dicionário de propósito: são DADO do usuário, e uma chave faria
      // o card traduzir o que o motor compara ao pé da letra.
      classes: ["Interessado", "Sem interesse"],
      grace_timeout_ms: 900_000,
      target: "last_reply",
    }),
  },
  match_reply: {
    type: "match_reply",
    paletteLabel: "Resposta (texto)",
    icon: ChatCircle,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Casar resposta",
    defaultConfig: () => ({
      branches: [{ id: "br_sim", label: "Sim", op: "contains", pattern: "sim" }],
      grace_timeout_ms: 900_000,
    }),
  },
  repeat: {
    type: "repeat",
    paletteLabel: "Repetir",
    icon: ArrowsClockwise,
    chipClassName: "bg-warning-bg text-warning-fg",
    borderClassName: "border-l-warning",
    defaultLabel: "Repetir pela resposta",
    defaultConfig: () => ({ max_count: 12 }),
  },
  collect: {
    type: "collect",
    paletteLabel: "Pergunta",
    icon: Question,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Nova pergunta",
    defaultConfig: () => ({ key: "novo_campo", label: "Nova pergunta", type: "text", required: true, permite_correcao: true }),
  },
  skill: {
    type: "skill",
    paletteLabel: "Skill",
    icon: PuzzlePiece,
    chipClassName: "bg-accent-soft text-accent",
    borderClassName: "border-l-accent-500",
    defaultLabel: "Puxar skill",
    defaultConfig: () => ({ skill_name: "nome-da-skill" }),
  },
  action: {
    type: "action",
    paletteLabel: "Ação",
    icon: PaperPlaneTilt,
    chipClassName: "bg-success-bg text-success-fg",
    borderClassName: "border-l-success",
    defaultLabel: "Enviar mensagem",
    defaultConfig: () => configPadraoDaAcao(),
  },
  internal_task: {
    type: "internal_task",
    paletteLabel: "Lembrete interno",
    icon: Bell,
    chipClassName: "bg-warning-bg text-warning-fg",
    borderClassName: "border-l-warning",
    defaultLabel: "Criar tarefa (só interno)",
    defaultConfig: () => ({
      titulo: "Ligar para {{contact.name}}",
      vence_em_dias: 1,
      atribuir_a: "dono_do_lead",
      prioridade: "medium",
    }),
  },
  // #2065 — os dois tipos de ação que a issue pede e que NÃO falam com o
  // cliente: mover o card no funil e gravar tag. O `defaultConfig` nasce vazio
  // de propósito (rascunho salva trabalho pela metade); o publish é quem exige
  // a escolha (`etapa_destino_ausente`, `tag_ausente`).
  move_lead: {
    type: "move_lead",
    paletteLabel: "Mover lead no funil",
    icon: Funnel,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Mover card de etapa",
    defaultConfig: () => ({ stage_id: "" }),
  },
  edit_lead_tag: {
    type: "edit_lead_tag",
    paletteLabel: "Editar tag do lead",
    icon: Tag,
    chipClassName: "bg-accent-soft text-accent",
    borderClassName: "border-l-accent-500",
    defaultLabel: "Gravar tag no lead",
    defaultConfig: () => ({ tags: [] }),
  },
  http_request: {
    type: "http_request",
    paletteLabel: "Requisição HTTP",
    icon: Globe,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Requisição HTTP",
    defaultConfig: () => ({
      method: "POST",
      url: "https://",
      headers: {},
      body: "{}",
      timeout_ms: 10000,
    }),
  },
  interactive_menu: {
    type: "interactive_menu",
    paletteLabel: "Menu interativo",
    icon: ListChecks,
    chipClassName: "bg-accent-soft text-accent",
    borderClassName: "border-l-accent-500",
    defaultLabel: "Menu interativo",
    defaultConfig: () => ({
      body: "Escolha uma opção:",
      menu_type: "buttons",
      options: [
        { id: "opt_1", title: "Opção 1" },
        { id: "opt_2", title: "Opção 2" },
      ],
      timeout_ms: 86400000,
    }),
  },
  flow_connection: {
    type: "flow_connection",
    paletteLabel: "Conectar fluxo",
    icon: FlowArrow,
    chipClassName: "bg-warning-bg text-warning-fg",
    borderClassName: "border-l-warning",
    defaultLabel: "Conectar a outro fluxo",
    defaultConfig: () => ({
      target_flow_id: "",
      inherit_context: true,
    }),
  },
  conversion_pixel: {
    type: "conversion_pixel",
    paletteLabel: "Pixel de conversão",
    icon: Megaphone,
    chipClassName: "bg-success-bg text-success-fg",
    borderClassName: "border-l-success",
    defaultLabel: "Disparar conversão",
    defaultConfig: () => ({
      provider: "both",
      event_name: "Lead",
      currency: "BRL",
    }),
  },
  carousel: {
    type: "carousel",
    paletteLabel: "Carrossel",
    icon: ImageSquare,
    chipClassName: "bg-accent text-accent-foreground",
    borderClassName: "border-l-accent-700",
    defaultLabel: "Carrossel de cartões",
    defaultConfig: () => ({
      cards: [
        {
          id: "card_1",
          media_url: "",
          media_type: "image",
          title: "Item 1",
          description: "Descrição do cartão 1",
          buttons: [{ id: "btn_1", label: "Ver mais" }],
        },
        {
          id: "card_2",
          media_url: "",
          media_type: "image",
          title: "Item 2",
          description: "Descrição do cartão 2",
          buttons: [{ id: "btn_2", label: "Ver mais" }],
        },
      ],
    }),
  },
  random_split: {
    type: "random_split",
    paletteLabel: "Distribuidor",
    icon: Shuffle,
    chipClassName: "bg-warning-bg text-warning-fg",
    borderClassName: "border-l-warning",
    defaultLabel: "Distribuir fluxo",
    defaultConfig: () => ({
      paths: [
        { id: "path_a", label: "Caminho A", weight: 50 },
        { id: "path_b", label: "Caminho B", weight: 50 },
      ],
    }),
  },
  end: {
    type: "end",
    paletteLabel: "Fim",
    icon: Flag,
    chipClassName: "bg-error-bg text-error-fg",
    borderClassName: "border-l-error",
    defaultLabel: "Fim do fluxo",
    defaultConfig: () => ({ outcome: "exhausted" }),
  },
};

/**
 * A paleta do editor de follow-up: só o que o motor do RELÓGIO executa. Pergunta
 * e Skill são do roteiro de atendimento (#1130) e ficam fora — a mesma lista
 * que o publish cobra (`NOS_DA_SUPERFICIE`), para a tela não oferecer caixa que
 * o publish recusa.
 */
export const NODE_VISUAL_LIST = NOS_DA_SUPERFICIE.followup.map((tipo) => NODE_VISUALS[tipo]);

type ConfigOf<T extends NodeType> = Extract<FlowNode, { type: T }>["config"];

/** "15 min", com espaço — o mesmo formato do card de espera, que dizia "5 min" enquanto este dizia "15min". */
function minutos(ms: number): string {
  return `${Math.round(ms / 60_000)} min`;
}

function duracaoDaEspera(ms: number, t: (texto: string) => string): string {
  return ms < 60_000 ? `${Math.round(ms / 1_000)} ${t("s")}` : minutos(ms);
}

/**
 * One-line summary of a node's config — shown as the card subtitle. Takes the
 * RF node's own `type`/`data.config` pair (not a reconstructed `FlowNode`)
 * because the node components only ever see React Flow's generic shape.
 */
export function describeNodeConfig(
  type: NodeType,
  config: FlowNode["config"],
  // `t` OBRIGATÓRIO. Era opcional com padrão identidade, e foi assim que dois
  // cards que chegaram por outra branch (repetir e casar resposta) ficaram sem
  // tradução nenhuma sem o typecheck notar: em português o padrão devolve o
  // mesmo texto, então o esquecimento só aparecia para quem usa espanhol.
  t: (texto: string) => string,
): string {
  switch (type) {
    case "trigger":
      return t("Início do fluxo");
    case "wait": {
      const c = config as ConfigOf<"wait">;
      if (c.mode === "fixed") return duracaoDaEspera(c.duration_ms, t);
      if (c.mode === "smart") return `${Math.round(c.min_ms / 60_000)}–${minutos(c.max_ms)} ${t("(adaptativo)")}`;
      if (c.mode === "business_hours") return `${t("Horário comercial")} ${c.start_time}–${c.end_time}`;
      if (c.mode === "time_of_day") return `${t("Às")} ${c.target_time}${c.delay_days > 0 ? ` (+${c.delay_days}d)` : ""}`;
      if (c.mode === "business_days") return `${c.days} ${c.days === 1 ? t("dia útil") : t("dias úteis")}${c.deliver_at ? ` ${t("às")} ${c.deliver_at}` : ""}`;
      return t("Aguardar");
    }
    case "condition": {
      const c = config as ConfigOf<"condition">;
      // No modo uma-saída-por-regra o combinador NÃO é consultado (a regra não
      // vota, ela roteia). Continuar anunciando "E"/"OU" ali seria o card
      // afirmando uma coisa que o motor ignora — e o usuário acredita no card.
      if (c.branching === "per_check")
        return `${c.checks.length} ${c.checks.length === 1 ? t("regra · uma saída por regra") : t("regras · uma saída por regra")}`;
      return `${c.checks.length} ${c.checks.length === 1 ? t("condição") : t("condições")} · ${c.combinator === "and" ? t("E") : t("OU")}`;
    }
    // "grace" é o nome do CAMPO, não palavra nenhuma para quem tem uma loja — e o
    // formulário do mesmo nó já perguntava "Esperar a resposta por (minutos)".
    // O card dizia o número com dois nomes na mesma tela.
    case "ai_classify": {
      const c = config as ConfigOf<"ai_classify">;
      return `${c.classes.length} ${c.classes.length === 1 ? t("classe · espera") : t("classes · espera")} ${minutos(c.grace_timeout_ms)}`;
    }
    case "match_reply": {
      const c = config as ConfigOf<"match_reply">;
      return `${c.branches.length} ${c.branches.length === 1 ? t("regra · espera") : t("regras · espera")} ${minutos(c.grace_timeout_ms)}${
        c.save_to
          ? ` · ${t("grava resposta")}${c.if_exists === "skip" ? ` · ${t("pula se já existir")}` : c.if_exists === "confirm" ? ` · ${t("confirma se já existir")}` : ""}`
          : ""
      }`;
    }
    case "repeat": {
      const c = config as ConfigOf<"repeat">;
      return `${t("até")} ${c.max_count} ${c.max_count === 1 ? t("volta") : t("voltas")}`;
    }
    case "collect": {
      const c = config as ConfigOf<"collect">;
      return `${c.label} · ${c.required ? t("obrigatória") : t("opcional")}`;
    }
    case "skill": {
      const c = config as ConfigOf<"skill">;
      return c.skill_name;
    }
    case "action": {
      const c = config as ConfigOf<"action">;
      if (c.mode === "ai_message") return c.prompt_hint;
      if (c.mode === "text") return c.body;
      return t("Template fixo");
    }
    case "internal_task": {
      const c = config as ConfigOf<"internal_task">;
      const prazo = c.vence_em_dias === 0 ? t("hoje") : `+${c.vence_em_dias}d`;
      return `${c.titulo} · ${prazo} · ${t("sem mensagem ao cliente")}`;
    }
    // #2065 — o rótulo da etapa (nome de banco) não chega aqui: o card diz o
    // QUE faz, e o formulário diz PARA ONDE, com o nome da etapa escolhida.
    case "move_lead": {
      const c = config as ConfigOf<"move_lead">;
      return c.stage_id ? t("move o card para outra etapa do funil") : t("sem etapa de destino");
    }
    case "edit_lead_tag": {
      const c = config as ConfigOf<"edit_lead_tag">;
      return c.tags.length ? c.tags.join(", ") : t("sem tag escolhida");
    }
    case "http_request": {
      const c = config as ConfigOf<"http_request">;
      return `${c.method} ${c.url ? c.url : t("sem URL configurada")}`;
    }
    case "interactive_menu": {
      const c = config as ConfigOf<"interactive_menu">;
      const opts = c.options?.length ?? 0;
      return `${opts} ${opts === 1 ? t("opção") : t("opções")} · ${c.menu_type === "buttons" ? t("botões") : t("lista")}`;
    }
    case "flow_connection": {
      const c = config as ConfigOf<"flow_connection">;
      return c.target_flow_id ? t("Transferir para outro fluxo") : t("sem fluxo de destino");
    }
    case "conversion_pixel": {
      const c = config as ConfigOf<"conversion_pixel">;
      return `${c.provider.toUpperCase()} · ${c.event_name}`;
    }
    case "carousel": {
      const c = config as ConfigOf<"carousel">;
      const cards = c.cards?.length ?? 0;
      return `${cards} ${cards === 1 ? t("cartão") : t("cartões")}`;
    }
    case "random_split": {
      const c = config as ConfigOf<"random_split">;
      const paths = c.paths?.length ?? 0;
      return `${paths} ${paths === 1 ? t("caminho") : t("caminhos")} · ${t("sorteio percentual")}`;
    }
    case "end": {
      const c = config as ConfigOf<"end">;
      return t(RESULTADOS_DO_FIM[c.outcome]);
    }
    default: {
      const exhaustive: never = type;
      return String(exhaustive);
    }
  }
}
