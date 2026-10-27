# Prévia local de conversa no editor de follow-ups

Data: 2026-10-27
Estado: proposta técnica pronta para implementação; recurso ainda não implementado.
Escopo: instalação local do DeskcommCRM, editor de follow-ups.

## Objetivo

Permitir que o operador percorra seu rascunho como uma conversa, escreva como cliente, reproduza as mídias e avance o tempo das esperas, sem conectar um número de WhatsApp e sem configurar um provedor de IA.

A prévia serve para revisar a experiência da cliente e descobrir erros no desenho. Não comprova entrega pelo canal, confirmação financeira, comportamento de um modelo de IA ou eficácia comercial.

## Evidências verificadas no clone atual

- `FlowCanvas.tsx` já monta `liveGraph` com nós, arestas e configurações, inclusive alterações ainda não salvas.
- `PublishBar.tsx` é a superfície existente para as ações do editor.
- `lib/followup/node-handlers.ts` exporta as decisões puras `processNode` e `selectEdge`. A orquestração com banco, filas e envio fica em `lib/followup/engine.ts`.
- `lib/automation/texto-do-followup.ts` exporta `renderizarTextoDeFollowup`, que suporta `{{nome}}`, `{{contact.*}}` e `{{lead.*}}`.
- O fluxo de Cifras Gospel tem 48 nós e 97 arestas: 1 trigger, 28 action/text, 2 wait/fixed, 7 match_reply, 3 internal_task e 7 end.
- Os seis anexos de demonstração usam o Storage local. Suas URLs persistidas usam a origem interna do Docker, enquanto `NEXT_PUBLIC_SUPABASE_URL` fornece a origem acessível ao navegador.
- O teste de agente existente é outra superfície: chama um modelo e não oferece uma conversa que percorra esse grafo inteiro.

Esses fatos foram obtidos por leitura de código e do arquivo exportado do fluxo, não por executar uma prévia que já existisse.

## Alternativas consideradas

| Abordagem | Benefício | Custo e limitação |
|---|---|---|
| Conversa demonstrativa escrita à parte | Protótipo rápido | Não acompanha o fluxo editável; cria duas fontes de verdade. |
| Sessão no navegador com os handlers puros existentes | Reaproveita as decisões dos nós; baixo consumo; usa o rascunho aberto | Exige um adaptador explícito para relógio, respostas e efeitos simulados. Recomendada. |
| Canal de teste com inscrições e filas próprias no servidor | Pode cobrir mais partes da orquestração completa | Exige isolamento de dados, ciclo de vida e manutenção adicionais. Desnecessário para o primeiro escopo. |

## Experiência proposta

1. O operador abre o fluxo e clica em **Prévia**, próximo a Salvar e Publicar.
2. Um painel amplo mostra a conversa e o estado atual. Em telas pequenas, ocupa a área disponível e mantém o campo de resposta acessível.
3. A sessão começa com uma cópia do `liveGraph`, identificada como rascunho de teste. Não é necessário salvar ou publicar.
4. Um contato fictício fornece nome e dados opcionais para as variáveis. A prévia não consulta contatos reais.
5. Texto aparece em balões. Áudios e vídeos têm controles de reprodução; documentos aparecem como anexos. Reprodução é iniciada pelo usuário, sem autoplay.
6. O operador escreve uma resposta como cliente. Os nós de resposta usam as regras reais e a precedência das arestas do grafo.
7. Durante uma espera, a interface mostra o motivo, o prazo virtual e **Avançar até o próximo evento**. Uma espera de 24 horas pode ser atravessada sem aguardar um dia.
8. **Pausar/Continuar** controla a sessão. **Reiniciar** começa outro ensaio; **Encerrar** libera recursos da sessão.
9. Um histórico mostra a etapa, o ramo escolhido, os efeitos simulados, o tempo percorrido e a causa de interrupção. **Ir para etapa** leva ao nó responsável no editor.

Não haverá uma pergunta obrigatória antes de cada avanço. A conversa prossegue até encontrar resposta, espera, término ou uma limitação que precise de intervenção.

## Arquitetura

```text
FlowCanvas.liveGraph + dados fictícios
               |
               v
Snapshot imutável da sessão
               |
               v
Adaptador da prévia --> processNode / selectEdge / renderizador existentes
               |
               v
Transcript + relógio virtual + histórico das decisões
               |
               v
Painel de conversa --> selecionar nó no editor --> corrigir --> reiniciar
```

