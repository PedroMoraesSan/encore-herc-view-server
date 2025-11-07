import { api } from "encore.dev/api";

/**
 * Health Check Response
 */
interface HealthResponse {
  status: string;
  message: string;
  timestamp: string;
  uptime: number;
}

/**
 * API: Health check endpoint
 * GET /health
 * 
 * Retorna status da API para monitoramento
 */
export const health = api(
  {
    method: "GET",
    path: "/health",
    expose: true,
  },
  async (): Promise<HealthResponse> => {
    return {
      status: "ok",
      message: "HERC Segurança API está rodando",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
);

