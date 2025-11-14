/**
 * Funções de sanitização de dados
 * 
 * Remove caracteres inválidos e garante que dados estejam
 * em formato seguro para processamento e JSON
 */

/**
 * Sanitiza um valor para garantir JSON válido
 * 
 * Remove caracteres de controle, normaliza quebras de linha,
 * escapa aspas e limpa espaços em branco
 * 
 * @param value - Valor a ser sanitizado (any type)
 * @returns Valor sanitizado ou null se vazio/inválido
 * 
 * @example
 * sanitizeValue('Nome\ncom\nquebras') // 'Nome com quebras'
 * sanitizeValue('Com "aspas"') // 'Com \\"aspas\\"'
 * sanitizeValue(null) // null
 */
export function sanitizeValue(value: any): any {
  // Null/undefined permanecem como null
  if (value === null || value === undefined) {
    return null;
  }
  
  // Se não for string, retorna como está
  if (typeof value !== 'string') {
    return value;
  }
  
  return value
    // Remove caracteres de controle (0x00-0x1F, 0x7F)
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Normaliza quebras de linha Windows
    .replace(/\r\n/g, ' ')
    // Remove quebras de linha Unix/Mac
    .replace(/[\r\n]/g, ' ')
    // Remove tabs
    .replace(/\t/g, ' ')
    // Escapa barras invertidas
    .replace(/\\/g, '\\\\')
    // Escapa aspas duplas
    .replace(/"/g, '\\"')
    // Remove espaços extras no início/fim
    .trim();
}

/**
 * Sanitiza um objeto completo recursivamente
 * 
 * Remove propriedades vazias e sanitiza todos os valores
 * 
 * @param obj - Objeto a ser sanitizado
 * @returns Objeto sanitizado
 * 
 * @example
 * sanitizeObject({ name: 'Test\n', empty: '', value: 123 })
 * // { name: 'Test', value: 123 }
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): Partial<T> {
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Ignora valores vazios
    if (value !== null && value !== undefined && value !== '') {
      sanitized[key] = sanitizeValue(value);
    }
  }
  
  return sanitized;
}

/**
 * Sanitiza um array de objetos
 * 
 * @param data - Array de objetos a serem sanitizados
 * @returns Array de objetos sanitizados
 * 
 * @example
 * sanitizeDataArray([
 *   { name: 'Test\n', id: 1 },
 *   { name: 'Test2', id: 2, empty: '' }
 * ])
 * // [{ name: 'Test', id: 1 }, { name: 'Test2', id: 2 }]
 */
export function sanitizeDataArray<T extends Record<string, any>>(
  data: T[]
): Array<Partial<T>> {
  return data.map(row => sanitizeObject(row));
}

/**
 * Valida e limpa string JSON
 * 
 * Remove markdown code blocks, espaços extras e tenta corrigir JSON malformado
 * 
 * @param jsonString - String JSON potencialmente malformada
 * @returns String JSON limpa
 * 
 * @example
 * cleanJsonString('```json\n{"data": [1,2,3]}\n```') // '{"data": [1,2,3]}'
 */
export function cleanJsonString(jsonString: string): string {
  let cleaned = jsonString.trim();
  
  // Remove markdown code blocks
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/```\n?/g, '');
  }
  
  // Remove vírgulas trailing (erro comum)
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  
  return cleaned.trim();
}

/**
 * Remove caracteres invisíveis e normaliza espaços
 * 
 * @param text - Texto a ser limpo
 * @returns Texto normalizado
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, ' ')  // Múltiplos espaços -> único espaço
    .replace(/\u200B/g, '') // Remove zero-width space
    .replace(/\u00A0/g, ' ') // Normaliza non-breaking space
    .trim();
}

/**
 * Valida se uma string é JSON válido
 * 
 * @param jsonString - String a ser validada
 * @returns true se for JSON válido
 */
export function isValidJson(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Calcula tamanho de dados em formato legível
 * 
 * @param data - String ou objeto a ter o tamanho calculado
 * @returns Objeto com tamanho em bytes e formato legível
 * 
 * @example
 * calculateDataSize({ large: 'data'.repeat(1000) })
 * // { bytes: 4000, readable: '3.91 KB' }
 */
export function calculateDataSize(data: string | object): {
  bytes: number;
  readable: string;
  kb: number;
  mb: number;
} {
  const dataString = typeof data === 'string' ? data : JSON.stringify(data);
  const bytes = Buffer.byteLength(dataString, 'utf8');
  const kb = bytes / 1024;
  const mb = kb / 1024;
  
  let readable: string;
  if (mb >= 1) {
    readable = `${mb.toFixed(2)} MB`;
  } else if (kb >= 1) {
    readable = `${kb.toFixed(2)} KB`;
  } else {
    readable = `${bytes} bytes`;
  }
  
  return { bytes, readable, kb, mb };
}

