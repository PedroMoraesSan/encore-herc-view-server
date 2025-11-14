/**
 * Utilitários para retry com backoff exponencial
 * 
 * Implementa estratégia de retry configurável para operações que
 * podem falhar temporariamente (rate limiting, timeouts, etc)
 */

/**
 * Opções de configuração para retry
 */
export interface RetryOptions {
  /** Número máximo de tentativas */
  maxRetries: number;
  
  /** Delay base em milissegundos para cálculo do backoff */
  baseDelay: number;
  
  /** Regex para identificar erros que devem ser retentados (opcional) */
  retryableErrors?: RegExp;
  
  /** Callback chamado antes de cada retry (opcional) */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  
  /** Callback chamado em cada tentativa, incluindo a primeira (opcional) */
  onAttempt?: (attempt: number) => void;
}

/**
 * Resultado de uma operação com retry
 */
export interface RetryResult<T> {
  /** Resultado da operação */
  value: T;
  
  /** Número de tentativas que foram necessárias */
  attempts: number;
  
  /** Tempo total gasto (ms) */
  totalTime: number;
}

/**
 * Executa uma função com retry e backoff exponencial
 * 
 * Estratégia: delay = baseDelay * 2^(attempt-1)
 * Exemplo com baseDelay=1000: 1s, 2s, 4s, 8s, 16s...
 * 
 * @param fn - Função assíncrona a executar
 * @param options - Opções de retry
 * @returns Resultado da operação
 * @throws Erro da última tentativa se todas falharem
 * 
 * @example
 * const result = await retryWithExponentialBackoff(
 *   () => callApi(),
 *   {
 *     maxRetries: 3,
 *     baseDelay: 1000,
 *     retryableErrors: /rate limit|429/i,
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry ${attempt}: ${error.message} (aguardando ${delay}ms)`);
 *     }
 *   }
 * );
 */
export async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const startTime = Date.now();
  let attempts = 0;
  let lastError: Error | null = null;
  
  while (attempts < options.maxRetries) {
    attempts++;
    
    // Callback de tentativa
    if (options.onAttempt) {
      options.onAttempt(attempts);
    }
    
    try {
      // Tenta executar a função
      const result = await fn();
      
      // Sucesso!
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message;
      
      // Verifica se deve retentar
      const hasRetriesLeft = attempts < options.maxRetries;
      const isRetryableError = !options.retryableErrors || 
                               options.retryableErrors.test(errorMessage);
      
      // Se não deve retentar, lança o erro
      if (!hasRetriesLeft || !isRetryableError) {
        throw lastError;
      }
      
      // Calcula delay com backoff exponencial
      const delay = options.baseDelay * Math.pow(2, attempts - 1);
      
      // Callback de retry
      if (options.onRetry) {
        options.onRetry(attempts, lastError, delay);
      }
      
      // Aguarda antes de retentar
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Se chegou aqui, todas as tentativas falharam
  throw lastError || new Error('Todas as tentativas falharam');
}

/**
 * Versão simplificada com retorno de estatísticas
 * 
 * @param fn - Função a executar
 * @param options - Opções de retry
 * @returns Resultado com estatísticas
 */
export async function retryWithStats<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;
  
  const result = await retryWithExponentialBackoff(fn, {
    ...options,
    onAttempt: (attempt) => {
      attempts = attempt;
      if (options.onAttempt) {
        options.onAttempt(attempt);
      }
    },
  });
  
  return {
    value: result,
    attempts,
    totalTime: Date.now() - startTime,
  };
}

/**
 * Configurações pré-definidas comuns
 */
export const RETRY_PRESETS = {
  /** Rate limiting de API (agressivo) */
  API_RATE_LIMIT: {
    maxRetries: 5,
    baseDelay: 2000, // 2s, 4s, 8s, 16s, 32s
    retryableErrors: /429|rate limit|too many requests/i,
  },
  
  /** Timeouts e erros de rede */
  NETWORK_ERROR: {
    maxRetries: 3,
    baseDelay: 1000, // 1s, 2s, 4s
    retryableErrors: /timeout|ECONNRESET|ECONNREFUSED|network/i,
  },
  
  /** Erros temporários genéricos */
  TEMPORARY_ERROR: {
    maxRetries: 3,
    baseDelay: 500, // 0.5s, 1s, 2s
    retryableErrors: /temporary|try again|unavailable/i,
  },
} as const;

/**
 * Helper para criar função retry configurada
 * 
 * @param options - Opções padrão de retry
 * @returns Função retry pré-configurada
 * 
 * @example
 * const retryApi = createRetryFn(RETRY_PRESETS.API_RATE_LIMIT);
 * const result = await retryApi(() => callApi());
 */
export function createRetryFn(options: RetryOptions) {
  return <T>(fn: () => Promise<T>, overrides?: Partial<RetryOptions>): Promise<T> => {
    return retryWithExponentialBackoff(fn, { ...options, ...overrides });
  };
}

