/**
 * Parser unificado para respostas de APIs de IA
 * 
 * Consolida a lógica de parsing que era duplicada entre Groq e OpenAI
 * Suporta múltiplas estratégias de fallback para garantir robustez
 */

import { cleanJsonString } from './sanitization';

/**
 * Estratégias de extração de JSON da resposta
 */
const JSON_EXTRACTION_STRATEGIES = [
  // Estratégia 1: JSON no final da string
  (text: string) => text.match(/\{[\s\S]*?\}(?=\s*$)|\[[\s\S]*?\](?=\s*$)/),
  
  // Estratégia 2: Qualquer JSON na string
  (text: string) => text.match(/\{[\s\S]*\}|\[[\s\S]*\]/),
  
  // Estratégia 3: JSON entre marcadores específicos
  (text: string) => text.match(/```json\s*(\{[\s\S]*?\})\s*```/),
] as const;

/**
 * Encontra e extrai JSON de uma string de texto
 * 
 * @param text - Texto contendo JSON (potencialmente com markdown ou texto extra)
 * @returns String JSON extraída ou null se não encontrar
 */
function extractJsonString(text: string): string | null {
  for (const strategy of JSON_EXTRACTION_STRATEGIES) {
    const match = strategy(text);
    if (match) {
      return match[0];
    }
  }
  return null;
}

/**
 * Tenta parsear JSON com correções automáticas
 * 
 * @param jsonString - String JSON a ser parseada
 * @returns Objeto parseado
 * @throws Error se não conseguir parsear mesmo com correções
 */
function parseJsonWithFallback(jsonString: string): any {
  // Tentativa 1: Parse direto
  try {
    return JSON.parse(jsonString);
  } catch (firstError) {
    console.warn('⚠️  JSON malformado, tentando corrigir...');
    
    // Tentativa 2: Limpar e tentar novamente
    const cleaned = cleanJsonString(jsonString);
    try {
      return JSON.parse(cleaned);
    } catch (secondError) {
      // Tentativa 3: Correções adicionais
      const extraCleaned = cleaned
        .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Adiciona aspas em keys
        .trim();
      
      try {
        return JSON.parse(extraCleaned);
      } catch (thirdError) {
        throw new Error(
          `Não foi possível parsear resposta da IA. ` +
          `Erros: ${firstError instanceof Error ? firstError.message : 'unknown'}`
        );
      }
    }
  }
}

/**
 * Extrai array de dados do objeto parseado
 * 
 * Tenta encontrar o array de dados em diferentes estruturas:
 * - Array direto: [...]
 * - Objeto com propriedade 'data': { data: [...] }
 * - Objeto com qualquer propriedade array
 * - Objeto único: {...} -> [...]
 * 
 * @param parsed - Objeto JSON parseado
 * @returns Array de dados
 */
function extractDataArray(parsed: any): any[] {
  // Se já é array, retorna direto
  if (Array.isArray(parsed)) {
    return parsed;
  }
  
  // Se é objeto
  if (typeof parsed === 'object' && parsed !== null) {
    // Tenta propriedade 'data'
    if (parsed.data && Array.isArray(parsed.data)) {
      return parsed.data;
    }
    
    // Tenta propriedade 'results'
    if (parsed.results && Array.isArray(parsed.results)) {
      return parsed.results;
    }
    
    // Tenta propriedade 'items'
    if (parsed.items && Array.isArray(parsed.items)) {
      return parsed.items;
    }
    
    // Procura qualquer propriedade que seja array
    const arrayKeys = Object.keys(parsed).filter(key => Array.isArray(parsed[key]));
    if (arrayKeys.length > 0) {
      console.log(`📋 Array encontrado na propriedade: ${arrayKeys[0]}`);
      return parsed[arrayKeys[0]];
    }
    
    // Se não encontrou array, retorna objeto como array de um elemento
    console.log('⚠️  Retornando objeto único como array');
    return [parsed];
  }
  
  throw new Error('Formato de resposta inesperado: não é array nem objeto');
}

/**
 * Parse unificado de respostas de IA (Groq, OpenAI, etc)
 * 
 * Extrai e valida dados de resposta da IA com múltiplas estratégias de fallback
 * 
 * @param response - String de resposta da API de IA
 * @param source - Nome do provider para logging (ex: 'Groq', 'OpenAI')
 * @returns Array de objetos de dados processados
 * @throws Error se não conseguir extrair dados válidos
 * 
 * @example
 * // Resposta com markdown
 * parseAIResponse('```json\n{"data": [{"id": 1}]}\n```', 'Groq')
 * // [{"id": 1}]
 * 
 * @example
 * // Array direto
 * parseAIResponse('[{"id": 1}, {"id": 2}]', 'OpenAI')
 * // [{"id": 1}, {"id": 2}]
 */
export function parseAIResponse(response: string, source: string = 'IA'): any[] {
  console.log(`🔍 Parseando resposta do ${source}...`);
  
  // Validação inicial
  if (!response || typeof response !== 'string') {
    throw new Error('Resposta vazia ou inválida');
  }
  
  // 1. Limpar markdown e whitespace
  const cleanedResponse = cleanJsonString(response);
  
  // 2. Extrair JSON da string
  const jsonString = extractJsonString(cleanedResponse);
  if (!jsonString) {
    throw new Error('Nenhum JSON encontrado na resposta');
  }
  
  // 3. Parsear JSON com fallbacks
  const parsed = parseJsonWithFallback(jsonString);
  
  // 4. Extrair array de dados
  const dataArray = extractDataArray(parsed);
  
  // 5. Validação final
  if (!Array.isArray(dataArray)) {
    throw new Error('Dados extraídos não são um array');
  }
  
  if (dataArray.length === 0) {
    console.warn('⚠️  Array de dados está vazio');
  }
  
  console.log(`✅ JSON parseado com sucesso: ${dataArray.length} registros`);
  
  return dataArray;
}

/**
 * Valida se a resposta contém dados processados válidos
 * 
 * @param data - Array de dados a validar
 * @returns true se válido, false caso contrário
 */
export function validateProcessedData(data: any[]): boolean {
  if (!Array.isArray(data)) {
    console.error('❌ Dados não são um array');
    return false;
  }
  
  if (data.length === 0) {
    console.error('❌ Array de dados está vazio');
    return false;
  }
  
  // Verifica se todos os elementos são objetos
  const allObjects = data.every(item => 
    typeof item === 'object' && item !== null && !Array.isArray(item)
  );
  
  if (!allObjects) {
    console.error('❌ Nem todos os elementos são objetos');
    return false;
  }
  
  return true;
}

/**
 * Parse com validação automática
 * 
 * @param response - Resposta da IA
 * @param source - Nome do provider
 * @returns Array validado de dados
 * @throws Error se dados inválidos
 */
export function parseAndValidateAIResponse(
  response: string,
  source: string = 'IA'
): any[] {
  const data = parseAIResponse(response, source);
  
  if (!validateProcessedData(data)) {
    throw new Error('Dados processados não passaram na validação');
  }
  
  return data;
}

