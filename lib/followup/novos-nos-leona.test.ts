import { describe, expect, it } from 'vitest';
import {
  NODE_TYPES,
  flowNodeSchema,
  nodeBranches,
  waitConfigSchema,
  httpRequestConfigSchema,
  interactiveMenuConfigSchema,
  flowConnectionConfigSchema,
  conversionPixelConfigSchema,
  carouselConfigSchema,
  type FlowNode,
} from './graph-schema';
import { NOS_DA_SUPERFICIE, CONTA_NO_TETO, validarGrafoParaPublish } from './validate-publish';
import { CUSTO_NO_MOTOR } from './custo-no-motor';
import { ROTULOS_DE_TIPO_DE_NO } from './eventos-legiveis';

describe('Novos Nós de Fluxo (Compatibilidade Leona)', () => {
  describe('NODE_TYPES e Vocabulário', () => {
    it('inclui os 5 novos tipos de nó em NODE_TYPES', () => {
      expect(NODE_TYPES).toContain('http_request');
      expect(NODE_TYPES).toContain('interactive_menu');
      expect(NODE_TYPES).toContain('flow_connection');
      expect(NODE_TYPES).toContain('conversion_pixel');
      expect(NODE_TYPES).toContain('carousel');
    });

    it('todos os tipos possuem rótulos legíveis em ROTULOS_DE_TIPO_DE_NO', () => {
      for (const tipo of NODE_TYPES) {
        expect(ROTULOS_DE_TIPO_DE_NO[tipo]).toBeDefined();
        expect(typeof ROTULOS_DE_TIPO_DE_NO[tipo]).toBe('string');
      }
    });

    it('todos os tipos estão mapeados em CONTA_NO_TETO e CUSTO_NO_MOTOR', () => {
      for (const tipo of NODE_TYPES) {
        expect(CONTA_NO_TETO[tipo]).toBeDefined();
        expect(CUSTO_NO_MOTOR[tipo]).toBeGreaterThan(0);
      }
    });

    it('superfície followup oferece os nós novos', () => {
      expect(NOS_DA_SUPERFICIE.followup).toContain('http_request');
      expect(NOS_DA_SUPERFICIE.followup).toContain('interactive_menu');
      expect(NOS_DA_SUPERFICIE.followup).toContain('flow_connection');
      expect(NOS_DA_SUPERFICIE.followup).toContain('conversion_pixel');
      expect(NOS_DA_SUPERFICIE.followup).toContain('carousel');
    });
  });

  describe('1. Integração HTTP Request (http_request)', () => {
    it('valida configuração válida com método, URL, headers e body', () => {
      const parsed = httpRequestConfigSchema.safeParse({
        method: 'POST',
        url: 'https://api.exemplo.com/webhook',
        headers: { 'Authorization': 'Bearer token123' },
        body: JSON.stringify({ lead: '{{contact.name}}' }),
        timeout_ms: 15000,
        save_response_path: 'data.id',
      });
      expect(parsed.success).toBe(true);
    });

    it('aplica defaults seguros para http_request', () => {
      const parsed = httpRequestConfigSchema.parse({});
      expect(parsed.method).toBe('POST');
      expect(parsed.timeout_ms).toBe(10000);
      expect(parsed.headers).toEqual({});
    });

    it('nodeBranches emite saídas "success" (2xx) e "failure"', () => {
      const node: FlowNode = {
        id: 'req1',
        type: 'http_request',
        label: 'Webhook Externo',
        position: { x: 0, y: 0 },
        config: {
          method: 'POST',
          url: 'https://api.exemplo.com',
          headers: {},
          body: '',
          timeout_ms: 10000,
        },
      };
      const branches = nodeBranches(node);
      expect(branches).toHaveLength(2);
      expect(branches[0]).toMatchObject({ id: 'success', label: 'Sucesso (2xx)' });
      expect(branches[1]).toMatchObject({ id: 'failure', label: 'Falha' });
    });
  });

  describe('2. Intervalo Inteligente (wait avançado)', () => {
    it('mantém retrocompatibilidade com modo fixed', () => {
      const parsed = waitConfigSchema.safeParse({
        mode: 'fixed',
        duration_ms: 60000,
      });
      expect(parsed.success).toBe(true);
    });

    it('aceita modo business_hours (horário comercial)', () => {
      const parsed = waitConfigSchema.safeParse({
        mode: 'business_hours',
        start_time: '08:30',
        end_time: '18:00',
        days_of_week: [1, 2, 3, 4, 5],
        timezone: 'America/Sao_Paulo',
      });
      expect(parsed.success).toBe(true);
    });

    it('aceita modo time_of_day (horário fixo do dia)', () => {
      const parsed = waitConfigSchema.safeParse({
        mode: 'time_of_day',
        target_time: '09:00',
        delay_days: 1,
        timezone: 'America/Sao_Paulo',
      });
      expect(parsed.success).toBe(true);
    });

    it('aceita modo business_days (dias úteis)', () => {
      const parsed = waitConfigSchema.safeParse({
        mode: 'business_days',
        days: 2,
        deliver_at: '10:00',
        timezone: 'America/Sao_Paulo',
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('3. Menu Interativo WhatsApp (interactive_menu)', () => {
    it('valida opções de botões e emite saídas dedicadas por botão', () => {
      const config = interactiveMenuConfigSchema.parse({
        body: 'Escolha uma opção:',
        menu_type: 'buttons',
        options: [
          { id: 'comprar', title: 'Quero Comprar' },
          { id: 'duvidas', title: 'Tirar Dúvidas' },
        ],
      });
      expect(config.options).toHaveLength(2);

      const node: FlowNode = {
        id: 'menu1',
        type: 'interactive_menu',
        label: 'Menu Principal',
        position: { x: 0, y: 0 },
        config,
      };
      const branches = nodeBranches(node);
      // 2 botões + saída no_reply (timeout)
      expect(branches).toHaveLength(3);
      expect(branches[0]).toMatchObject({ id: 'comprar', label: 'Quero Comprar' });
      expect(branches[1]).toMatchObject({ id: 'duvidas', label: 'Tirar Dúvidas' });
      expect(branches[2]).toMatchObject({ id: 'no_reply', label: 'Sem resposta' });
    });
  });

  describe('4. Conexão de Fluxos (flow_connection)', () => {
    it('valida target_flow_id como string', () => {
      const parsed = flowConnectionConfigSchema.safeParse({
        target_flow_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        inherit_context: true,
      });
      expect(parsed.success).toBe(true);
    });

    it('possui saída padrão única (always)', () => {
      const node: FlowNode = {
        id: 'conn1',
        type: 'flow_connection',
        label: 'Pular para Onboarding',
        position: { x: 0, y: 0 },
        config: {
          target_flow_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          inherit_context: true,
        },
      };
      expect(nodeBranches(node)).toEqual([
        { id: 'else', label: 'Sempre', check: null, kind: 'fallback', condition: { type: 'always' } },
      ]);
    });
  });

  describe('5. Disparo de Pixel / Conversão (conversion_pixel)', () => {
    it('aceita eventos canônicos da Meta e Google', () => {
      const parsed = conversionPixelConfigSchema.safeParse({
        provider: 'both',
        event_name: 'Purchase',
        value: 197.5,
        currency: 'BRL',
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('6. Carrossel de Mídia (carousel)', () => {
    it('valida cards com botões e gera saídas de clique', () => {
      const config = carouselConfigSchema.parse({
        cards: [
          {
            id: 'c1',
            media_url: 'https://exemplo.com/foto1.jpg',
            media_type: 'image',
            title: 'Produto 1',
            buttons: [{ id: 'b1', label: 'Ver Detalhes' }],
          },
          {
            id: 'c2',
            media_url: 'https://exemplo.com/foto2.jpg',
            media_type: 'image',
            title: 'Produto 2',
            buttons: [{ id: 'b2', label: 'Comprar' }],
          },
        ],
      });
      expect(config.cards).toHaveLength(2);

      const node: FlowNode = {
        id: 'car1',
        type: 'carousel',
        label: 'Ofertas em Carrossel',
        position: { x: 0, y: 0 },
        config,
      };
      const branches = nodeBranches(node);
      // Cada botão gera uma saída + fallback de continuação
      expect(branches.length).toBeGreaterThanOrEqual(2);
      expect(branches[0]?.id).toBe('c1_b1');
      expect(branches[1]?.id).toBe('c2_b2');
    });
  });
});
