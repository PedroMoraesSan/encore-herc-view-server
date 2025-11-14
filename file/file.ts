import { api, APIError } from "encore.dev/api";
import { readExcelFile, validateExcelFilename, createExcelFile } from './excel';
import { processExcelData } from './processing';
import { processDeterministic, ProcessedRow } from './deterministic-processor';
import { createHistory, updateHistory } from '../history/history';
import { ExcelRow } from '../shared/types';
import { validateAlarmEvents, validateBasicStructure } from '../shared/schemas';
import { 
  logger, 
  logOperationStart, 
  logOperationComplete, 
  logValidationWarnings,
  logHistoryEvent,
  logError 
} from '../shared/logger';

/**
 * Upload and Process Request
 * ATUALIZADO: Suporta dois formatos
 * 1. Novo (preferido): data - dados já parseados como JSON
 * 2. Legado: file - arquivo como base64 encoded string
 */
interface UploadRequest {
  // Método novo: dados já parseados (mais eficiente)
  data?: ExcelRow[];
  
  // Método legado: arquivo base64 (fallback)
  file?: string;
  
  filename: string;
  prompt?: string;
  
  // Novo: usar processamento determinístico ao invés de IA
  useDeterministic?: boolean;
}

/**
 * Upload and Process Response
 * Returns processed Excel file as base64 encoded string
 */
interface UploadResponse {
  data: string; // base64 encoded
  filename: string;
}

/**
 * Validate Request
 * ATUALIZADO: Suporta ambos formatos
 */
interface ValidateRequest {
  data?: ExcelRow[];
  file?: string; // base64 encoded
  filename: string;
}

/**
 * Validate Response
 */
interface ValidateResponse {
  success: boolean;
  message: string;
  data: {
    filename: string;
    size: number;
    records: number;
    columns: string[];
  };
}

/**
 * API: Upload and process Excel file with AI
 * POST /upload
 * 
 * Long-running operation (can take 30s-5min depending on file size)
 */
