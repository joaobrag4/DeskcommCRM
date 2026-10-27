# Novos Nós de Fluxo (Compatibilidade Leona) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar no canvas e no motor de automação/follow-up do Deskcomm os 6 recursos presentes no Leona: Integração HTTP Request (Webhooks), Intervalo Inteligente (Horário Comercial/Dias Úteis), Menu Interativo (Botões/Listas WhatsApp com ramificações), Conexão de Fluxo (Subfluxos), Disparo de Pixel/Conversão e Carrossel de Mídia.

**Architecture:** Extensão modular e retrocompatível do contrato de grafo (`lib/followup/graph-schema.ts`), do validador estrutural de publish (`lib/followup/validate-publish.ts`), dos manipuladores de passo do motor (`lib/followup/node-handlers.ts` e `engine.ts`), do simulador de prévia local (`lib/followup/preview/session.ts`) e da paleta/cards React Flow (`nodeVisuals.ts`, `NodePalette.tsx`, `NodeConfigPanel.tsx`). Todas as chamadas de rede externas passam pelo guard anti-SSRF existente (`lib/automation/destinos-internos-autorizados.ts`).

**Tech Stack:** TypeScript 5.8, React 19, @xyflow/react 12, Zod 3.24, Vitest, PostgreSQL 15, WAHA / Meta Cloud API (WhatsApp Business Graph API).

---

## Estrutura de Fases

- **Fase 1:** Integração HTTP Request (`http_request`) — prioridade alta (integração externa).
- **Fase 2:** Intervalo Inteligente (`wait` com modos horário comercial e dias úteis).
- **Fase 3:** Menu Interativo WhatsApp (`interactive_menu` — botões e listas com ramificações visuais).
- **Fase 4:** Conexão de Fluxo (`flow_connection` — subfluxos e saltos entre automações).
- **Fase 5:** Disparo de Pixel / Conversão (`conversion_pixel` — Meta CAPI e Google Ads).
- **Fase 6:** Carrossel Interativo (`carousel` — múltiplos cards com mídia e botões).

---

## Tarefas Detalhadas

### Task 1: Integração HTTP Request (`http_request`)

**Files:**
- Modify: `lib/followup/graph-schema.ts`
- Modify: `lib/followup/validate-publish.ts`
- Modify: `lib/followup/node-handlers.ts`
- Modify: `lib/followup/engine.ts`
- Modify: `lib/followup/preview/session.ts`
- Create: `app/app/ai/followups/[id]/_components/forms/HttpRequestForm.tsx`
- Modify: `app/app/ai/followups/[id]/_components/nodes/nodeVisuals.ts`
- Modify: `app/app/ai/followups/[id]/_components/NodeConfigPanel.tsx`
- Test: `lib/followup/http-request-node.test.ts`
- Test: `tests/unit/http-request-publish-validator.test.ts`

**Step 1: Escrever teste de schema e ramificações**
- Definir que `http_request` aceita método (GET, POST, PUT, DELETE), URL, cabeçalhos, corpo e timeout.
- Definir que o nó emite duas saídas nomeadas: `success` (status 2xx) e `failure` (4xx, 5xx, timeout).
- Rodar teste e validar falha inicial.

**Step 2: Implementar Zod Schema em `graph-schema.ts`**
- Adicionar `'http_request'` ao `NODE_TYPES`.
- Criar `HttpRequestConfigSchema`:
  ```typescript
  export const HttpRequestConfigSchema = z.strictObject({
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('POST'),
    url: z.string().default(''),
    headers: z.record(z.string()).default({}),
    body: z.string().default(''),
    timeout_ms: z.number().int().min(1000).max(30000).default(10000),
    save_response_path: z.string().optional(),
  });
  ```
- Atualizar `nodeBranches` para emitir `[{ id: 'success', label: 'Sucesso (2xx)' }, { id: 'failure', label: 'Falha' }]`.

**Step 3: Implementar Validação de Publish**
- Validar se a URL é HTTP(S) válida.
- Exigir arestas nas saídas `success` e `failure` (ou fallback).
- Adicionar ao `NOS_DA_SUPERFICIE.followup` e `crm_automation`.

**Step 4: Implementar Execução no Motor com Guard Anti-SSRF**
- Em `node-handlers.ts` e `engine.ts`, executar `fetch` com timeout (`AbortSignal.timeout`).
- Interpolar variáveis do lead (`{{contact.name}}`, `{{contact.phone}}`, etc.) na URL e no corpo via `renderizarTextoDeFollowup`.
- Passar a URL de destino pelo guard anti-SSRF `destinoInternoAutorizado()`.
- Se `save_response_path` configurado, extrair campo do JSON e gravar no contexto do enrollment.

**Step 5: Implementar Suporte na Prévia Local (`session.ts`)**
- No ensaio de prévia, registrar evento simulado `http_request` no histórico sem disparar requisições externas reais (ou fazer probe seguro em ambiente de teste).
- Permitir ao usuário no modal da prévia escolher se quer simular caminho "Sucesso" ou "Falha".

