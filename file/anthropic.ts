import Anthropic from '@anthropic-ai/sdk';
import { secret } from "encore.dev/config";
import { ExcelRow } from '../shared/types';
import { 
  ALARM_TRANSFORMATION_SYSTEM_PROMPT, 
  buildUserPrompt 
} from '../shared/prompts';
import { 
  sanitizeDataArray, 
  calculateDataSize 
} from '../shared/sanitization';
import { parseAIResponse } from '../shared/ai-response-parser';
import { 
  logger, 
  logDataSize, 
  logAIModel, 
  logTokenUsage, 
  logProcessingTime,
  logError,
  logWarning 
} from '../shared/logger';

/**
 * Anthropic API Key (managed by Encore secrets)
 * Set with: encore secret set --dev AnthropicKey
 * Get your key at: https://console.anthropic.com/settings/keys
 */
const anthropicKey = secret("AnthropicKey");

/**
 * Modelos disponíveis no Anthropic Claude
 * Documentação: https://docs.anthropic.com/en/docs/about-claude/models
 */
export const ANTHROPIC_MODELS = {
  // Claude 3.5 Sonnet (mais recente)
  CLAUDE_3_5_SONNET_LATEST: 'claude-3-5-sonnet-latest',
  CLAUDE_3_5_SONNET_20241022: 'claude-3-5-sonnet-20241022',
  
  // Claude 3 Opus (máxima inteligência)
  CLAUDE_3_OPUS: 'claude-3-opus-20240229',
  CLAUDE_3_OPUS_LATEST: 'claude-3-opus-latest',
  
  // Claude 3 Sonnet (balanceado)
  CLAUDE_3_SONNET: 'claude-3-sonnet-20240229',
  
  // Claude 3 Haiku (rápido e econômico)
  CLAUDE_3_HAIKU: 'claude-3-haiku-20240307',
} as const;

// Usar versão "latest" que sempre aponta para o modelo mais recente disponível
// NOTA: Se "latest" não funcionar, sua conta pode não ter acesso aos modelos mais novos
// Nesse caso, use CLAUDE_3_OPUS ou CLAUDE_3_SONNET que são mais estáveis
const DEFAULT_MODEL = ANTHROPIC_MODELS.CLAUDE_3_OPUS_LATEST;

/**
 * Cria e retorna uma instância do cliente Anthropic
 */
function getAnthropicClient(): Anthropic {
  const apiKey = anthropicKey();
  
  if (!apiKey) {
    throw new Error('Anthropic API Key não configurada. Use: encore secret set --dev AnthropicKey\nObtenha em: https://console.anthropic.com/settings/keys');
  }
  
  return new Anthropic({
    apiKey,
    timeout: 300000, // 5 minutos
    maxRetries: 3,
  });
}

/**
 * Processa dados com Anthropic Claude
 * 
 * Claude é conhecido por:
 * - Excelente seguimento de instruções complexas
 * - Alta precisão em transformações estruturadas
 * - Menor taxa de alucinação em dados tabulares
 * - Contexto de até 200K tokens
 */
export async function processDataWithAnthropic(
  data: ExcelRow[],
  prompt: string,
  model?: string
): Promise<string> {
  try {
    const anthropic = getAnthropicClient();
    const selectedModel = model || DEFAULT_MODEL;
    
    // Otimizar e sanitizar dados usando função compartilhada
    const optimizedData = sanitizeDataArray(data);
    
    const dataString = JSON.stringify(optimizedData);
    const dataSize = calculateDataSize(dataString);
    logDataSize(logger.ai, dataSize, data.length);
    
    if (dataSize.kb > 100) {
      logWarning(logger.ai, 'Large data size may exceed context limits', {
        size_kb: dataSize.kb,
        size_mb: dataSize.mb,
      });
    }
    
    // Sistema de prompt (importado de shared/prompts.ts)
    logAIModel(logger.ai, 'Anthropic', selectedModel);
    const startTime = Date.now();
    
    // Claude usa system prompt separado (melhor prática)
    const systemPrompt = ALARM_TRANSFORMATION_SYSTEM_PROMPT + 
      '\n\nIMPORTANTE: Retorne APENAS JSON válido no formato {"data": [...]}. ' +
      'Não inclua markdown, explicações ou texto adicional.';
    
    const userPrompt = buildUserPrompt(prompt, dataString);
    
    try {
      const message = await anthropic.messages.create({
        model: selectedModel,
        max_tokens: 4096, // Claude suporta até 8192 output tokens
        temperature: 0.1,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });
      
      const elapsedTime = Date.now() - startTime;
      logProcessingTime(logger.ai, 'anthropic_api_call', elapsedTime);
      
      // Extrair resposta do formato Claude
      const responseContent = message.content[0];
      if (responseContent.type !== 'text') {
        throw new Error('Resposta do Claude não é texto');
      }
      
      const response = responseContent.text;
      if (!response) {
        throw new Error('Resposta vazia do Claude');
      }
      
      // Log de uso de tokens
      if (message.usage) {
        logTokenUsage(logger.ai, 'Anthropic', {
          total: message.usage.input_tokens + message.usage.output_tokens,
          prompt: message.usage.input_tokens,
          completion: message.usage.output_tokens,
        });
      }
      
      logger.ai.info('anthropic_response_received', {
        model: selectedModel,
        stop_reason: message.stop_reason,
        response_length: response.length,
      });
      
      return response;
    } catch (apiError: unknown) {
      // Log detalhado do erro
      logError(logger.ai, 'anthropic_api_call', apiError as Error);
      throw apiError;
    }
  } catch (error: unknown) {
    logError(logger.ai, 'anthropic_processing', error as Error);
    
    // Tratamento de erros específicos do Anthropic
    if (error instanceof Anthropic.APIError) {
      if (error.status === 401) {
        throw new Error('API Key do Anthropic inválida. Configure: encore secret set --dev AnthropicKey\nObtenha em: https://console.anthropic.com/settings/keys');
      } else if (error.status === 429) {
        throw new Error('Limite de requisições excedido. Aguarde e tente novamente.');
      } else if (error.status === 402) {
        throw new Error('Sem créditos Anthropic. Verifique sua conta.');
      } else if (error.status === 529) {
        throw new Error('Anthropic API temporariamente sobrecarregada. Tente novamente em alguns segundos.');
      }
      throw new Error(`Erro na API Anthropic (${error.status}): ${error.message}`);
    }
    
    throw new Error(`Erro ao processar com Anthropic: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Parse JSON response do Anthropic
 * 
 * @deprecated Usar parseAIResponse de shared/ai-response-parser.ts
 * Mantido para compatibilidade, mas delega para função compartilhada
 */
export function parseAnthropicResponse(response: string): any[] {
  return parseAIResponse(response, 'Anthropic');
}

