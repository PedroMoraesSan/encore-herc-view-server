import { api, APIError } from "encore.dev/api";
import { readExcelFile, validateExcelFilename } from './excel';
import { processExcelData } from './processing';
import { createHistory, updateHistory } from '../history/history';
import { ExcelRow } from '../shared/types';

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
        console.log('📊 Dados recebidos como JSON (método otimizado)');
        rawData = req.data;
        fileSize = JSON.stringify(req.data).length; // Tamanho aproximado
        console.log(`✅ ${rawData.length} registros recebidos diretamente`);
      } else if (req.file) {
        // Método legado: arquivo base64
        console.log('📁 Arquivo recebido como base64 (método legado)');
        const fileBuffer = Buffer.from(req.file, 'base64');
        fileSize = fileBuffer.length;
        
        console.log(`📁 Arquivo: ${req.filename} (${fileSize} bytes)`);
        console.log('📖 Lendo dados do arquivo Excel...');
        
        rawData = readExcelFile(fileBuffer);
        console.log(`✅ ${rawData.length} registros encontrados no arquivo`);
      } else {
        throw APIError.invalidArgument('Nenhum dado fornecido (esperado "data" ou "file")');
      }

      if (!rawData || rawData.length === 0) {
        throw APIError.invalidArgument('Arquivo Excel está vazio ou não contém dados');
      }

      // Create history record
      try {
        historyId = await createHistory({
          originalFileName: req.filename,
          fileSize: fileSize,
          recordsCount: rawData.length,
          customPrompt: req.prompt,
          modelUsed: 'llama-3.3-70b-versatile',
        });
      } catch (dbError) {
        console.warn('⚠️  Não foi possível salvar histórico no banco:', dbError);
        // Continue processing even if history save fails
      }

      // Process with AI
      console.log('🤖 Iniciando processamento com IA...');
      const excelBuffer = await processExcelData(rawData, req.prompt);

      console.log(`📦 Buffer gerado: ${excelBuffer.length} bytes`);

      if (!excelBuffer || excelBuffer.length === 0) {
        throw APIError.internal('Arquivo processado está vazio');
      }

      // Generate processed filename
      const timestamp = Date.now();
      const nameWithoutExt = req.filename.substring(0, req.filename.lastIndexOf('.'));
      const processedFilename = `${nameWithoutExt}-processado-${timestamp}.xlsx`;

      console.log(`✅ Relatório gerado: ${processedFilename}`);

      // Update history with success
      if (historyId) {
        try {
          await updateHistory({
            id: historyId,
            status: 'SUCCESS',
            processedFileName: processedFilename,
            processingTimeMs: Date.now() - startTime,
          });
        } catch (dbError) {
          console.warn('⚠️  Não foi possível atualizar histórico:', dbError);
        }
      }

      // Convert buffer to base64 for response
      const base64Data = Buffer.from(excelBuffer).toString('base64');
      
      return {
        data: base64Data,
        filename: processedFilename,
      };
    } catch (error) {
      console.error('❌ Erro no upload and process:', error);

      // Update history with error
      if (historyId) {
        try {
          await updateHistory({
            id: historyId,
            status: 'ERROR',
            errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
            processingTimeMs: Date.now() - startTime,
          });
        } catch (dbError) {
          console.warn('⚠️  Não foi possível atualizar histórico com erro:', dbError);
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

