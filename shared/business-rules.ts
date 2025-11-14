/**
 * Constantes do sistema
 * 
 * Apenas códigos de eventos e configurações técnicas.
 * Regras de processamento estão APENAS no prompt da IA.
 */

/**
 * Códigos de eventos de alarme
 */
export const EVENT_CODES = {
  /** Código 1401 - Sistema DESARMADO (abertura) */
  DISARMED: 1401,
  
  /** Código 3401 - Sistema ARMADO (fechamento) */
  ARMED: 3401,
} as const;

/**
 * Configurações de processamento
 */
export const PROCESSING_CONFIG = {
  /** Tamanho do lote para processamento com IA (previne timeouts) */
  CHUNK_SIZE: 50,
} as const;

/**
 * Configurações de rate limiting por provedor de IA
 */
export const RATE_LIMIT_CONFIG = {
  GROQ: {
    /** Tempo mínimo por chunk em segundos */
    minTimePerChunk: 2,
    /** Delay mínimo entre chunks em segundos */
    minDelayBetweenChunks: 1,
    /** Número máximo de tentativas em caso de erro */
    maxRetries: 3,
    /** Delay base para retry em milissegundos */
    baseRetryDelay: 3000,
  },
  OPENAI: {
    /** Tempo mínimo por chunk em segundos */
    minTimePerChunk: 5,
    /** Delay mínimo entre chunks em segundos */
    minDelayBetweenChunks: 2,
    /** Número máximo de tentativas em caso de erro */
    maxRetries: 5,
    /** Delay base para retry em milissegundos */
    baseRetryDelay: 5000,
  },
  ANTHROPIC: {
    /** Tempo mínimo por chunk em segundos */
    minTimePerChunk: 4,
    /** Delay mínimo entre chunks em segundos */
    minDelayBetweenChunks: 2,
    /** Número máximo de tentativas em caso de erro */
    maxRetries: 5,
    /** Delay base para retry em milissegundos */
    baseRetryDelay: 4000,
  },
} as const;