**Step 6: UI — Visual do Nó e Formulário de Edição**
- Criar `HttpRequestForm.tsx` com:
  - Seletor de método HTTP (`GET`, `POST`, `PUT`, `DELETE`).
  - Campo de URL com inserção de tags/variáveis.
  - Tabela de cabeçalhos chave/valor.
  - Editor de JSON body.
- Adicionar ícone de Globo/Nuvem no `nodeVisuals.ts`.

---

### Task 2: Intervalo Inteligente (`wait` avançado)

**Files:**
- Create: `lib/followup/intervalo-inteligente.ts`
- Test: `lib/followup/intervalo-inteligente.test.ts`
- Modify: `lib/followup/graph-schema.ts`
- Modify: `lib/followup/node-handlers.ts`
- Modify: `lib/followup/preview/clock.ts`
- Modify: `app/app/ai/followups/[id]/_components/forms/WaitForm.tsx`

**Step 1: Testes unitários de cálculo de intervalo**
- Criar casos de teste para:
  - Próximo horário comercial (ex.: se agora é 20h, pular para 09h do dia seguinte).
  - Pular finais de semana (sexta 19h -> segunda 09h).
  - Esperar N dias úteis em horário definido.
  - Horário específico do dia (ex.: aguardar até as 08:30).

**Step 2: Implementar módulo puro `intervalo-inteligente.ts`**
- Função `calcularProximoInstante(config, agora, timezone)`.
- Suporte a fusos horários (padrão `America/Sao_Paulo`).

**Step 3: Expandir Schema do `wait` em `graph-schema.ts`**
- Manter `mode: 'fixed'` 100% retrocompatível.
- Adicionar novos modos:
  ```typescript
  | { mode: 'business_hours'; start_time: string; end_time: string; days_of_week: number[] }
  | { mode: 'time_of_day'; target_time: string; delay_days?: number }
  | { mode: 'business_days'; days: number; deliver_at?: string }
  ```

**Step 4: Atualizar Avaliação do Motor (`node-handlers.ts`)**
- No agendamento da espera (`schedule_wait`), calcular o timestamp exato de vencimento com `calcularProximoInstante()`.

**Step 5: UI no `WaitForm.tsx`**
- Adicionar seletor de tipo de espera:
  1. Duração fixa (minutos / horas / dias).
  2. Próximo horário comercial (início, fim e dias de atendimento).
  3. Horário específico do dia (ex.: "Às 09:00 do dia seguinte").
  4. Dias úteis.

---

### Task 3: Menu Interativo WhatsApp (`interactive_menu`)

**Files:**
- Modify: `lib/followup/graph-schema.ts`
- Modify: `lib/followup/validate-publish.ts`
- Modify: `lib/followup/node-handlers.ts`
- Modify: `lib/waha/media-send.ts`
- Modify: `lib/channels/meta/send.ts`
- Create: `app/app/ai/followups/[id]/_components/forms/InteractiveMenuForm.tsx`
- Modify: `app/app/ai/followups/[id]/_components/nodes/nodeVisuals.ts`
- Modify: `lib/followup/preview/session.ts`
- Modify: `app/app/ai/followups/[id]/_components/preview/FlowPreview.tsx`
- Test: `lib/followup/interactive-menu.test.ts`

**Step 1: Testes de Schema e Ramificações do Menu**
- Menu com 3 botões gera 3 saídas nomeadas com IDs das opções + saída `timeout`.
- Validação: botões com no máximo 20 caracteres (limite do WhatsApp).
- Lista com até 10 itens com título (24 chars) e descrição opcional.

**Step 2: Schema Zod em `graph-schema.ts`**
- Adicionar `'interactive_menu'` ao `NODE_TYPES`.
- Config com texto de cabeçalho, corpo, rodapé, tipo (`buttons` ou `list`) e array de opções.
- `nodeBranches`: deriva saídas dinâmicas a partir da lista de opções cadastradas.

**Step 3: Envio pelo Canal (WAHA e Meta Cloud API)**
- WAHA: payload de `sendButtons` ou `sendList`.
- Meta Cloud API: payload `type: 'interactive'`, com `action.buttons` ou `action.sections`.

**Step 4: Recepção e Casamento da Resposta**
- No webhook de mensagem recebida (`interactive_response`), capturar o `button_reply.id` ou `list_reply.id`.
- Motor avança a aresta que corresponde exatamente ao `branch_id` da opção clicada.

**Step 5: Prévia Interativa no Chat (`FlowPreview`)**
- No painel de prévia, renderizar botões clicáveis no balão de chat simulado.
- Clique do usuário simula a resposta imediata e avança o fluxo no canvas com feedback visual iluminado.

**Step 6: Formulário `InteractiveMenuForm.tsx`**
- Interface para adicionar/reordenar botões ou seções de lista com contadores de caracteres para evitar rejeição da Meta.

---

### Task 4: Conexão de Fluxo / Subfluxo (`flow_connection`)

