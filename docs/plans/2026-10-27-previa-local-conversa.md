# Prévia local de conversa — plano de implementação

> Execução: aplicar a skill `executing-plans` para executar e validar cada marco deste plano. Este arquivo é um plano; os componentes abaixo ainda não foram implementados.

**Goal:** percorrer o rascunho real de follow-up em um chat local, com mídias e relógio virtual, sem número de WhatsApp nem credencial de IA.

**Architecture:** adicionar uma sessão transitória no navegador, alimentada por uma cópia do grafo aberto no editor. Reutilizar os handlers puros de decisão e o renderizador de variáveis; converter os efeitos em eventos de ensaio. Acesso às mídias públicas locais usa o mapeamento entre as origens interna e pública do Supabase, sem proxy genérico.

**Tech Stack:** Next.js/React/TypeScript existentes, React Flow existente, componentes de interface e i18n do Deskcomm, HTML audio/video, Vitest e Playwright já previstos pelo projeto. Sem banco novo ou serviço adicional.

**Especificação:** `docs/superpowers/specs/2026-10-27-previa-local-conversa-design.md`.

---

## Estado de partida e proteção do trabalho existente

O clone local tem mudanças anteriores no WaitForm, schema de esperas, arquivos de scheduler, testes e documentação de importação. Não são trabalho desta prévia e não devem ser revertidas, sobrescritas ou incluídas inadvertidamente em commits.

Antes de implementação, registrar `git status --short` e a revisão de origem. Preparar o checkout/branch conforme `CLAUDE.md`, preservando os ajustes locais e seus limites de cinco segundos/dez segundos. A sincronização com a origem não pode descartar esses ajustes. Este planejamento não executa merge, instalação de dependências, publicação ou reconstrução dos containers.

O arquivo de fluxo atual é referência de aceite local. Para testes versionados, criar uma cópia anonimizada que preserve os tipos, as regras e a topologia, mas substitua telefone, chave Pix, link de grupo e URLs pessoais. Os arquivos reais de áudio/vídeo permanecem no Storage local.

O clone de Deskcomm não tem `node_modules` na inspeção de partida. Preparar dependências reais no checkout de implementação, com Node compatível com `package.json` e `pnpm install --frozen-lockfile`; não usar symlink de `node_modules`. A instalação de dependências é etapa futura e não foi executada pelo planejamento.

## Marco 1 — contrato e sessão determinística

**Criar:**
- `lib/followup/preview/types.ts`
- `lib/followup/preview/session.ts`
- `lib/followup/preview/session.test.ts`
- `tests/fixtures/followup-preview/cifras-gospel.fluxo.json`

**Reaproveitar:**
- `lib/followup/graph-schema.ts`: forma e limites do grafo.
- `lib/followup/node-handlers.ts`: `processNode`, `selectEdge` e tipos de decisão.
- `lib/automation/texto-do-followup.ts`: `renderizarTextoDeFollowup`.

### Passos

1. Anonimizar a referência do funil; confirmar que conserva 48 nós e 97 arestas.
2. Definir a sessão com `graphSnapshot`, `virtualNowMs`, `currentNodeId`, ocupação da etapa, mensagens de entrada consumidas, efeitos simulados, transcript e resultado.
3. Definir estados da interface: pronta, executando, pausada, aguardando resposta, aguardando prazo, concluída, não suportada e erro.
4. Definir eventos locais explícitos: iniciar, responder, avançar prazo, pausar, continuar, reiniciar e encerrar.
5. Escrever os testes dos seis tipos usados pelo funil e das condições de interrupção antes de implementar o adaptador.
6. Implementar ações síncronas de ensaio, com os sinais de conclusão que o handler espera; não enfileirar jobs reais.
7. Reutilizar `TETO_DE_PASSOS_DO_MOTOR` e a contagem dos tipos de etapa para limitar a sessão; limitar a trilha a 2.000 eventos. Registrar nó/aresta selecionados e interromper ao atingir o teto. Falhas não podem virar avanço silencioso.
8. Auditar imports do bundle: nenhum módulo de banco, canal, fila ou credencial pode ser dependência de runtime do simulador.

**Verificação:**
`pnpm vitest run lib/followup/preview/session.test.ts`

**Resultado esperado:** decisões dos nós suportados passam; grafo inválido, nó não suportado e ciclo sem saída terminam com diagnóstico. Nenhum contato ou mensagem real é necessário.

## Marco 2 — relógio virtual e respostas fiéis

**Criar:**
- `lib/followup/preview/clock.ts`
- `lib/followup/preview/clock.test.ts`
- `lib/followup/preview/scenarios.test.ts`

**Modificar:**
- `lib/followup/preview/session.ts`