O adaptador roda no navegador e contém somente estado de ensaio. Não importa `engine.ts`, clientes Supabase de servidor, workers, adaptadores de canal ou funções que gravam tarefas/contatos.

O compartilhamento é das decisões puras dos nós. A camada de persistência, o transporte e os mecanismos operacionais de produção não são executados. Se for necessário extrair uma função pura para tornar o import compatível com o navegador, manter o comportamento e os consumidores existentes cobertos por testes de paridade.

## Escopo da primeira entrega

| Nó | Comportamento na prévia |
|---|---|
| trigger | Inicia o percurso da sessão. |
| action/text | Renderiza texto e anexo, registra envio simulado e reconhece sua conclusão uma única vez. |
| wait/fixed | Agenda um prazo virtual; permite avançar o tempo; reproduz a política de resposta antecipada aplicável. |
| match_reply | Aguarda mensagem da etapa, aplica `eq`/`contains`, ordem dos ramos, fallback e saída de ausência de resposta. |
| internal_task | Mostra a tarefa que seria criada, com prioridade e responsável, sem gravá-la. |
| end | Encerra com o resultado e a nota configurados, sem iniciar outros fluxos reais. |

Isso cobre os tipos presentes no funil atual. Nós e modos adicionais são detectados antes do início e também no percurso. O operador verá a etapa não suportada; o simulador não a ignora nem apresenta aprovação fictícia.

`ai_classify`, `action/ai_message`, esperas adaptativas, skills, coleta, modelos externos e execução encadeada de outros fluxos ficam para uma fase posterior. Uma seleção manual de resultado de IA, se adicionada depois, será identificada como intervenção simulada.

## Relógio e respostas

- O relógio de negócio pertence à sessão e pode avançar sem mudar o relógio do computador ou os tempos gravados no fluxo.
- O modo normal respeita as pausas configuradas. O salto explícito move o relógio até o próximo prazo e processa os eventos vencidos em ordem.
- A hora virtual, os estados de espera e o instante em que a pergunta ficou ativa são registrados.
- Uma resposta é consumida uma vez; não pode responder automaticamente a uma segunda pergunta.
- Texto não reconhecido segue o fallback real. A prévia não interpreta por IA e não remove acentos se o handler de produção não o fizer.
- Uma resposta durante `wait` não recebe uma regra inventada: o adaptador deve reproduzir a reatividade aplicável ao fluxo e respeitar espera imune à resposta.
- Empates entre envio de resposta e vencimento usam ordem determinística de eventos, registrada no histórico.
- Reutilizar `TETO_DE_PASSOS_DO_MOTOR` para limitar os passos contabilizados da sessão, com a mesma contagem das etapas suportadas; limitar a trilha local a 2.000 eventos. Ao atingir um teto, interromper com diagnóstico e opção de reiniciar, sem remover eventos silenciosamente.
- Pausar e fechar cancelam timers locais; reabrir não duplica mensagens ou sessões.

## Humano, PARAR e pagamento

Enviar `HUMANO`, `PARAR`, `paguei` ou `comprovante` é uma entrada normal no grafo. A prévia mostra exatamente o caminho configurado e os efeitos simulados.

Se `HUMANO` apenas leva a uma tarefa e ao fim, a interface informa **tarefa simulada; este nó não transfere a conversa**. Não transforma esse caminho em handoff global por conveniência.

Se `PARAR` encerra a sequência, esse é o resultado mostrado. O bloqueio global aplicado pela ingestão do canal não foi comprovado por esse ensaio.

`Paguei` não é confirmação bancária. Uma tarefa de conferência aparece como tarefa simulada e não libera artificialmente uma etapa ausente do grafo.

Os controles **Simular atendente assumindo**, **Simular retomada** e **Simular opt-out global** poderão aplicar eventos externos explicitamente identificados como cenário. Esses controles devem respeitar a política de handoff selecionada; não são acionados silenciosamente só porque uma palavra apareceu no chat. A reprodução desses eventos exige uma decisão pura compartilhada ou teste de paridade com a reatividade real.

## Mídias locais

