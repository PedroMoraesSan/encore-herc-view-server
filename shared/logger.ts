/**
 * Logger estruturado customizado
 * 
 * Substitui console.log por logging estruturado com níveis,
 * contexto e formato JSON consistente
 */

/**
 * Logger estruturado que usa console mas com formato consistente
 * Compatível com qualquer versão do Encore
 */
class StructuredLogger {
  constructor(private readonly service: string) {}

  private log(level: 'info' | 'warn' | 'error', event: string, data?: Record<string, any>) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.service,
      event,
      ...data,
    };

    switch (level) {
      case 'info':
        console.log(JSON.stringify(logEntry));
        break;
      case 'warn':
        console.warn(JSON.stringify(logEntry));
        break;
      case 'error':
        console.error(JSON.stringify(logEntry));
        break;
    }
  }

  info(event: string, data?: Record<string, any>) {
    this.log('info', event, data);
  }

  warn(event: string, data?: Record<string, any>) {
    this.log('warn', event, data);
  }

  error(event: string, data?: Record<string, any>) {
    this.log('error', event, data);
  }
}

/**
 * Loggers por serviço
 * 
 * Cada serviço tem seu próprio logger para facilitar filtragem e análise
 */
export const logger = {
  file: new StructuredLogger('file-service'),
  history: new StructuredLogger('history-service'),
  health: new StructuredLogger('health-service'),
  ai: new StructuredLogger('ai-processing'),
} as const;

/**
 * Helpers para logging estruturado
 */

/**
 * Log de tamanho de dados recebidos
 */
export function logDataSize(
  serviceLogger: StructuredLogger,
  sizeInfo: { readable: string; kb: number; mb: number; bytes: number },
  records: number
) {
  serviceLogger.info('data_received', {
    size_readable: sizeInfo.readable,
    size_kb: sizeInfo.kb.toFixed(2),
    size_mb: sizeInfo.mb.toFixed(4),
    size_bytes: sizeInfo.bytes,
    records_count: records,
  });
}

/**
 * Log de tempo de processamento
 */
export function logProcessingTime(
  serviceLogger: StructuredLogger,
  operation: string,
  timeMs: number,
  additionalContext?: Record<string, any>
) {
  serviceLogger.info('processing_time', {
    operation,
    duration_ms: timeMs,
    duration_s: (timeMs / 1000).toFixed(2),
    ...additionalContext,
  });
}

/**
 * Log de início de operação
 */
export function logOperationStart(
  serviceLogger: StructuredLogger,
  operation: string,
  context?: Record<string, any>
) {
  serviceLogger.info('operation_start', {
    operation,
    timestamp: new Date().toISOString(),
    ...context,
  });
}

/**
 * Log de conclusão de operação
 */
export function logOperationComplete(
  serviceLogger: StructuredLogger,
  operation: string,
  durationMs: number,
  context?: Record<string, any>
) {
  serviceLogger.info('operation_complete', {
    operation,
    duration_ms: durationMs,
    duration_s: (durationMs / 1000).toFixed(2),
    ...context,
  });
}

/**
 * Log de erro com contexto
 */
export function logError(
  serviceLogger: StructuredLogger,
  operation: string,
  error: Error,
  context?: Record<string, any>
) {
  serviceLogger.error('operation_error', {
    operation,
    error_message: error.message,
    error_name: error.name,
    error_stack: error.stack,
    ...context,
  });
}

/**
 * Log de warning
 */
export function logWarning(
  serviceLogger: StructuredLogger,
  message: string,
  context?: Record<string, any>
) {
  serviceLogger.warn('warning', {
    message,
    timestamp: new Date().toISOString(),
    ...context,
  });
}

/**
 * Log de modelo de IA usado
 */
export function logAIModel(
  serviceLogger: StructuredLogger,
  provider: 'Groq' | 'OpenAI',
  model: string,
  context?: Record<string, any>
) {
  serviceLogger.info('ai_model_used', {
    provider,
    model,
    ...context,
  });
}

/**
 * Log de tokens usados
 */
export function logTokenUsage(
  serviceLogger: StructuredLogger,
  provider: 'Groq' | 'OpenAI',
  tokens: { total: number; prompt: number; completion: number }
) {
  serviceLogger.info('ai_tokens_used', {
    provider,
    tokens_total: tokens.total,
    tokens_prompt: tokens.prompt,
    tokens_completion: tokens.completion,
  });
}

/**
 * Log de arquivo processado
 */
export function logFileProcessed(
  serviceLogger: StructuredLogger,
  filename: string,
  recordsIn: number,
  recordsOut: number,
  durationMs: number
) {
  serviceLogger.info('file_processed', {
    filename,
    records_input: recordsIn,
    records_output: recordsOut,
    duration_ms: durationMs,
    duration_s: (durationMs / 1000).toFixed(2),
  });
}

/**
 * Log de validação com warnings
 */
export function logValidationWarnings(
  serviceLogger: StructuredLogger,
  operation: string,
  warnings: string[],
  context?: Record<string, any>
) {
  serviceLogger.warn('validation_warnings', {
    operation,
    warnings_count: warnings.length,
    warnings: warnings.slice(0, 5), // Primeiros 5
    total_warnings: warnings.length,
    ...context,
  });
}

/**
 * Log de retry attempt
 */
export function logRetryAttempt(
  serviceLogger: StructuredLogger,
  operation: string,
  attempt: number,
  maxRetries: number,
  error: Error,
  delayMs: number
) {
  serviceLogger.warn('retry_attempt', {
    operation,
    attempt,
    max_retries: maxRetries,
    error_message: error.message,
    retry_delay_ms: delayMs,
    retry_delay_s: (delayMs / 1000).toFixed(1),
  });
}

/**
 * Log de chunked processing
 */
export function logChunkProcessing(
  serviceLogger: StructuredLogger,
  chunkIndex: number,
  totalChunks: number,
  chunkSize: number,
  status: 'start' | 'complete' | 'error',
  durationMs?: number
) {
  const event = `chunk_${status}`;
  const data: Record<string, any> = {
    chunk_index: chunkIndex + 1, // 1-indexed for display
    total_chunks: totalChunks,
    chunk_size: chunkSize,
    progress_percent: (((chunkIndex + 1) / totalChunks) * 100).toFixed(1),
  };
  
  if (durationMs !== undefined) {
    data.duration_ms = durationMs;
    data.duration_s = (durationMs / 1000).toFixed(2);
  }
  
  if (status === 'error') {
    serviceLogger.error(event, data);
  } else {
    serviceLogger.info(event, data);
  }
}

/**
 * Log de histórico criado/atualizado
 */
export function logHistoryEvent(
  serviceLogger: StructuredLogger,
  event: 'created' | 'updated',
  historyId: string,
  context?: Record<string, any>
) {
  serviceLogger.info(`history_${event}`, {
    history_id: historyId,
    ...context,
  });
}
