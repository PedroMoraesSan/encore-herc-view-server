import OpenAI from 'openai';
import { secret } from "encore.dev/config";
import { ExcelRow } from '../shared/types';

/**
 * OpenAI API Key (managed by Encore secrets)
 * Set with: encore secret set --dev OpenAIKey
 */
const openaiKey = secret("OpenAIKey");

/**
 * Modelos disponíveis no OpenAI
 */
export const OPENAI_MODELS = {
  GPT_4_TURBO: 'gpt-4-turbo-preview',
  GPT_4: 'gpt-4',
  GPT_4O: 'gpt-4o',
  GPT_3_5_TURBO: 'gpt-3.5-turbo',
  GPT_3_5_TURBO_16K: 'gpt-3.5-turbo-16k',
  O1_PREVIEW: 'o1-preview',
  O1_MINI: 'o1-mini',
} as const;

const DEFAULT_MODEL = OPENAI_MODELS.GPT_4O;

/**
 * Cria e retorna uma instância do cliente OpenAI
 */
function getOpenAIClient(): OpenAI {
  const apiKey = openaiKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API Key não configurada. Use: encore secret set --dev OpenAIKey');
  }
  
  return new OpenAI({
    apiKey,
    timeout: 300000, // 5 minutos
    maxRetries: 3,
  });
}

/**
 * Sanitiza um valor para garantir JSON válido
 */
