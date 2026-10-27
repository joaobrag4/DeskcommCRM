"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  ConnectionLineType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./preview/preview-canvas.css";
import type { PreviewSession } from "@/lib/followup/preview/types";
import type { PreviewMediaOrigins } from "@/lib/followup/preview/media-url";
import { decoratePreviewCanvas, PREVIEW_STATUS_LABELS } from "./preview/canvas-feedback";

import { estimateNodeSize, layoutFlowGraph, LAYOUT_NODE_WIDTH } from "@/lib/followup/auto-layout";
import { semAresta, semArestasDoNo, semNo } from "@/lib/followup/excluir-do-grafo";
import {
  toReactFlow,
  fromReactFlow,
  graphsEqual,
  toFlowNode,
  type RFNode,
  type RFEdge,
  type RFNodeData,
} from "@/lib/followup/graph-mappers";
import { conditionLabel } from "@/lib/followup/edge-condition-options";
import { nextSequenceId } from "@/lib/followup/next-sequence-id";
import {
  branchIdForCondition,
  conditionForBranch,
  nodeBranches,
  type FlowEdge,
  type FlowGraph,
  type NodeType,
} from "@/lib/followup/graph-schema";
import { rotuloDoRamo } from "@/lib/followup/rotulo-do-ramo";
import { useFollowupFlow, type FollowupFlowDetailRow } from "@/hooks/followup/useFollowupFlow";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Plus, X } from "@/lib/ui/icons";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { EdgeConfigPanel } from "./EdgeConfigPanel";
import { EtapasDoFluxoProvider, useEtapasDoFluxo } from "./EtapasDoFluxo";
import { NodePalette } from "./NodePalette";
import { PublishBar } from "./PublishBar";
import { NODE_VISUALS, configPadraoDaAcao } from "./nodes/nodeVisuals";
import { TriggerNode } from "./nodes/TriggerNode";
import { WaitNode } from "./nodes/WaitNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { ClassifyNode } from "./nodes/ClassifyNode";
import { MatchReplyNode } from "./nodes/MatchReplyNode";
import { RepeatNode } from "./nodes/RepeatNode";
import { ActionNode } from "./nodes/ActionNode";
import { EndNode } from "./nodes/EndNode";
import { CollectNode } from "./nodes/CollectNode";
import { InternalTaskNode } from "./nodes/InternalTaskNode";
import { MoveLeadNode } from "./nodes/MoveLeadNode";
import { EditLeadTagNode } from "./nodes/EditLeadTagNode";
import { SkillNode } from "./nodes/SkillNode";
import { HttpRequestNode } from "./nodes/HttpRequestNode";
import { InteractiveMenuNode } from "./nodes/InteractiveMenuNode";
import { FlowConnectionNode } from "./nodes/FlowConnectionNode";
import { ConversionPixelNode } from "./nodes/ConversionPixelNode";
import { CarouselNode } from "./nodes/CarouselNode";
import { RandomSplitNode } from "./nodes/RandomSplitNode";

const EMPTY_GRAPH: FlowGraph = { nodes: [], edges: [] };
const DND_MIME = "application/x-followup-node-type";
const FlowPreview = dynamic(() => import("./preview/FlowPreview").then((m) => m.FlowPreview), {
  ssr: false,
  loading: () => <div className="p-6" role="status">…</div>,
});

// Defined outside the component — React Flow warns (and re-mounts nodes) if
// nodeTypes is a fresh object every render.
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  wait: WaitNode,
  condition: ConditionNode,
  ai_classify: ClassifyNode,
  match_reply: MatchReplyNode,
  repeat: RepeatNode,
  action: ActionNode,
  // `internal_task` estava na paleta, no schema, no publish e no motor — e não
  // aqui (#1540): o React Flow caía no fallback da caixa desconhecida, sem
  // rótulo e sem formulário. Completar o nó é esta linha mais o formulário do
  // painel (`forms/InternalTaskForm`).
  internal_task: InternalTaskNode,
  // #2065 — as duas caixas novas da issue: sem estas linhas o React Flow cai
  // no fallback da caixa desconhecida (o mesmo defeito do #1540 medido ali em
  // cima), sem rótulo e sem formulário.
  move_lead: MoveLeadNode,
  edit_lead_tag: EditLeadTagNode,
  http_request: HttpRequestNode,
  interactive_menu: InteractiveMenuNode,
  flow_connection: FlowConnectionNode,
  conversion_pixel: ConversionPixelNode,
  carousel: CarouselNode,
  random_split: RandomSplitNode,
  end: EndNode,
  collect: CollectNode,
  skill: SkillNode,
};