**Referência de comportamento:**
- `lib/followup/node-handlers.ts`
- `lib/followup/reactivity.ts`
- `lib/followup/aplicar-inbound.ts`

### Passos

1. Separar avanço do relógio de avanço do nó: relógio vencido produz um evento, não altera a duração gravada.
2. Implementar a execução normal e o salto até o próximo evento, com ordem estável quando resposta e vencimento têm o mesmo instante virtual.
3. Representar o início da pergunta e o consumo único de resposta. Reproduzir prioridade de ramos e comparação `eq`/`contains` sem normalização adicional.
4. Cobrir resposta durante espera, espera imune, silêncio, fallback e cancelamento por resposta quando configurado.
5. Implementar pausa/retomada da sessão sem repetição de envios. Encerrar e reiniciar descartam timers pendentes.
6. Introduzir cenários explícitos de handoff/retomada e opt-out somente após conferir a regra de produção. Se a regra estiver acoplada a banco, extrair a decisão pura com testes de paridade; não importar a orquestração de banco no navegador.
7. Marcar como simulados os eventos externos e os efeitos de tarefas; palavra digitada e evento de plataforma permanecem coisas diferentes.

**Verificação:**
`pnpm vitest run lib/followup/preview/clock.test.ts lib/followup/preview/scenarios.test.ts`

**Resultado esperado:** os ramos de silêncio e resposta são reproduzíveis; saltar 24 horas é imediato; uma mensagem não responde a duas etapas; pausa e reinício não deixam atividade residual.

## Marco 3 — mídias e variáveis

**Criar:**
- `lib/followup/preview/media-url.ts`
- `lib/followup/preview/media-url.test.ts`
- `app/app/ai/followups/[id]/_components/preview/PreviewMedia.tsx`
- `app/app/ai/followups/[id]/_components/preview/PreviewMedia.test.tsx`

**Modificar:**
- `app/app/ai/followups/[id]/page.tsx`
- `app/app/ai/followups/[id]/_components/FlowBuilder.tsx`

### Passos

1. Derivar a configuração de origens da instalação na página autenticada, passando somente as origens necessárias ao cliente.
2. Mapear a origem interna para a pública somente quando houver correspondência exata de origem e caminho de objeto público do Storage. Não alterar o grafo salvo.
3. Manter URLs externas permitidas como referências de mídia. Não introduzir busca no servidor controlada por URL do usuário; bloquear esquemas executáveis e mostrar erro legível.
4. Renderizar áudio, vídeo, imagem e cartão de documento usando componentes existentes quando aplicável. Reprodução é manual e arquivos pesados não são carregados antecipadamente.
5. Mostrar anexos pendentes ou indisponíveis no transcript e permitir prosseguir na avaliação textual.
6. Reaproveitar o renderizador de variáveis com contexto fictício; dados ausentes seguem o comportamento real e geram aviso de configuração na trilha.

**Verificação:**
`pnpm vitest run lib/followup/preview/media-url.test.ts 'app/app/ai/followups/[id]/_components/preview/PreviewMedia.test.tsx'`

**Resultado esperado:** os seis anexos atuais abrem pela origem pública local; URL não pertencente ao Storage não é reescrita; nenhuma credencial chega ao browser; falha em anexo não aparenta entrega confirmada.

## Marco 4 — painel de conversa e entrada no editor

**Criar:**
- `app/app/ai/followups/[id]/_components/preview/FlowPreview.tsx`
- `app/app/ai/followups/[id]/_components/preview/PreviewTranscript.tsx`
- `app/app/ai/followups/[id]/_components/preview/PreviewControls.tsx`
- `app/app/ai/followups/[id]/_components/preview/useFlowPreview.ts`
- `app/app/ai/followups/[id]/_components/preview/FlowPreview.test.tsx`

**Modificar:**
- `app/app/ai/followups/[id]/_components/PublishBar.tsx`
- `app/app/ai/followups/[id]/_components/FlowCanvas.tsx`

### Passos

1. Adicionar botão **Prévia** à barra existente e carregar o painel sob demanda.
2. Ao abrir, tirar um snapshot de `liveGraph`, incluindo configurações e alterações não salvas; não usar apenas o último grafo retornado pela API.
3. Mostrar contato fictício, balões, anexo, campo de mensagem, relógio e estado da sessão.
4. Oferecer iniciar, pausar/continuar, avançar até o próximo evento, reiniciar e encerrar com nomes compreensíveis.
5. Exibir a trilha de decisões e um atalho **Ir para etapa**, que seleciona/enquadra o nó no canvas.
6. Alertar quando uma etapa não é suportada e quando uma tarefa ou ação externa apenas seria executada.
7. Garantir foco de teclado, fechamento acessível e funcionamento em largura de 390 px, sem campo de resposta oculto.
8. Incorporar os textos ao sistema `useT` existente. Evitar layout que dependa de cor para distinguir cliente, automação, espera e erro.

