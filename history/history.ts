import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import {
  ProcessingHistory,
  ProcessingStatus,
  PaginationParams,
  PaginationResult,
  Stats,
} from "../shared/types";

// Database connection
const db = new SQLDatabase("processing_history", {
  migrations: "./migrations",
});

/**
 * List Request/Response
 */
interface ListHistoryRequest {
  page?: number;
  pageSize?: number;
}

interface ListHistoryResponse {
  success: boolean;
  data: ProcessingHistory[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Get by ID Request/Response
 */
interface GetHistoryRequest {
  id: string;
}

interface GetHistoryResponse {
  success: boolean;
  data: ProcessingHistory;
}

/**
 * Stats Response
 */
interface StatsResponse {
  success: boolean;
  data: Stats;
}

/**
 * Create History Input
 */
export interface CreateHistoryInput {
  originalFileName: string;
  fileSize: number;
  recordsCount: number;
  customPrompt?: string;
  modelUsed?: string;
}

/**
 * Update History Input
 */
export interface UpdateHistoryInput {
  id: string;
  status: 'SUCCESS' | 'ERROR';
  errorMessage?: string;
  processedFileName?: string;
  processingTimeMs: number;
  tokensUsed?: number;
}

/**
 * API: List processing history (paginated)
 * GET /history
 */
export const list = api(
  {
    method: "GET",
    path: "/history",
    expose: true,
  },
  async (req: ListHistoryRequest): Promise<ListHistoryResponse> => {
    const page = req.page || 1;
    const pageSize = Math.min(req.pageSize || 20, 100); // Max 100

    if (page < 1 || pageSize < 1) {
      throw APIError.invalidArgument("Parâmetros de paginação inválidos");
    }

    const skip = (page - 1) * pageSize;

    // Get records
    const records = await db.query<ProcessingHistory>`
      SELECT 
        id,
        original_file_name as "originalFileName",
        file_size as "fileSize",
        records_count as "recordsCount",
        custom_prompt as "customPrompt",
        status,
        error_message as "errorMessage",
        processed_file_name as "processedFileName",
        processing_time_ms as "processingTimeMs",
        tokens_used as "tokensUsed",
        model_used as "modelUsed",
        started_at as "startedAt",
        completed_at as "completedAt"
      FROM processing_history
      ORDER BY started_at DESC
      LIMIT ${pageSize} OFFSET ${skip}
    `;

    // Get total count
    const totalResult = await db.query<{ count: number }>`
      SELECT COUNT(*)::int as count
      FROM processing_history
    `;
    const total = totalResult[0]?.count || 0;

    return {
      success: true,
      data: records,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
);

/**
 * API: Get processing history by ID
 * GET /history/:id
 */
export const get = api(
  {
    method: "GET",
    path: "/history/:id",
    expose: true,
  },
  async (req: GetHistoryRequest): Promise<GetHistoryResponse> => {
    if (!req.id) {
      throw APIError.invalidArgument("ID não fornecido");
    }

    const records = await db.query<ProcessingHistory>`
      SELECT 
        id,
        original_file_name as "originalFileName",
        file_size as "fileSize",
        records_count as "recordsCount",
        custom_prompt as "customPrompt",
        status,
        error_message as "errorMessage",
        processed_file_name as "processedFileName",
        processing_time_ms as "processingTimeMs",
        tokens_used as "tokensUsed",
        model_used as "modelUsed",
        started_at as "startedAt",
        completed_at as "completedAt"
      FROM processing_history
      WHERE id = ${req.id}
    `;

    if (records.length === 0) {
      throw APIError.notFound("Histórico não encontrado");
    }

    return {
      success: true,
      data: records[0],
    };
  }
);

/**
 * API: Get processing statistics
 * GET /history/stats
 */
export const stats = api(
  {
    method: "GET",
    path: "/history/stats",
    expose: true,
  },
  async (): Promise<StatsResponse> => {
    const statsResult = await db.query<{
      total: number;
      successful: number;
      failed: number;
      avg_time: number | null;
    }>`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'SUCCESS')::int as successful,
        COUNT(*) FILTER (WHERE status = 'ERROR')::int as failed,
        AVG(processing_time_ms) FILTER (WHERE status = 'SUCCESS') as avg_time
      FROM processing_history
    `;

    const result = statsResult[0] || {
      total: 0,
      successful: 0,
      failed: 0,
      avg_time: null,
    };

    return {
      success: true,
      data: {
        total: result.total,
        successful: result.successful,
        failed: result.failed,
        successRate:
          result.total > 0
            ? ((result.successful / result.total) * 100).toFixed(2)
            : "0",
        avgProcessingTimeMs: result.avg_time || 0,
      },
    };
  }
);

/**
 * Internal function: Create new processing history record
 * Used by file service when starting processing
 */
export async function createHistory(
  input: CreateHistoryInput
): Promise<string> {
  const result = await db.query<{ id: string }>`
    INSERT INTO processing_history (
      original_file_name,
      file_size,
      records_count,
      custom_prompt,
      model_used,
      status,
      started_at
    ) VALUES (
      ${input.originalFileName},
      ${input.fileSize},
      ${input.recordsCount},
      ${input.customPrompt || null},
      ${input.modelUsed || 'gpt-4o'},
      'PROCESSING',
      NOW()
    )
    RETURNING id
  `;

  const id = result[0].id;
  console.log(`📝 Histórico criado: ${id}`);
  return id;
}

/**
 * Internal function: Update processing history with result
 * Used by file service when finishing processing
 */
export async function updateHistory(input: UpdateHistoryInput): Promise<void> {
  await db.exec`
    UPDATE processing_history
    SET 
      status = ${input.status},
      error_message = ${input.errorMessage || null},
      processed_file_name = ${input.processedFileName || null},
      processing_time_ms = ${input.processingTimeMs},
      tokens_used = ${input.tokensUsed || null},
      completed_at = NOW()
    WHERE id = ${input.id}
  `;

  console.log(`✅ Histórico atualizado: ${input.id} (${input.status})`);
}

