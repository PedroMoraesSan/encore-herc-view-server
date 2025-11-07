/**
 * Shared types used across all services
 */

export interface ExcelRow {
  [key: string]: any;
}

export interface ProcessedData {
  [key: string]: any;
}

export enum ProcessingStatus {
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface ProcessingHistory {
  id: string;
  originalFileName: string;
  fileSize: number;
  recordsCount: number;
  customPrompt: string | null;
  status: ProcessingStatus;
  errorMessage: string | null;
  processedFileName: string | null;
  processingTimeMs: number | null;
  tokensUsed: number | null;
  modelUsed: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationResult<T> {
  records: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface Stats {
  total: number;
  successful: number;
  failed: number;
  successRate: string;
  avgProcessingTimeMs: number;
}