function sanitizeValue(value: any): any {
  if (value === null || value === undefined) return null;
  
  if (typeof value === 'string') {
    return value
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove caracteres de controle
      .replace(/\r\n/g, ' ')
      .replace(/[\r\n]/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .trim();
  }
  
  return value;
}

/**
 * Processa dados com OpenAI LLM
 */
export async function processDataWithOpenAI(
  data: ExcelRow[],
  prompt: string,
  model?: string
): Promise<string> {
  try {
    const openai = getOpenAIClient();
    const selectedModel = model || DEFAULT_MODEL;
    
    // Otimizar e sanitizar dados
    const optimizedData = data.map(row => {
      const optimized: any = {};
      for (const [key, value] of Object.entries(row)) {
        if (value !== null && value !== undefined && value !== '') {
          optimized[key] = sanitizeValue(value);
        }
      }
      return optimized;
    });
    
    const dataString = JSON.stringify(optimizedData);
    const dataSizeKB = (Buffer.byteLength(dataString, 'utf8') / 1024).toFixed(2);
    console.log(`📊 Tamanho dos dados: ${dataSizeKB} KB (${data.length} registros)`);
    
    if (Buffer.byteLength(dataString, 'utf8') > 100 * 1024) {
      console.warn('⚠️  Dados muito grandes. Pode exceder limites de contexto.');
    }
    
    // Sistema de prompt
    const systemPrompt = `Você é um especialista em transformação e análise de dados de segurança patrimonial.

SUA MISSÃO:
Transformar dados brutos de eventos de alarme em um formato consolidado de relatório com ABERTURA e FECHAMENTO.

DADOS DE ENTRADA:
- Formato CSV/Excel com colunas: Empresa, Conta, Data de recebimento, Código do evento, Descrição, etc.
- Cada linha é um EVENTO individual (ARMADO ou DESARMADO)
- Código 1401 = DESARMADO (abertura da loja)
- Código 3401 = ARMADO (fechamento da loja)

DADOS DE SAÍDA:
- Formato consolidado com colunas: FILIAL, UF, ABERTURA, FECHAMENTO, OPERADOR(A) ABERTURA, OPERADOR(A) FECHAMENTO
- Cada linha representa UM DIA de UMA FILIAL (não mais eventos individuais)
- ABERTURA e FECHAMENTO na mesma linha

REGRAS DE TRANSFORMAÇÃO:
1. Extraia o número da filial da coluna "Conta" (ex: "LOJA 318" → 318)
2. Agrupe eventos por FILIAL + DIA (ignora hora no agrupamento)
3. Para cada grupo (filial+dia), pegue o primeiro DESARMADO como ABERTURA e o primeiro ARMADO como FECHAMENTO
4. Se faltar ABERTURA ou FECHAMENTO em algum dia, replique do dia anterior da mesma filial
5. Ordene: primeiro por FILIAL (crescente), depois por DATA (decrescente - mais recente primeiro)
6. Retorne APENAS JSON válido: {"data": [array de objetos]}

REGRAS DE JSON VÁLIDO:
- NÃO inclua quebras de linha dentro de valores de string
- SEMPRE escape aspas duplas (use \\")
- NÃO use caracteres de controle
- Garanta strings devidamente fechadas
- NÃO vírgulas após último elemento`;
    
    console.log(`🤖 Usando modelo OpenAI: ${selectedModel}`);
    const startTime = Date.now();
    
    const supportsJsonMode = !selectedModel.startsWith('o1');
    const requestConfig: any = {
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `${prompt}\n\nDADOS (JSON compacto):\n${dataString}\n\nRetorne APENAS JSON no formato: {"data": [...]}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 16384,
    };
    
    if (supportsJsonMode && (selectedModel.includes('gpt-4') || selectedModel.includes('gpt-3.5'))) {
      requestConfig.response_format = { type: 'json_object' };
      console.log('📝 Usando modo JSON forçado');
    }
    
    try {
      const completion = await openai.chat.completions.create(requestConfig);
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Resposta recebida em ${elapsedTime} segundos`);
      
      const response = completion.choices[0]?.message?.content || '';
      if (!response) {
        throw new Error('Resposta vazia do OpenAI');
      }
      
      if (completion.usage) {
        console.log(`📊 Tokens usados: ${completion.usage.total_tokens}`);
      }
      
      return response;
    } catch (createError: unknown) {
      if (createError instanceof OpenAI.APIError && 
          createError.message.includes('response_format') && 
          requestConfig.response_format) {
        console.log('⚠️  Tentando sem response_format...');
        delete requestConfig.response_format;
        const completion = await openai.chat.completions.create(requestConfig);
        return completion.choices[0]?.message?.content || '';
      }
      throw createError;
    }
  } catch (error: unknown) {
    console.error('❌ Erro na requisição OpenAI:', error);
    
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        throw new Error('API Key do OpenAI inválida. Configure: encore secret set --dev OpenAIKey');
      } else if (error.status === 429) {
        throw new Error('Limite de requisições excedido. Aguarde e tente novamente.');
      } else if (error.status === 402) {
        throw new Error('Sem créditos OpenAI. Verifique sua conta.');
      }
      throw new Error(`Erro na API OpenAI (${error.status}): ${error.message}`);
    }
    
    throw new Error(`Erro ao processar com OpenAI: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Parse JSON response com múltiplas estratégias de fallback
 */
export function parseOpenAIResponse(response: string): any[] {
  console.log('🔍 Parseando resposta do OpenAI...');
  
  // Limpar markdown
  let cleanedResponse = response.trim();
  if (cleanedResponse.startsWith('```json')) {
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  } else if (cleanedResponse.startsWith('```')) {
    cleanedResponse = cleanedResponse.replace(/```\n?/g, '');
  }
  
  // Tentar encontrar JSON
  let jsonMatch = cleanedResponse.match(/\{[\s\S]*?\}(?=\s*$)|\[[\s\S]*?\](?=\s*$)/) || 
                  cleanedResponse.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  
  if (!jsonMatch) {
    throw new Error('Nenhum JSON encontrado na resposta');
  }
  
  let jsonString = jsonMatch[0];
  let parsed: any;
  
  try {
    parsed = JSON.parse(jsonString);
    console.log('✅ JSON parseado com sucesso');
  } catch (parseError) {
    console.warn('⚠️  JSON malformado, tentando corrigir...');
    // Tenta correções básicas
    jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error('Não foi possível parsear resposta do OpenAI');
    }
  }
  
  // Se for array direto, retorna
  if (Array.isArray(parsed)) {
    return parsed;
  }
  
  // Se for objeto com propriedade "data"
  if (typeof parsed === 'object' && parsed !== null) {
    if (parsed.data && Array.isArray(parsed.data)) {
      return parsed.data;
    }
    // Tenta encontrar qualquer array
    const arrayKeys = Object.keys(parsed).filter(key => Array.isArray(parsed[key]));
    if (arrayKeys.length > 0) {
      return parsed[arrayKeys[0]];
    }
    return [parsed];
  }
  
  throw new Error('Formato de resposta inesperado');
}

