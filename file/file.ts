import { api, APIError } from "encore.dev/api";
import { readExcelFile, validateExcelFilename } from './excel';
import { processExcelData } from './processing';
import { createHistory, updateHistory } from '../history/history';

/**
 * Upload and Process Request
 * File is sent as base64 encoded string
 */
interface UploadRequest {
  file: string; // base64 encoded
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
 */
interface ValidateRequest {
  file: string; // base64 encoded
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

      // Convert base64 to Buffer
      const fileBuffer = Buffer.from(req.file, 'base64');
      
      console.log(`📁 Arquivo recebido: ${req.filename} (${fileBuffer.length} bytes)`);

      // Read Excel data
      console.log('📖 Lendo dados do arquivo Excel...');
      const rawData = readExcelFile(fileBuffer);

      if (!rawData || rawData.length === 0) {
        throw APIError.invalidArgument('Arquivo Excel está vazio ou não contém dados');
      }

      console.log(`✅ ${rawData.length} registros encontrados no arquivo`);

      // Create history record
      try {
        historyId = await createHistory({
          originalFileName: req.filename,
          fileSize: fileBuffer.length,
          recordsCount: rawData.length,
          customPrompt: req.prompt,
          modelUsed: 'gpt-4o',
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
      const base64Data = excelBuffer.toString('base64');
      
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

      // Convert base64 to Buffer
      const fileBuffer = Buffer.from(req.file, 'base64');
      const rawData = readExcelFile(fileBuffer);

      return {
        success: true,
        message: 'Arquivo válido',
        data: {
          filename: req.filename,
          size: fileBuffer.length,
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

