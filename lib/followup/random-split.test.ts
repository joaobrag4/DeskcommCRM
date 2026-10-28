import { describe, expect, it, vi } from 'vitest';
import {
  NODE_TYPES,
  flowNodeSchema,
  nodeBranches,
  randomSplitConfigSchema,
  type FlowNode,
  type FlowGraph,
} from './graph-schema';
import { NOS_DA_SUPERFICIE, CONTA_NO_TETO, validateFlowForPublish } from './validate-publish';
import { CUSTO_NO_MOTOR } from './custo-no-motor';
import { ROTULOS_DE_TIPO_DE_NO, resumoDoNo } from './eventos-legiveis';
import { processNode } from './node-handlers';
import { createSession, dispatch } from './preview/session';

describe('Nó Distribuidor (random_split) — Teste A/B e Variação de Copy', () => {
  describe('Schema e Tipos', () => {
    it('inclui random_split em NODE_TYPES', () => {
      expect(NODE_TYPES).toContain('random_split');
    });

    it('possui rótulo legível "Distribuidor"', () => {
      expect(ROTULOS_DE_TIPO_DE_NO['random_split']).toBe('Distribuidor');
    });

    it('não conta no teto de mensagens do cliente e custa 1 tick no motor', () => {
      expect(CONTA_NO_TETO['random_split']).toBe(false);
      expect(CUSTO_NO_MOTOR['random_split']).toBe(1);
    });

    it('superfície followup e crm_automation oferecem random_split', () => {
      expect(NOS_DA_SUPERFICIE.followup).toContain('random_split');
      expect(NOS_DA_SUPERFICIE.crm_automation).toContain('random_split');
    });

    it('valida configuração válida com caminhos e pesos', () => {
      const parsed = randomSplitConfigSchema.safeParse({
        paths: [
          { id: 'path_a', label: 'Copy Curta', weight: 60 },
          { id: 'path_b', label: 'Copy Longa', weight: 40 },
        ],
      });
      expect(parsed.success).toBe(true);
    });

    it('rejeita menos de 2 caminhos', () => {
      const parsed = randomSplitConfigSchema.safeParse({
        paths: [{ id: 'path_a', label: 'Único', weight: 100 }],
      });
      expect(parsed.success).toBe(false);
    });

    it('flowNodeSchema valida nó random_split completo', () => {
      const node = {
        id: 'split_1',
        type: 'random_split',
        label: 'Distribuidor A/B',
        position: { x: 100, y: 200 },
        config: {
          paths: [
            { id: 'a', label: 'Variação A', weight: 50 },
            { id: 'b', label: 'Variação B', weight: 50 },
          ],
        },
      };
      const parsed = flowNodeSchema.safeParse(node);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Branches e Visual', () => {
    it('nodeBranches emite branches com porcentagens no rótulo', () => {
      const node: FlowNode = {
        id: 'split_1',
        type: 'random_split',
        label: 'Distribuidor',
        position: { x: 0, y: 0 },
        config: {
          paths: [
            { id: 'path_1', label: 'Versão 1', weight: 70 },
            { id: 'path_2', label: 'Versão 2', weight: 30 },
          ],
        },
      };

      const branches = nodeBranches(node);
      expect(branches).toHaveLength(2);
      expect(branches[0]).toEqual({
        id: 'path_1',
        label: 'Versão 1 (70%)',
        check: null,
        kind: 'match',
        condition: { type: 'branch', branch_id: 'path_1' },
      });
      expect(branches[1]).toEqual({
        id: 'path_2',
        label: 'Versão 2 (30%)',
        check: null,
        kind: 'match',
        condition: { type: 'branch', branch_id: 'path_2' },
      });
    });

    it('resumoDoNo descreve a quantidade de caminhos', () => {
      const node: FlowNode = {
        id: 'split_1',
        type: 'random_split',
        label: 'Distribuidor',
        position: { x: 0, y: 0 },
        config: {
          paths: [
            { id: 'p1', label: 'P1', weight: 50 },
            { id: 'p2', label: 'P2', weight: 50 },
          ],
        },
      };
      const resumo = resumoDoNo(node);
      expect(resumo.resumo).toContain('distribui tráfego entre 2 caminhos');
    });
  });

  describe('Validação de Publicação (validate-publish)', () => {
    it('reprova publicação se algum caminho não tiver aresta de saída', () => {
      const grafo: FlowGraph = {
        nodes: [
          { id: 'trig', type: 'trigger', label: 'Start', position: { x: 0, y: 0 }, config: {} },
          {
            id: 'split',
            type: 'random_split',
            label: 'Split',
            position: { x: 0, y: 100 },
            config: {
              paths: [
                { id: 'a', label: 'A', weight: 50 },
                { id: 'b', label: 'B', weight: 50 },
              ],
            },
          },
          { id: 'end_a', type: 'end', label: 'End A', position: { x: 0, y: 200 }, config: { outcome: 'converted' } },
        ],
        edges: [
          { id: 'e1', source: 'trig', target: 'split', priority: 0, condition: { type: 'always' } },
          // Aresta apenas para o caminho 'a' — caminho 'b' fica sem aresta
          { id: 'e2', source: 'split', target: 'end_a', priority: 0, condition: { type: 'branch', branch_id: 'a' } },
        ],
      };

      const res = validateFlowForPublish(grafo);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        const branchErr = res.errors.find((e) => e.code === 'missing_branch_edge');
        expect(branchErr).toBeDefined();
        expect(branchErr?.branch_id).toBe('b');
      }
    });

    it('aprova publicação quando todos os caminhos têm saída conectada', () => {
      const grafo: FlowGraph = {
        nodes: [
          { id: 'trig', type: 'trigger', label: 'Start', position: { x: 0, y: 0 }, config: {} },
          {
            id: 'split',
            type: 'random_split',
            label: 'Split',
            position: { x: 0, y: 100 },
            config: {
              paths: [
                { id: 'a', label: 'A', weight: 50 },
                { id: 'b', label: 'B', weight: 50 },
              ],
            },
          },
          { id: 'end_a', type: 'end', label: 'End A', position: { x: -100, y: 200 }, config: { outcome: 'converted' } },
          { id: 'end_b', type: 'end', label: 'End B', position: { x: 100, y: 200 }, config: { outcome: 'exhausted' } },
        ],
        edges: [
          { id: 'e1', source: 'trig', target: 'split', priority: 0, condition: { type: 'always' } },
          { id: 'e2', source: 'split', target: 'end_a', priority: 0, condition: { type: 'branch', branch_id: 'a' } },
          { id: 'e3', source: 'split', target: 'end_b', priority: 0, condition: { type: 'branch', branch_id: 'b' } },
        ],
      };

      const res = validateFlowForPublish(grafo);
      expect(res.ok).toBe(true);
    });
  });

  describe('Execução no Motor (node-handlers)', () => {
    it('avança pelo caminho sorteado respeitando os pesos', () => {
      const node: FlowNode = {
        id: 'split',
        type: 'random_split',
        label: 'Split',
        position: { x: 0, y: 0 },
        config: {
          paths: [
            { id: 'a', label: 'A', weight: 70 },
            { id: 'b', label: 'B', weight: 30 },
          ],
        },
      };

      const edges = [
        { id: 'ea', source: 'split', target: 'target_a', priority: 0, condition: { type: 'branch' as const, branch_id: 'a' } },
        { id: 'eb', source: 'split', target: 'target_b', priority: 0, condition: { type: 'branch' as const, branch_id: 'b' } },
      ];

      // Sorteio baixo (< 70) seleciona 'a'
      vi.spyOn(Math, 'random').mockReturnValue(0.2);
      const resA = processNode({
        node,
        edges,
        enrollment: {} as any,
        lead: {} as any,
        clock: () => new Date(),
      });
      expect(resA.kind).toBe('advance');
      if (resA.kind === 'advance') {
        expect(resA.next_node_id).toBe('target_a');
      }

      // Sorteio alto (>= 70) seleciona 'b'
      vi.spyOn(Math, 'random').mockReturnValue(0.85);
      const resB = processNode({
        node,
        edges,
        enrollment: {} as any,
        lead: {} as any,
        clock: () => new Date(),
      });
      expect(resB.kind).toBe('advance');
      if (resB.kind === 'advance') {
        expect(resB.next_node_id).toBe('target_b');
      }

      vi.restoreAllMocks();
    });
  });

  describe('Prévia (preview/session)', () => {
    it('executa nó distribuidor na prévia e emite log de rastreio', () => {
      const grafo: FlowGraph = {
        nodes: [
          { id: 'trig', type: 'trigger', label: 'Start', position: { x: 0, y: 0 }, config: {} },
          {
            id: 'split',
            type: 'random_split',
            label: 'Split',
            position: { x: 0, y: 100 },
            config: {
              paths: [
                { id: 'a', label: 'Variação A', weight: 50 },
                { id: 'b', label: 'Variação B', weight: 50 },
              ],
            },
          },
          { id: 'end_a', type: 'end', label: 'End A', position: { x: -100, y: 200 }, config: { outcome: 'converted' } },
          { id: 'end_b', type: 'end', label: 'End B', position: { x: 100, y: 200 }, config: { outcome: 'exhausted' } },
        ],
        edges: [
          { id: 'e1', source: 'trig', target: 'split', priority: 0, condition: { type: 'always' } },
          { id: 'e2', source: 'split', target: 'end_a', priority: 0, condition: { type: 'branch', branch_id: 'a' } },
          { id: 'e3', source: 'split', target: 'end_b', priority: 0, condition: { type: 'branch', branch_id: 'b' } },
        ],
      };

      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      let session = createSession(grafo);
      expect(session.status).toBe('ready');

      session = dispatch(session, { type: 'start' });
      while (session.status === 'running') {
        session = dispatch(session, { type: 'step' });
      }

      expect(session.status).toBe('completed');
      const log = session.transcript.find((m) => m.body.includes('[Distribuidor]'));
      expect(log).toBeDefined();
      expect(log?.body).toContain('Variação A (50%)');

      vi.restoreAllMocks();
    });
  });
});
