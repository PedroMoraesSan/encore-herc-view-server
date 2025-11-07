import * as XLSX from 'xlsx';
import { ExcelRow, ProcessedData } from '../shared/types';

/**
 * Lê um arquivo Excel (Buffer ou Uint8Array) e retorna os dados como array de objetos
 */
export function readExcelFile(buffer: Buffer | Uint8Array): ExcelRow[] {
  try {
    const workbook = XLSX.read(buffer, { 
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: false,
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Converte para JSON
    const data = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: null,
    }) as ExcelRow[];
    
    return data;
  } catch (error) {
    throw new Error(`Erro ao ler arquivo Excel: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Cria um arquivo Excel a partir de dados processados
 * Retorna Uint8Array para compatibilidade com Encore
 */
export function createExcelFile(data: ProcessedData[]): Uint8Array {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    
    // Ajusta largura das colunas
    const maxWidth = 50;
    const colWidths = Object.keys(data[0] || {}).map(() => ({ wch: maxWidth }));
    worksheet['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório Processado');
    
    const buffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      cellStyles: true,
    }) as Buffer;
    
    // Converter Buffer para Uint8Array
    return new Uint8Array(buffer);
  } catch (error) {
    throw new Error(`Erro ao criar arquivo Excel: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Valida se o arquivo é um Excel válido baseado no nome
 */
export function validateExcelFilename(filename: string): boolean {
  const validExtensions = ['.xlsx', '.xls', '.csv'];
  const fileExtension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return validExtensions.includes(fileExtension);
}

