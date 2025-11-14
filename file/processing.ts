import { ExcelRow } from '../shared/types';
import { processDataWithGroq, parseGroqResponse } from './groq';
import { processDataWithOpenAI } from './openai';
import { processDataWithAnthropic } from './anthropic';
import { createExcelFile } from './excel';
import { RATE_LIMIT_CONFIG, PROCESSING_CONFIG } from '../shared/business-rules';
import { retryWithExponentialBackoff } from '../shared/retry-utils';
import { logger, logOperationStart, logOperationComplete } from '../shared/logger';
import { MINIMAL_REPLICATION_PROMPT } from '../shared/prompts';
import { parseAIResponse } from '../shared/ai-response-parser';

/**
 * PROCESSAMENTO GUIADO APENAS POR PROMPT
 * 
 * Este arquivo contém APENAS lógica técnica de:
 * - Chunking de dados grandes
 * - Rate limiting e retry
 * - Chamadas à IA
 * 
 * TODAS as regras de negócio estão NO PROMPT da IA.
 * O código não valida, normaliza ou altera dados - apenas envia para a IA e retorna o resultado.
 */

/**
 * Providers de IA disponíveis
 */
export type AIProvider = 'groq' | 'openai' | 'anthropic';

/**
 * Configuração padrão de provider
 * Altere aqui para testar diferentes modelos
 */
const DEFAULT_PROVIDER: AIProvider = 'groq'; // Mude para 'anthropic' para testar Claude

/**
 * Processa um arquivo Excel completo com IA
 * 
 * @param data - Dados do Excel a processar
 * @param customPrompt - Prompt customizado (opcional)
 * @param provider - Provider de IA a usar (opcional, padrão: groq)
 */
export async function processExcelData(
  data: ExcelRow[],
  customPrompt?: string,
  provider: AIProvider = DEFAULT_PROVIDER
): Promise<Uint8Array> {
  try {
    const basePrompt = customPrompt || MINIMAL_REPLICATION_PROMPT;
    
    // Selecionar configuração de rate limit baseado no provider
    const rateLimitConfig = provider === 'anthropic' 
      ? RATE_LIMIT_CONFIG.ANTHROPIC
      : provider === 'openai'
      ? RATE_LIMIT_CONFIG.OPENAI
      : RATE_LIMIT_CONFIG.GROQ;

    if (!data || data.length === 0) {
      throw new Error('Não há dados para processar');
    }
    
    logger.ai.info('processing_started', {
      provider,
      records_count: data.length,
      has_custom_prompt: !!customPrompt,
    });

    const preparePrompt = (attempt: number) => {
      if (attempt === 0) {
        return basePrompt;
      }

      return (
        `${basePrompt}\n\nATENÇÃO: O resultado anterior não estava em JSON válido. ` +
        `Responda novamente seguindo STRICTAMENTE o formato JSON {"data": [...]}, ` +
        `sem comentários, sem vírgulas extras e garantindo que todos os arrays/objetos estejam fechados.`
      );
    };

    logOperationStart(logger.ai, 'processing_start', {
      records_count: data.length,
    });

    const processStartTime = Date.now();
    let processedData: any[] | null = null;

    // Se dados são muitos (>200 registros), processar em chunks
    if (data.length > 200) {
      logger.ai.info('large_dataset_chunking', {
        total_records: data.length,
        chunk_size: PROCESSING_CONFIG.CHUNK_SIZE,
      });

      const chunks = [];
      for (let i = 0; i < data.length; i += PROCESSING_CONFIG.CHUNK_SIZE) {
        chunks.push(data.slice(i, i + PROCESSING_CONFIG.CHUNK_SIZE));
      }

      let allProcessedData: any[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        logger.ai.info('processing_chunk', {
          chunk_number: i + 1,
          total_chunks: chunks.length,
          chunk_records: chunk.length,
        });

        const chunkPrompt = `${basePrompt}\n\nPROCESSANDO CHUNK ${i + 1} de ${chunks.length}. PROCESSE TODOS OS ${chunk.length} REGISTROS DESTE CHUNK.`;

        // Processar com o provider selecionado
        const response = await retryWithExponentialBackoff(
          () => {
            if (provider === 'anthropic') {
              return processDataWithAnthropic(chunk, chunkPrompt);
            } else if (provider === 'openai') {
              return processDataWithOpenAI(chunk, chunkPrompt);
            } else {
              return processDataWithGroq(chunk, chunkPrompt);
            }
          },
          {
            maxRetries: rateLimitConfig.maxRetries,
            baseDelay: rateLimitConfig.baseRetryDelay,
            retryableErrors: /429|rate limit|too large|TPM|overloaded/i,
          }
        );

        const chunkProcessedData = parseAIResponse(response, provider);
        allProcessedData = allProcessedData.concat(chunkProcessedData);

        // Delay entre chunks
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, rateLimitConfig.minDelayBetweenChunks * 1000));
        }
      }

      processedData = allProcessedData;
    } else {
      // Processamento normal para datasets pequenos
      const MAX_ATTEMPTS = 2;
      let lastParseError: unknown = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const prompt = preparePrompt(attempt);

        const response = await retryWithExponentialBackoff(
          () => {
            if (provider === 'anthropic') {
              return processDataWithAnthropic(data, prompt);
            } else if (provider === 'openai') {
              return processDataWithOpenAI(data, prompt);
            } else {
              return processDataWithGroq(data, prompt);
            }
          },
          {
            maxRetries: rateLimitConfig.maxRetries,
            baseDelay: rateLimitConfig.baseRetryDelay,
            retryableErrors: /429|rate limit|too large|TPM|overloaded/i,
            onRetry: (attemptNumber, error, delayMs) => {
              logger.ai.warn('processing_retry', {
                provider,
                attempt: attemptNumber,
                max_retries: rateLimitConfig.maxRetries,
                error_message: error.message,
                retry_delay_ms: delayMs,
              });
            },
          }
        );

        try {
          processedData = parseAIResponse(response, provider);
          break;
        } catch (error) {
          lastParseError = error;
          logger.ai.warn('ai_parse_failed', {
            provider,
            attempt: attempt + 1,
            max_attempts: MAX_ATTEMPTS,
            error_message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (!processedData) {
        throw lastParseError instanceof Error
          ? lastParseError
          : new Error('Falha ao parsear resposta da IA');
      }
    }

    const processTime = Date.now() - processStartTime;
    logOperationComplete(logger.ai, `${provider}_processing`, processTime);

    if (!Array.isArray(processedData) || processedData.length === 0) {
      throw new Error('Dados processados estão vazios ou em formato inválido');
    }
    
    // Gerar Excel
    logOperationStart(logger.ai, 'excel_generation', {
      records_count: processedData.length,
    });
    
    const excelBuffer = createExcelFile(processedData);
    
    logOperationComplete(logger.ai, 'excel_generation', 0, {
      buffer_size: excelBuffer.length,
    });
    
    return excelBuffer;
  } catch (error) {
    throw new Error(`Erro no processamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