export const upload = api(
  {
    method: "POST",
    path: "/upload",
    expose: true,
  },
  async (req: UploadRequest): Promise<UploadResponse> => {
    const startTime = Date.now();
    let historyId: string | null = null;

    try {
      // Validate filename
      if (!req.filename) {
        throw APIError.invalidArgument("Nome do arquivo não fornecido");
      }

      if (!validateExcelFilename(req.filename)) {
        throw APIError.invalidArgument(
          "Tipo de arquivo inválido. Apenas arquivos Excel (.xlsx, .xls) ou CSV são permitidos."
        );
      }

      // NOVO: Suportar ambos os formatos (data JSON ou file base64)
      let rawData: ExcelRow[];
      let fileSize: number;
      
      if (req.data) {
        // Método novo: dados já vêm parseados como JSON
        logger.file.info('data_received_json', {
          filename: req.filename,
          records_count: req.data.length,
        });
        rawData = req.data;
        fileSize = JSON.stringify(req.data).length; // Tamanho aproximado
      } else if (req.file) {
        // Método legado: arquivo base64
        const fileBuffer = Buffer.from(req.file, 'base64');
        fileSize = fileBuffer.length;
        
        logger.file.info('data_received_base64', {
          filename: req.filename,
          file_size: fileSize,
        });
        
        logOperationStart(logger.file, 'excel_parse', { filename: req.filename });
        rawData = readExcelFile(fileBuffer);
        logOperationComplete(logger.file, 'excel_parse', 0, {
          records_found: rawData.length,
        });
      } else {
        throw APIError.invalidArgument('Nenhum dado fornecido (esperado "data" ou "file")');
      }

      if (!rawData || rawData.length === 0) {
        throw APIError.invalidArgument('Arquivo Excel está vazio ou não contém dados');
      }
      
      // Validar estrutura básica dos dados
      if (!validateBasicStructure(rawData)) {
        throw APIError.invalidArgument('Estrutura de dados inválida');
      }
      
      // Validação completa (com warnings, não bloqueia)
      const validation = validateAlarmEvents(rawData);
      if (!validation.success && validation.errors) {
        logValidationWarnings(logger.file, 'input_validation', validation.errors, {
          filename: req.filename,
          records_count: rawData.length,
        });
        // Continua processamento apesar dos warnings
      }

      // Create history record
      const createdHistoryId = await createHistory({
        originalFileName: req.filename,
        fileSize: fileSize,
        recordsCount: rawData.length,
        customPrompt: req.prompt,
        modelUsed: 'llama-3.3-70b-versatile',
      });

      if (createdHistoryId) {
        historyId = createdHistoryId;
        logHistoryEvent(logger.file, 'created', historyId, {
          filename: req.filename,
          records: rawData.length,
        });
      } else {
        logger.file.warn('history_save_failed', {
          error: 'create_history_returned_null',
          filename: req.filename,
        });
      }

      // Process with AI or Deterministic
      let excelBuffer: Uint8Array;
      
      if (req.useDeterministic) {
        // Processamento determinístico (baseado nas regras do ChatGPT)
        logOperationStart(logger.file, 'deterministic_processing', {
          filename: req.filename,
          records: rawData.length,
        });
        
        const processedData = processDeterministic(rawData);
        excelBuffer = createExcelFile(processedData);
        
        logOperationComplete(logger.file, 'deterministic_processing', 0, {
          records_processed: processedData.length,
        });
      } else {
        // Processamento com IA (método original)
      logOperationStart(logger.file, 'ai_processing', {
        filename: req.filename,
        records: rawData.length,
        has_custom_prompt: !!req.prompt,
      });
      
        excelBuffer = await processExcelData(rawData, req.prompt);
        
        logOperationComplete(logger.file, 'ai_processing', 0, {
          records: rawData.length,
        });
      }

      logger.file.info('buffer_generated', {
        buffer_size: excelBuffer.length,
        size_mb: (excelBuffer.length / (1024 * 1024)).toFixed(2),
      });

      if (!excelBuffer || excelBuffer.length === 0) {
        throw APIError.internal('Arquivo processado está vazio');
      }

      // Generate processed filename
      const timestamp = Date.now();
      const nameWithoutExt = req.filename.substring(0, req.filename.lastIndexOf('.'));
      const processedFilename = `${nameWithoutExt}-processado-${timestamp}.xlsx`;

      logOperationComplete(logger.file, 'file_processing', Date.now() - startTime, {
        original_filename: req.filename,
        processed_filename: processedFilename,
        buffer_size: excelBuffer.length,
      });

      // Update history with success
      if (historyId) {
        try {
          await updateHistory({
            id: historyId,
            status: 'SUCCESS',
            processedFileName: processedFilename,
            processingTimeMs: Date.now() - startTime,
          });
          
          logHistoryEvent(logger.file, 'updated', historyId, {
            status: 'SUCCESS',
            duration_ms: Date.now() - startTime,
          });
        } catch (dbError) {
          logger.file.warn('history_update_failed', {
            error: dbError instanceof Error ? dbError.message : 'Unknown error',
            history_id: historyId,
          });
        }
      }

      // Convert buffer to base64 for response
      const base64Data = Buffer.from(excelBuffer).toString('base64');
      
      return {
        data: base64Data,
        filename: processedFilename,
      };
    } catch (error) {
      logError(logger.file, 'upload_and_process', error as Error, {
        filename: req.filename,
        has_history_id: !!historyId,
      });

      // Update history with error
      if (historyId) {
        try {
          await updateHistory({
            id: historyId,
            status: 'ERROR',
            errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
            processingTimeMs: Date.now() - startTime,
          });
          
          logHistoryEvent(logger.file, 'updated', historyId, {
            status: 'ERROR',
            error_message: error instanceof Error ? error.message : 'Unknown',
          });
        } catch (dbError) {
          logger.file.warn('history_update_failed_on_error', {
            error: dbError instanceof Error ? dbError.message : 'Unknown error',
            history_id: historyId,
          });
        }
      }

      // Re-throw as APIError if not already
      if (error instanceof APIError) {
        throw error;
      }

      throw APIError.internal(
        error instanceof Error ? error.message : 'Erro ao processar arquivo'
      );
    }
  }
);

/**
 * API: Validate Excel file without processing
 * POST /validate
 */
export const validate = api(
  {
    method: "POST",
    path: "/validate",
    expose: true,
  },
  async (req: ValidateRequest): Promise<ValidateResponse> => {
    try {
      if (!req.filename) {
        throw APIError.invalidArgument("Nome do arquivo não fornecido");
      }

      if (!validateExcelFilename(req.filename)) {
        throw APIError.invalidArgument(
          "Tipo de arquivo inválido. Apenas arquivos Excel (.xlsx, .xls) ou CSV são permitidos."
        );
      }

      // Suportar ambos os formatos
      let rawData: ExcelRow[];
      let fileSize: number;
      
      if (req.data) {
        // Dados já parseados
        rawData = req.data;
        fileSize = JSON.stringify(req.data).length;
      } else if (req.file) {
        // Arquivo base64
        const fileBuffer = Buffer.from(req.file, 'base64');
        rawData = readExcelFile(fileBuffer);
        fileSize = fileBuffer.length;
      } else {
        throw APIError.invalidArgument('Nenhum dado fornecido');
      }

      return {
        success: true,
        message: 'Arquivo válido',
        data: {
          filename: req.filename,
          size: fileSize,
          records: rawData.length,
          columns: rawData.length > 0 ? Object.keys(rawData[0]) : [],
        },
      };
    } catch (error) {
      console.error('❌ Erro na validação:', error);

      if (error instanceof APIError) {
        throw error;
      }

      throw APIError.internal(
        error instanceof Error ? error.message : 'Erro ao validar arquivo'
      );
    }
  }
);