**Files:**
- Modify: `lib/followup/graph-schema.ts`
- Modify: `lib/followup/validate-publish.ts`
- Modify: `lib/followup/engine.ts`
- Modify: `lib/followup/preview/session.ts`
- Create: `app/app/ai/followups/[id]/_components/forms/FlowConnectionForm.tsx`
- Modify: `app/app/ai/followups/[id]/_components/nodes/nodeVisuals.ts`
- Test: `lib/followup/flow-connection.test.ts`

**Step 1: Teste de Schema e Validação de Ciclos**
- Proibir que um fluxo aponte para si mesmo diretamente sem nó de espera.
- Exigir que o `target_flow_id` pertença à mesma organização.

**Step 2: Schema Zod em `graph-schema.ts`**
- Nó terminal de transição:
  ```typescript
  export const FlowConnectionConfigSchema = z.strictObject({
    target_flow_id: z.string().uuid(),
    reset_variables: z.boolean().default(false),
  });
  ```
- O nó funciona como saída terminal do fluxo corrente e entrada no fluxo alvo.

**Step 3: Transição no Motor (`engine.ts`)**
- Conclui o enrollment do fluxo atual com desfecho `transferred_to_flow`.
- Inscreve o lead no fluxo de destino chamando `matricularLeadNoFluxo()`.

**Step 4: UI no Canvas**
- `FlowConnectionForm.tsx` com Select de fluxos da organização com status ativo/publicado.
- Botão "Abrir fluxo de destino em nova aba" no painel de configuração para facilitar a navegação.

---

### Task 5: Disparo de Pixel / Evento de Conversão (`conversion_pixel`)

**Files:**
- Modify: `lib/followup/graph-schema.ts`
- Modify: `lib/followup/node-handlers.ts`
- Modify: `lib/followup/engine.ts`
- Create: `app/app/ai/followups/[id]/_components/forms/ConversionPixelForm.tsx`
- Modify: `app/app/ai/followups/[id]/_components/nodes/nodeVisuals.ts`
- Test: `lib/followup/conversion-pixel.test.ts`

**Step 1: Testes de Schema e Disparo**
- Suporte aos eventos canônicos: `Lead`, `Purchase`, `Schedule`, `Contact`, `CompleteRegistration`.
- Interpolação de valor monetário (`value`) e moeda (`currency`).

**Step 2: Schema Zod em `graph-schema.ts`**
- Configuração de canal (Meta CAPI, Google Ads, ou ambos), nome do evento, valor e parâmetros adicionais.

**Step 3: Motor de Execução**
- Disparo do evento via `dispararEventoMetaCapi()` e `dispararConversaoGoogleAds()`.
- Captura de `ctwa_clid`, `fbclid`, telefone e e-mail com hash SHA-256 para match de alta pontuação na Meta.

**Step 4: UI no Canvas**
- Card visual com ícone de Alvo/Conversão.
- `ConversionPixelForm.tsx` com presets dos principais eventos da Meta/Google.

---

### Task 6: Carrossel de Mídia Interativo (`carousel`)

**Files:**
- Modify: `lib/followup/graph-schema.ts`
- Modify: `lib/followup/validate-publish.ts`
- Modify: `lib/waha/media-send.ts`
- Modify: `lib/channels/meta/send.ts`
- Create: `app/app/ai/followups/[id]/_components/forms/CarouselForm.tsx`
- Modify: `app/app/ai/followups/[id]/_components/nodes/nodeVisuals.ts`
- Modify: `app/app/ai/followups/[id]/_components/preview/PreviewMedia.tsx`
- Test: `lib/followup/carousel-node.test.ts`

**Step 1: Testes de Schema**
- Mínimo 2 cards, máximo 10 cards.
- Cada card contém imagem/vídeo, título, descrição opcional e até 2 botões de ação rápida (URL ou resposta de texto).

**Step 2: Suporte ao Envio**
- WhatsApp Cloud API: payload nativo `type: 'template'` com componente `CAROUSEL`.
- WAHA / Canais sem suporte nativo a carrossel: fallback degradado inteligente enviando cada card em sequência com intervalo de 1.5s para não parecer rajada de spam.

**Step 3: Renderização na Prévia Local**
- Implementar carrossel horizontal deslizante em `PreviewMedia.tsx` com botões funcionais de teste.

**Step 4: UI no Canvas**
- `CarouselForm.tsx` com gerenciador de cards (adicionar, remover, ordenar, preview da imagem e botões de cada card).

---

## Verificação e Critérios de Conclusão

1. **Testes Unitários:** Todos os testes de schema, publish validator, handlers e motor devem rodar 100% verdes (`pnpm vitest run`).
2. **Typecheck:** `pnpm typecheck` estritamente limpo sem `any` implícito ou erros de tipos.
3. **Simulador de Prévia:** Todos os 6 nós devem funcionar interativamente na "Prévia Local de Conversa" no editor.
4. **Higiene Docker:** Build standalone de produção testado e rodando sem erros de runtime.