**Verificação:**
`pnpm vitest run 'app/app/ai/followups/[id]/_components/preview/FlowPreview.test.tsx'`

**Resultado esperado:** abrir a prévia não salva nem publica; o painel mostra o rascunho atual; encerrar libera a sessão; corrigir um nó e iniciar outra prévia usa o texto novo.

## Marco 5 — validação do funil e entrega local

**Criar:**
- `tests/e2e/followup-preview.spec.ts`
- `docs/features/previa-local-fluxos.md`
- `docs/architecture/followup-previa-local.architecture.json`
- `.changes/previa-local-fluxos.md` no formato exigido pela régua de releases do repositório.

**Modificar quando aplicável:**
- `docs/architecture/README.md`
- A documentação de autoridade que afirmar que a prévia ainda não existe.

### Casos de aceite na tela

1. Primeiro contato → apresentação → demonstração → aceite → entrega.
2. Falta de resposta → prazo → lembrete → término que o grafo realmente definir.
3. Recusa, pedido de humano, pedido de parar e texto não previsto em cada pergunta relevante.
4. Comprovante ou `paguei` → tarefa simulada de conferência, sem afirmar pagamento aprovado.
5. Interesse nas aulas → demonstração → decisão → etapa de Pix do upsell.
6. Avançar esperas longas, responder durante espera curta, pausar, reiniciar e fechar sem duplicidade.
7. Reproduzir os áudios/vídeos locais com sucesso observável; PDFs ausentes identificados como pendentes.
8. Modificação não salva aparece no novo ensaio e não modifica a sessão já iniciada.
9. Nó não suportado, alvo de aresta inexistente, ciclo e mídia inválida produzem diagnóstico visível e link para correção.
10. Desktop e 390 px: campo de resposta, controles, histórico e retorno ao editor permanecem acessíveis.

### Provar isolamento

Instrumentar as requisições do browser durante uma sessão já aberta: permitir carregamentos de UI e mídia; falhar se a prévia tentar endpoints de criação de contato, inscrição, envio, publicação, pagamentos, Meta ou credenciais de modelo. Conferir também a ausência de novos registros operacionais no ambiente de teste. Manter fetches normais de leitura do editor separados da classificação de efeitos do simulador.

### Comandos previstos

```text
pnpm typecheck
pnpm lint
pnpm lint:channels
pnpm vitest run lib/followup/preview
pnpm vitest run 'app/app/ai/followups/[id]/_components/preview'
pnpm vitest run lib/followup/node-handlers.test.ts lib/automation/template.test.ts tests/unit/followup-interpola-variaveis-do-contato.test.ts
pnpm playwright test tests/e2e/followup-preview.spec.ts
```

Os arquivos de regressão acima existem no clone inspecionado. Se a extração de regras puras tocar outro módulo de produção, incluir o teste relevante desse módulo. Se for adicionada rota ou tabela além do desenho proposto, revisar autorização, isolamento e os gates de banco; isso é expansão de escopo e não parte implícita deste plano.

As verificações de UI devem incluir o app construído no ambiente local, sem WhatsApp e sem chave de IA. Não declarar êxito apenas por teste de reducer ou HTTP 200.

### Aplicar na instalação atual após validação

```powershell
$env:PATH = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:PATH"
docker compose --env-file C:\Projetos\deskcomm-crm\.env.local -f C:\Projetos\crm-avaliacao\deskcomm.compose.yml build app
docker compose --env-file C:\Projetos\deskcomm-crm\.env.local -f C:\Projetos\crm-avaliacao\deskcomm.compose.yml up -d --no-deps app
```

Esses comandos são etapas futuras de aplicação, não foram executados por este planejamento. Não recriar o banco ou remover volumes. A interface nova deve aparecer no mesmo fluxo e porta da avaliação atual, conservando a configuração do agendador.

## Primeiro resultado utilizável

O operador abre o fluxo Cifras Gospel, clica em **Prévia**, vê as mensagens e mídias, responde como cliente e atravessa o funil usando o relógio virtual. O histórico permite localizar a etapa que precisa de revisão. Nenhuma conta de WhatsApp, cobrança real ou chamada a modelo é acionada.

## Depois do primeiro resultado

Adicionar suporte a outros tipos de nó conforme aparecerem nos fluxos reais. Exportação do ensaio, cenários salvos e teste opcional de respostas de IA podem vir depois. Cada ampliação deve manter explícita a diferença entre regra reproduzida, intervenção simulada e integração externa que ainda precisa de prova real.
