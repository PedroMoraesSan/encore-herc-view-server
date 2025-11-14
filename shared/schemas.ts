/**
 * Schemas de validação básica com Zod
 * 
 * APENAS validação estrutural, SEM regras de negócio.
 * Todas as regras de negócio estão no prompt da IA.
 */

import { z } from 'zod';

/**
 * Schema genérico para eventos de alarme (dados de entrada)
 * 
 * Validação MÍNIMA - aceita qualquer estrutura básica de planilha
 */
export const AlarmEventSchema = z.object({
  // Campos com nomes variáveis - aceita qualquer coisa
  Empresa: z.any().optional(),
  Conta: z.any().optional(), // Aceita qualquer formato
  'Data de recebimento': z.any().optional(),
  'Código do evento': z.any().optional(), // Aceita qualquer código
  'Descrição': z.any().optional(),
  Partição: z.any().optional(),
  Auxiliar: z.any().optional(),
  'Descrição do receptor': z.any().optional(),
}).passthrough(); // Permite qualquer campo adicional

/**
 * Schema genérico para relatório processado (dados de saída)
 * 
 * Validação MÍNIMA - aceita qualquer formato que a IA retornar
 */
export const ProcessedReportSchema = z.object({
  FILIAL: z.any().optional(), // Aceita número ou texto
  UF: z.any().optional(), // Aceita qualquer UF
  ABERTURA: z.any().optional(), // Aceita qualquer formato de data
  FECHAMENTO: z.any().optional(), // Aceita qualquer formato de data
  'OPERADOR(A) ABERTURA': z.any().optional(),
  'OPERADOR(A) FECHAMENTO': z.any().optional(),
}).passthrough(); // Permite qualquer campo adicional

/**
 * Schema para array de eventos
 */
export const AlarmEventArraySchema = z.array(AlarmEventSchema).min(1, 'Dados não podem estar vazios');

/**
 * Schema para array de relatórios processados
 */
export const ProcessedReportArraySchema = z.array(ProcessedReportSchema).min(1, 'Relatório não pode estar vazio');

/**
 * Valida dados de entrada (eventos de alarme)
 * 
 * VALIDAÇÃO MÍNIMA - aceita qualquer array não-vazio
 * Todas as regras estão no prompt da IA, não no código
 */
export function validateAlarmEvents(data: any[]): {
  success: boolean;
  data?: any;
  errors?: string[];
} {
  // Aceita qualquer array válido
  if (!Array.isArray(data)) {
    return {
      success: false,
      errors: ['Dados devem ser um array'],
    };
  }
  
  if (data.length === 0) {
    return {
      success: false,
      errors: ['Array não pode estar vazio'],
    };
  }
  
  // Sempre retorna sucesso se é array não-vazio
  return {
    success: true,
    data,
  };
}

/**
 * Valida dados de saída (relatório processado)
 * 
 * VALIDAÇÃO DESABILITADA - aceita qualquer retorno da IA
 */
export function validateProcessedReport(data: any[]): {
  success: boolean;
  data?: any;
  errors?: string[];
} {
  // Sempre aceita qualquer resultado da IA
  return {
    success: true,
    data,
  };
}

/**
 * Valida estrutura básica dos dados
 * 
 * VALIDAÇÃO MÍNIMA - apenas verifica se é array não-vazio
 */
export function validateBasicStructure(data: any[]): boolean {
  return Array.isArray(data) && data.length > 0;
}

/**
 * FUNÇÃO DESABILITADA - Extração de filial está no prompt da IA
 * 
 * Mantida apenas para compatibilidade (não usar)
 */
export function extractFilialNumber(conta: string): string | null {
  // Retorna null - lógica está no prompt
  return null;
}

/**
 * Schema para configuração de processamento
 */
export const ProcessingConfigSchema = z.object({
  customPrompt: z.string().optional(),
  model: z.string().optional(),
  chunkSize: z.number().min(10).max(500).optional(),
  validateOutput: z.boolean().optional().default(true),
});

/**
 * Type exports para uso em TypeScript
 */
export type AlarmEvent = z.infer<typeof AlarmEventSchema>;
export type ProcessedReport = z.infer<typeof ProcessedReportSchema>;
export type ProcessingConfig = z.infer<typeof ProcessingConfigSchema>;

