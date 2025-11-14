import Groq from 'groq-sdk';
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
 * Groq API Key (managed by Encore secrets)
 * Set with: encore secret set --dev GroqKey
 * Get your key at: https://console.groq.com/keys
 */
const groqKey = secret("GroqKey");

/**
 * Modelos disponíveis no Groq (Llama 3.3 é o mais recente)
 */
export const GROQ_MODELS = {
  LLAMA_3_3_70B: 'llama-3.3-70b-versatile',      // Mais recente e poderoso
  LLAMA_3_1_70B: 'llama-3.1-70b-versatile',      // Anterior, muito bom
  LLAMA_3_1_8B: 'llama-3.1-8b-instant',          // Mais rápido, menor qualidade
  MIXTRAL_8X7B: 'mixtral-8x7b-32768',            // Alternativa Mistral
  GEMMA_2_9B: 'gemma2-9b-it',                    // Google Gemma
} as const;

const DEFAULT_MODEL = GROQ_MODELS.LLAMA_3_3_70B;

/**
 * Cria e retorna uma instância do cliente Groq
 */
function getGroqClient(): Groq {
  const apiKey = groqKey();
  
  if (!apiKey) {
    throw new Error('Groq API Key não configurada. Use: encore secret set --dev GroqKey\nObtenha em: https://console.groq.com/keys');
  }
  
  return new Groq({
    apiKey,
  });
}

// Função removida - usando sanitizeDataArray de shared/sanitization.ts

/**
 * Processa dados com Groq LLM (Llama 3.3)
 * MUITO mais rápido que OpenAI (até 10x)!
 */
export async function processDataWithGroq(
  data: ExcelRow[],
  prompt: string,
  model?: string
): Promise<string> {
  try {
    const groq = getGroqClient();
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
    logAIModel(logger.ai, 'Groq', selectedModel);
    const startTime = Date.now();
    
    const buildRequestConfig = (useJsonMode: boolean) => {
      const config: any = {
        model: selectedModel,
        messages: [
          {
            role: 'user' as const,
            content: buildUserPrompt(prompt, dataString),
          },
        ],
        temperature: 0.1,
        max_tokens: 32768, // Aumentado para suportar respostas maiores
      };

      if (useJsonMode) {
        config.response_format = { type: 'json_object' as const };
      }

      return config;
    };

    const attemptRequest = async (useJsonMode: boolean): Promise<string> => {
      const requestConfig = buildRequestConfig(useJsonMode);

      if (useJsonMode) {
        logger.ai.info('json_mode_enabled', { provider: 'Groq' });
      }

      try {
        const completion = await groq.chat.completions.create(requestConfig);
        const elapsedTime = Date.now() - startTime;
        logProcessingTime(logger.ai, 'groq_api_call', elapsedTime);

        const response = completion.choices[0]?.message?.content || '';
        if (!response) {
          throw new Error('Resposta vazia do Groq');
        }

        if (completion.usage) {
          logTokenUsage(logger.ai, 'Groq', {
            total: completion.usage.total_tokens,
            prompt: completion.usage.prompt_tokens,
            completion: completion.usage.completion_tokens,
          });
        }

        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isJsonValidationError =
          useJsonMode &&
          (message.includes('json_validate_failed') ||
            message.includes('Failed to generate JSON'));

        if (isJsonValidationError) {
          logger.ai.warn('retrying_without_json_mode', {
            provider: 'Groq',
            reason: 'json_validate_failed',
          });
          return attemptRequest(false);
        }

        throw error;
      }
    };

    return await attemptRequest(true);
  } catch (error: unknown) {
    logError(logger.ai, 'groq_api_call', error as Error);
    
    // Tratamento de erros específicos do Groq
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      if (errorMessage.includes('invalid api key') || errorMessage.includes('unauthorized')) {
        throw new Error('API Key do Groq inválida. Configure: encore secret set --dev GroqKey\nObtenha em: https://console.groq.com/keys');
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        throw new Error('Limite de requisições excedido. Aguarde e tente novamente.');
      } else if (errorMessage.includes('quota') || errorMessage.includes('billing')) {
        throw new Error('Sem créditos Groq. Verifique sua conta.');
      }
    }
    
    throw new Error(`Erro ao processar com Groq: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Parse JSON response do Groq
 * 
 * @deprecated Usar parseAIResponse de shared/ai-response-parser.ts
 * Mantido para compatibilidade, mas delega para função compartilhada
 */
export function parseGroqResponse(response: string): any[] {
  return parseAIResponse(response, 'Groq');
}

