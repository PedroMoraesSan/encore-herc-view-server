import OpenAI from 'openai';
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
 * OpenAI API Key (managed by Encore secrets)
 * Set with: encore secret set --dev OpenAIKey
 */
const openaiKey = secret("OpenAIKey");

/**
 * Modelos disponíveis no OpenAI
 */
export const OPENAI_MODELS = {
  GPT_4_TURBO: 'gpt-4-turbo-preview',
  GPT_4: 'gpt-4',
  GPT_4O: 'gpt-4o',
  GPT_3_5_TURBO: 'gpt-3.5-turbo',
  GPT_3_5_TURBO_16K: 'gpt-3.5-turbo-16k',
  O1_PREVIEW: 'o1-preview',
  O1_MINI: 'o1-mini',
} as const;

const DEFAULT_MODEL = OPENAI_MODELS.GPT_4O;

/**
 * Cria e retorna uma instância do cliente OpenAI
 */
function getOpenAIClient(): OpenAI {
  const apiKey = openaiKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API Key não configurada. Use: encore secret set --dev OpenAIKey');
  }
  
  return new OpenAI({
    apiKey,
    timeout: 300000, // 5 minutos
    maxRetries: 3,
  });
}

// Função removida - usando sanitizeDataArray de shared/sanitization.ts

/**
 * Processa dados com OpenAI LLM
 */
export async function processDataWithOpenAI(
  data: ExcelRow[],
  prompt: string,
  model?: string
): Promise<string> {
  try {
    const openai = getOpenAIClient();
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
    logAIModel(logger.ai, 'OpenAI', selectedModel);
    const startTime = Date.now();
    
    const supportsJsonMode = !selectedModel.startsWith('o1');
    const requestConfig: any = {
      model: selectedModel,
      messages: [
        { role: 'system', content: ALARM_TRANSFORMATION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildUserPrompt(prompt, dataString),
        },
      ],
      temperature: 0.1,
      max_tokens: 16384,
    };
    
    if (supportsJsonMode && (selectedModel.includes('gpt-4') || selectedModel.includes('gpt-3.5'))) {
      requestConfig.response_format = { type: 'json_object' };
      logger.ai.info('json_mode_enabled', { provider: 'OpenAI', model: selectedModel });
    }
    
    try {
      const completion = await openai.chat.completions.create(requestConfig);
      const elapsedTime = Date.now() - startTime;
      logProcessingTime(logger.ai, 'openai_api_call', elapsedTime);
      
      const response = completion.choices[0]?.message?.content || '';
      if (!response) {
        throw new Error('Resposta vazia do OpenAI');
      }
      
      if (completion.usage) {
        logTokenUsage(logger.ai, 'OpenAI', {
          total: completion.usage.total_tokens,
          prompt: completion.usage.prompt_tokens,
          completion: completion.usage.completion_tokens,
        });
      }
      
      return response;
    } catch (createError: unknown) {
      if (createError instanceof OpenAI.APIError && 
          createError.message.includes('response_format') && 
          requestConfig.response_format) {
        logger.ai.warn('retrying_without_json_mode', {
          provider: 'OpenAI',
          reason: 'response_format not supported',
        });
        delete requestConfig.response_format;
        const completion = await openai.chat.completions.create(requestConfig);
        return completion.choices[0]?.message?.content || '';
      }
      throw createError;
    }
  } catch (error: unknown) {
    logError(logger.ai, 'openai_api_call', error as Error);
    
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        throw new Error('API Key do OpenAI inválida. Configure: encore secret set --dev OpenAIKey');
      } else if (error.status === 429) {
        throw new Error('Limite de requisições excedido. Aguarde e tente novamente.');
      } else if (error.status === 402) {
        throw new Error('Sem créditos OpenAI. Verifique sua conta.');
      }
      throw new Error(`Erro na API OpenAI (${error.status}): ${error.message}`);
    }
    
    throw new Error(`Erro ao processar com OpenAI: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Parse JSON response do OpenAI
 * 
 * @deprecated Usar parseAIResponse de shared/ai-response-parser.ts
 * Mantido para compatibilidade, mas delega para função compartilhada
 */
export function parseOpenAIResponse(response: string): any[] {
  return parseAIResponse(response, 'OpenAI');
}