Reutilizar os seis arquivos mock que o usuário autorizou. Não copiar mídia pessoal para fixtures versionadas nem modificar os anexos do fluxo.

Para URLs de objetos públicos do Storage desta instalação, mapear somente a origem igual a `SUPABASE_SERVER_URL` para a origem pública `NEXT_PUBLIC_SUPABASE_URL`, preservando o caminho permitido `/storage/v1/object/public/`. A origem interna deve chegar ao componente como configuração pública de origem, nunca como segredo ou cliente de banco.

Não criar um proxy HTTP genérico nem aceitar uma URL arbitrária para busca no servidor. URLs externas suportadas continuam sujeitas ao acesso do navegador; falha de carregamento aparece como anexo indisponível, sem travar a conversa. Arquivos privados exigem a assinatura autorizada existente e ficam fora deste primeiro mapeamento de objetos públicos.

Usar `preload="metadata"`, carregar o painel sob demanda e evitar download de todos os vídeos ao abrir o editor. Os PDFs ausentes continuam visivelmente pendentes.

## Estado, privacidade e custo

- Estado apenas em memória durante o ensaio; sem nova tabela, inscrição, job, pedido, mensagem ou métrica comercial no CRM.
- Não enviar testes a WhatsApp, Meta, pagamentos, e-mail ou webhooks de automação.
- Não exigir chave de IA nem fazer chamadas a modelos no MVP.
- A aplicação local e o Storage continuam necessários para abrir o editor e os arquivos locais. Não há um novo serviço permanente ou cron para a prévia.
- Um registro de decisões visível faz parte da sessão. Exportação de relatório JSON/Markdown pode ser incluída após o percurso básico; exportação não deve incluir segredos ou contatos reais.

## Critérios de aceite

1. Abrir Prévia do fluxo atual de 48 nós sem publicar, conectar número ou configurar IA.
2. Percorrer apresentação, demonstração, entrega, contribuição e upsell conforme as arestas existentes.
3. Reproduzir os quatro áudios e dois vídeos locais no navegador, ou mostrar falha específica por anexo.
4. Atravessar esperas curtas e de horas com controle do relógio, mantendo a duração original no editor.
5. Conferir ramos de sim, não, humano, parar, comprovante, texto não reconhecido e ausência de resposta.
6. Uma resposta não pula duas perguntas; um envio não aparece duplicado depois de pausar ou reiniciar.
7. Refletir alterações ainda não salvas ao iniciar um novo ensaio; o snapshot em andamento permanece estável.
8. Mostrar efeitos internos e etapas não suportadas com rótulos explícitos.
9. Demonstrar pela rede e pelo banco que a prévia não executa envios nem grava registros operacionais.
10. Abrir o recurso pelo botão do editor e retornar ao nó que precisa de correção, em desktop e largura móvel.

## Integração com a doutrina do projeto

- Entrada: `liveGraph` do editor, configurações da política do fluxo e dados fictícios escolhidos pelo operador.
- Saída: transcript, histórico das decisões e seleção do nó no editor.
- Registro: trilha transitória da sessão, visível no painel; sem falsa auditoria de mensagem enviada.
- Porta: botão em `PublishBar`; não exige nova rota de página ou item solto na navegação.
- Interrupção: pausa, encerramento e proteção contra ciclos com motivo explícito.
- Configuração: dados fictícios, relógio virtual e indicadores de limitação no próprio painel.
- Continuidade: eventos de passagem e retomada são cenários explícitos, separados da interpretação do texto.
- Retorno: erro aponta para o nó, operador corrige o grafo e reinicia com o rascunho atualizado.
- Mapa: acrescentar o caminho editor → prévia → decisões/histórico → editor em JSON de arquitetura, com status implementado somente após entrega.
- Destino proposto: infraestrutura de diagnóstico do editor existente. Não é uma automação do nicho gospel nem um novo canal de atendimento.

## Limites da evidência

Um ensaio bem-sucedido valida o percurso local suportado. Não comprova envio pelo provedor, políticas de horário e orçamento no servidor, detecção global de saída na ingestão, confirmação de Pix, entrega de mídia por WhatsApp, respostas de IA ou conversão de tráfego.

O relógio local não simula a quantização do ticker de produção a cada dez segundos nem latência de rede. Esses efeitos devem ser ensaiados separadamente antes da ativação do número.
