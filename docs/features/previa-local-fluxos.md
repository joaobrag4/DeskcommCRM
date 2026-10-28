# Prévia local de conversa

No editor de follow-up, **Prévia** abre uma conversa fictícia ao lado do canvas. **Iniciar prévia** percorre o rascunho aberto, inclusive alterações ainda não salvas. Não exige conexão de mensageria nem chave de IA.

## Usar e corrigir

- Responda como o contato no campo da conversa. Os ramos usam as regras reais de comparação do fluxo.
- A etapa atual recebe um contorno e um rótulo de estado; as etapas e conexões percorridas continuam marcadas. **Acompanhar** mantém a etapa atual enquadrada; pode ser desligado para explorar o canvas.
- O relógio segue as durações cadastradas. **Avançar prazo** salta até o próximo evento sem alterar a duração salva. **Pausar** congela a sessão.
- O histórico permite localizar a etapa responsável por cada decisão. **Editar etapa** retorna ao formulário do nó; ao reiniciar a prévia, o novo rascunho é usado. Uma sessão em andamento mantém seu próprio snapshot.
- Fechar, encerrar ou reiniciar interrompe os temporizadores locais. O histórico é transitório e desaparece ao fechar.

## Escopo e limites

Suporta início, mensagem com texto fixo e mídia, espera fixa, comparação de resposta, tarefa interna e fim. Etapas ou modos ainda não suportados interrompem o ensaio com diagnóstico. Não há inferência de intenção nem chamada a modelo.

Áudios e vídeos têm reprodução manual. URLs de objetos públicos do Storage podem ser traduzidas da origem interna da instalação para a pública, apenas na visualização. Arquivos ausentes ou inválidos aparecem como pendência; a prévia textual continua. Não existe proxy genérico de arquivos.

Uma tarefa aparece como **simulada**. Digitar “paguei” não confirma recebimento bancário. Uma saída de humano ou de recusa executa apenas o que o grafo definir: criar tarefa e terminar não equivale a alterar o atendimento real. Eventos externos de opt-out e de assumir/retomar atendimento não são gerados nesta versão.

O ensaio não cria contatos, inscrições, mensagens, cobranças, tarefas persistidas ou eventos de conversão. Não salva nem publica o fluxo. Os handlers puros de `node-handlers.ts` decidem as transições; `engine.ts`, banco, filas e canais não integram o simulador. O limite de passos do motor e o teto de 2.000 eventos encerram ciclos com diagnóstico.

## Arquitetura e retorno

Destino: **infraestrutura** de diagnóstico do editor existente. A operação comum permanece inteira quando ninguém usa a prévia; não há ativação por organização nem mudança de execução em produção.

Living System Checklist:

1. Entrada: `FlowCanvas.liveGraph`, copiado por `createSession`.
2. Saída: transcript de `FlowPreview` e decoração transitória do canvas.
3. Registro: `PreviewSession.trace`, em memória, com nó e aresta de cada decisão.
4. Tela: conversa, histórico e estado no canvas do editor.
5. Porta: botão **Prévia** em `PublishBar`.
6. Próximo passo: responder, avançar prazo, continuar, corrigir ou encerrar; ciclos e tipos incompatíveis têm diagnóstico.
7. Configuração: formulários existentes do nó; contato fictício na prévia.
8. Continuidade: tarefas e saídas de humano são exibidas como simulação; não modificam atribuições reais.
9. Laço: localizar o nó no histórico → editar → reiniciar com o novo rascunho.
10. Mapa: `docs/architecture/followup-previa-local.architecture.json`.

## Verificação

Executar os testes de `lib/followup/preview`, dos componentes de prévia e de `tests/e2e/followup-preview.spec.ts`, além de typecheck, lint, lint de canais e cobertura de i18n. A prova visual deve incluir o fluxo real com mídia, desktop e 390 px. Os testes locais não comprovam entrega de mensagens nem funcionamento de integrações externas.