interface Props {
  flowId: string;
  initialData: FollowupFlowDetailRow;
  previewOrigins?: PreviewMediaOrigins;
}

function FlowCanvasInner({ flowId, initialData, previewOrigins }: Props) {
  const t = useT();
  const { nomes } = useEtapasDoFluxo();
  const { data: flow } = useFollowupFlow(flowId, { initialData });
  // `initial` seeds React Flow state ONCE on mount — it must NOT react to
  // `flow` changing on every refetch (that would clobber in-progress edits).
  const initial = useMemo(
    () => toReactFlow(initialData.draft_graph ?? EMPTY_GRAPH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(initial.edges);
  const [savedGraph, setSavedGraph] = useState<FlowGraph>(initialData.draft_graph ?? EMPTY_GRAPH);
  // As configurações do GRAFO (palavras-gatilho, teto de tentativas, prazo do
  // roteiro) não vivem em nó nenhum: sem este estado, salvar o rascunho as
  // apagava — `fromReactFlow` só conhece nós e arestas.
  const [settings, setSettings] = useState<FlowGraph["settings"]>(initialData.draft_graph?.settings);
  const surface = initialData.surface ?? "followup";
  // Continue after the largest persisted suffix. Starting again at 1 makes a
  // newly-created node/edge reuse an existing React Flow key and visually
  // replace a connection in older drafts.
  const nextId = useRef(nextSequenceId(initial.nodes.map((node) => node.id)));
  const nextEdgeId = useRef(nextSequenceId(initial.edges.map((edge) => edge.id)));
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSession, setPreviewSession] = useState<PreviewSession | null>(null);
  const [followPreview, setFollowPreview] = useState(true);
  const previewButtonRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLDivElement>(null);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewSession(null);
    previewButtonRef.current?.querySelector<HTMLButtonElement>("[data-testid='open-flow-preview']")?.focus();
  }, []);

  const locatePreviewNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    void fitView({ nodes: [{ id }], padding: 0.8, minZoom: 0.6, maxZoom: 0.9, duration: 240 });
    // Manual history navigation also reveals the stacked canvas on a phone.
    // Automatic following only moves the flow viewport, preserving chat scroll.
    previewCanvasRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [fitView]);

  const currentPreviewNodeId = previewSession?.currentNodeId;
  useEffect(() => {
    if (previewOpen && followPreview && currentPreviewNodeId) {
      void fitView({ nodes: [{ id: currentPreviewNodeId }], padding: 0.8, minZoom: 0.6, maxZoom: 0.9, duration: 240 });
    }
  }, [previewOpen, followPreview, currentPreviewNodeId, fitView]);

  const liveGraph = useMemo(() => {
    const base = fromReactFlow(nodes, edges);
    return settings ? { ...base, settings } : base;
  }, [nodes, edges, settings]);
  const dirty = useMemo(() => !graphsEqual(liveGraph, savedGraph), [liveGraph, savedGraph]);

  const markNodeErrors = useCallback(
    (errorsByNode: Record<string, string[]>) => {
      setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, errors: errorsByNode[n.id] } })));
    },
    [setNodes],
  );
  const clearNodeErrors = useCallback(() => {
    setNodes((nds) => nds.map((n) => (n.data.errors ? { ...n, data: { ...n.data, errors: undefined } } : n)));
  }, [setNodes]);

  // Node and edge selection are mutually exclusive — opening one panel closes the other's.
  const onNodeClick = useCallback<NodeMouseHandler<RFNode>>((_, node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);
  const onEdgeClick = useCallback<EdgeMouseHandler<RFEdge>>((_, edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const updateNodeData = useCallback(
    (id: string, patch: Partial<RFNodeData>) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes],
  );
  const updateEdgeCondition = useCallback(
    (id: string, condition: FlowEdge["condition"]) => {
      setEdges((eds) =>
        eds.map((e) => (e.id === id ? { ...e, data: { priority: e.data?.priority ?? 0, condition } } : e)),
      );
    },
    [setEdges],
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;
  const selectedEdgeSource = selectedEdge ? (nodes.find((n) => n.id === selectedEdge.source) ?? null) : null;
  const selectedEdgeTarget = selectedEdge ? (nodes.find((n) => n.id === selectedEdge.target) ?? null) : null;

  // Wire label: derived at render time from `data.condition`, never persisted on the edge
  // itself — `condition` alone stays the source of truth the mapper round-trips.
  // Num nó que ramifica o texto vem do RAMO (o rótulo que o usuário leu na
  // bolinha de onde arrastou), não da condição crua: `conditionLabel` sozinho
  // mostraria o id do ramo, que não é palavra nenhuma para quem não programa.
  const edgesForRender = useMemo(
    () =>
      edges.map((e) => {
        const condition = e.data?.condition ?? { type: "always" as const };
        const source = nodes.find((n) => n.id === e.source);
        const branch = source
          ? nodeBranches(toFlowNode(source)).find(
              (b) => b.id === branchIdForCondition(toFlowNode(source), condition),
            )
          : undefined;
        return {
          ...e,
          type: "default" as const,
          label: branch ? t(rotuloDoRamo(branch, nomes)) : t(conditionLabel(condition)),
          selected: e.id === selectedEdgeId,
        };
      }),
    [edges, nodes, selectedEdgeId, t, nomes],
  );

  // Quais saídas do nó selecionado já têm aresta. Quem sabe isso é o canvas —
  // o formulário não vê o grafo, e sem esse dado ele trocaria o modo do nó
  // deixando ligações órfãs sem conseguir dizer quantas.
  const ramosLigadosDoSelecionado = useMemo(() => {
    if (!selectedNode) return [];
    const source = toFlowNode(selectedNode);
    return edges
      .filter((e) => e.source === selectedNode.id)
      .map((e) => branchIdForCondition(source, e.data?.condition ?? { type: "always" }))
      .filter((id): id is string => id !== null);
  }, [selectedNode, edges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      // A bolinha de onde o usuário arrastou É a saída escolhida: o React Flow
      // devolve o id do ramo em `sourceHandle`. Antes a aresta nascia sempre
      // `always` e o usuário tinha que ir ao painel dizer de novo, de qual regra
      // ela saía — o que, com uma bolinha só, era impossível de expressar.
      const source = nodes.find((n) => n.id === connection.source);
      const fromBranch =
        source && connection.sourceHandle
          ? conditionForBranch(toFlowNode(source), connection.sourceHandle)
          : null;
      const newEdge: RFEdge = {
        id: `edge-${nextEdgeId.current++}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        data: { priority: 0, condition: fromBranch ?? { type: "always" } },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges, nodes],
  );

  // O nó de ação nasce com o padrão do gatilho do fluxo. O callback depende só
  // do `kind` (string), não do objeto `trigger_config`, que é novo a cada refetch.
  const triggerKindRaw = flow?.trigger_config?.kind;
  const triggerKind = typeof triggerKindRaw === "string" ? triggerKindRaw : undefined;

  const addNodeAt = useCallback(
    (type: NodeType, position: { x: number; y: number }) => {
      const visual = NODE_VISUALS[type];
      const id = `${type}-${nextId.current++}`;
      const config = type === "action" ? configPadraoDaAcao(triggerKind) : visual.defaultConfig();
      const newNode: RFNode = {
        id,
        type,
        position,
        data: { label: t(visual.defaultLabel), config },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes, t, triggerKind],
  );

  const onPaletteAdd = useCallback(
    (type: NodeType) => {
      const index = nodes.length;
      addNodeAt(type, { x: 80 + (index % 4) * 220, y: 80 + Math.floor(index / 4) * 150 });
    },
    [nodes.length, addNodeAt],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => semNo(nds, id));
      setEdges((eds) => semArestasDoNo(eds, id));
      setSelectedNodeId((cur) => (cur === id ? null : cur));
    },
    [setNodes, setEdges],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      setEdges((eds) => semAresta(eds, id));
      setSelectedEdgeId((cur) => (cur === id ? null : cur));
    },
    [setEdges],
  );

  const onDeleteSelection = useCallback(() => {
    if (selectedNodeId) deleteNode(selectedNodeId);
    else if (selectedEdgeId) deleteEdge(selectedEdgeId);
  }, [selectedNodeId, selectedEdgeId, deleteNode, deleteEdge]);

  const onAutoFit = useCallback(() => {
    if (nodes.length === 0) return;
    const sizes = new Map<string, { width: number; height: number }>();
    for (const n of nodes) {
      sizes.set(n.id, {
        width: n.measured?.width ?? LAYOUT_NODE_WIDTH,
        height: n.measured?.height ?? estimateNodeSize(toFlowNode(n)).height,
      });
    }
    const laid = layoutFlowGraph(liveGraph, sizes, nomes);
    const pos = new Map(laid.nodes.map((n) => [n.id, n.position]));
    setNodes((nds) =>
      nds.map((n) => {
        const p = pos.get(n.id);
        return p ? { ...n, position: p } : n;
      }),
    );
    window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 200 });
    }, 0);
  }, [nodes, liveGraph, setNodes, fitView, nomes]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DND_MIME) as NodeType | "";
      if (!type) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeAt(type, position);
    },
    [screenToFlowPosition, addNodeAt],
  );

  const previewRender = useMemo(
    () => decoratePreviewCanvas(nodes, edgesForRender, previewSession, t),
    [nodes, edgesForRender, previewSession, t],
  );
  const previewNodeLabel = nodes.find((node) => node.id === currentPreviewNodeId)?.data.label;

  return (
    <div className="flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden">
      {flow && (
        <div ref={previewButtonRef} className="shrink-0">
        <PublishBar
          flowId={flowId}
          flow={flow}
          graph={liveGraph}
          dirty={dirty}
          selection={selectedNode ? "node" : selectedEdge ? "edge" : null}
          onDeleteSelection={onDeleteSelection}
          onSaved={setSavedGraph}
          onPublishErrors={markNodeErrors}
          onPublishSuccess={clearNodeErrors}
          onAutoFit={onAutoFit}
          canAutoFit={nodes.length > 0}
          onOpenPreview={() => {
            if (previewOpen) closePreview();
            else {
              setPreviewSession(null);
              setPreviewOpen(true);
              setPaletteOpen(false);
            }
          }}
          previewActive={previewOpen}
        />
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {!previewOpen && <NodePalette onAdd={onPaletteAdd} surface={surface} />}
        {/* Abaixo de `lg` a paleta fixa de 224px não cabe do lado do canvas —
            vira um drawer, disparado por este botão flutuante. */}
        <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
          <SheetContent side="left" className="w-72 max-w-[85vw] gap-0 p-0 lg:hidden">
            <SheetTitle className="sr-only">{t("Adicionar nó")}</SheetTitle>
            <NodePalette
              variant="mobile"
              surface={surface}
              onAdd={(type) => {
                onPaletteAdd(type);
                setPaletteOpen(false);
              }}
            />
          </SheetContent>
        </Sheet>

        <div
          ref={previewCanvasRef}
          className={`relative h-full min-h-0 min-w-0 flex-1 ${previewOpen ? "flow-preview-canvas" : ""}`}
          data-testid="flow-canvas"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={previewRender.nodes}
            edges={previewRender.edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            defaultEdgeOptions={{ type: "default" }}
            connectionLineType={ConnectionLineType.Bezier}
            // Enquadrar só o que já existia ao abrir. Num fluxo vazio o XYFlow
            // guarda o enquadramento para quando o PRIMEIRO nó for medido — e
            // enquadrar um nó só é ampliá-lo ao zoom máximo (2x): quem acabou de
            // criar o fluxo clica em "Gatilho" e a tela salta para 200%, com os
            // nós seguintes nascendo fora da vista (medido no trace do e2e
            // followup-cartoes: scale 1 → 2 logo após o primeiro clique).
            fitView={initial.nodes.length > 0}
          >
            <Background />
            <Controls />
          </ReactFlow>
          {previewOpen && previewSession && (
            <div className="absolute left-3 right-3 top-3 z-10 mx-auto max-w-md rounded-xl border border-border bg-surface/95 p-3 shadow-sm backdrop-blur-sm" data-testid="preview-canvas-status">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-text-subtle">{t("Percurso da prévia")}</p>
                  <p className="truncate text-sm font-semibold text-text">{previewNodeLabel ?? t("Escolha iniciar na conversa")}</p>
                  <p className="mt-1 text-xs text-text-muted">{t(PREVIEW_STATUS_LABELS[previewSession.status])} · {previewSession.visitedNodeIds.length} {t("etapas percorridas")}</p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-xs text-text-muted">
                  <input type="checkbox" checked={followPreview} onChange={(event) => setFollowPreview(event.target.checked)} className="accent-[var(--color-accent-500)]" />
                  {t("Acompanhar")}
                </label>
              </div>
              {currentPreviewNodeId && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => locatePreviewNode(currentPreviewNodeId)}>{t("Localizar etapa")}</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { locatePreviewNode(currentPreviewNodeId); closePreview(); }}>{t("Editar etapa")}</Button>
                </div>
              )}
            </div>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={`absolute bottom-4 left-4 z-10 shadow-md lg:hidden ${previewOpen ? "hidden" : ""}`}
            onClick={() => setPaletteOpen(true)}
          >
            <Plus size={14} aria-hidden /> {t("Adicionar nó")}
          </Button>
        </div>

        {previewOpen && (
          <aside
            id="flow-preview-panel"
            aria-label={t("Prévia da conversa")}
            className="absolute inset-0 z-20 flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden border-t border-border bg-surface md:static md:z-auto md:w-[380px] lg:w-[420px] lg:max-w-[45%] md:border-l md:border-t-0"
          >
            <FlowPreview
              graph={liveGraph}
              origins={previewOrigins}
              cancelOnReply={flow?.trigger_config?.cancel_on_reply === true}
              handoffPolicy={flow?.handoff_policy ?? "pause"}
              onSessionChange={setPreviewSession}
              onLocateNode={locatePreviewNode}
              onClose={closePreview}
            />
          </aside>
        )}

        {/*
          Docked panel em telas grandes (`lg:`) — NÃO é overlay ali: o canvas
          continua clicável, então trocar de nó/aresta selecionado funciona com
          o painel aberto. Abaixo de `lg` os 384px (`w-96`) sozinhos já passavam
          da largura de QUALQUER celular, e como o pai é `overflow-hidden`, o
          painel não ganhava scroll — ficava certo, cortado, inacessível. Vira
          bottom sheet (`fixed`, ancorado embaixo, com teto de altura e X pra
          fechar) só nesse intervalo de tela.
        */}
        {selectedNode && !previewOpen && (
          <aside
            className="fixed inset-x-0 bottom-[var(--rodape-ocupado,0px)] z-40 flex max-h-[75vh] flex-col overflow-hidden rounded-t-lg border-t border-border bg-surface shadow-lg lg:static lg:z-auto lg:h-full lg:w-96 lg:max-h-none lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
            data-testid="node-config-sheet"
          >
            {/* Barra própria pro X, não sobreposta ao conteúdo — um botão
                flutuante por cima do cabeçalho do painel colidiria com rótulo
                comprido (texto sobre texto). */}
            <div className="flex shrink-0 justify-end p-2 lg:hidden">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSelectedNodeId(null)}
                aria-label={t("Fechar")}
              >
                <X size={16} aria-hidden />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pt-0 lg:pt-4">
              <NodeConfigPanel
                key={selectedNode.id}
                node={selectedNode}
                onChange={(patch) => updateNodeData(selectedNode.id, patch)}
                onDelete={() => deleteNode(selectedNode.id)}
                ramosLigados={ramosLigadosDoSelecionado}
                surface={surface}
                flowId={flowId}
                settings={settings}
                onSettingsChange={setSettings}
              />
            </div>
          </aside>
        )}

        {selectedEdge && !previewOpen && (
          <aside
            className="fixed inset-x-0 bottom-[var(--rodape-ocupado,0px)] z-40 flex max-h-[75vh] flex-col overflow-hidden rounded-t-lg border-t border-border bg-surface shadow-lg lg:static lg:z-auto lg:h-full lg:w-96 lg:max-h-none lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
            data-testid="edge-config-sheet"
          >
            <div className="flex shrink-0 justify-end p-2 lg:hidden">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSelectedEdgeId(null)}
                aria-label={t("Fechar")}
              >
                <X size={16} aria-hidden />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pt-0 lg:pt-4">
              <EdgeConfigPanel
                key={selectedEdge.id}
                sourceNode={selectedEdgeSource ? toFlowNode(selectedEdgeSource) : undefined}
                targetNode={selectedEdgeTarget ? toFlowNode(selectedEdgeTarget) : undefined}
                condition={selectedEdge.data?.condition ?? { type: "always" }}
                onChange={(condition) => updateEdgeCondition(selectedEdge.id, condition)}
                onDelete={() => deleteEdge(selectedEdge.id)}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <EtapasDoFluxoProvider>
        <FlowCanvasInner {...props} />
      </EtapasDoFluxoProvider>
    </ReactFlowProvider>
  );
}
