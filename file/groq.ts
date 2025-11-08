import Groq from 'groq-sdk';
import { secret } from "encore.dev/config";
import { ExcelRow } from '../shared/types';

/**
 * Groq API Key (managed by Encore secrets)
 * Set with: encore secret set --dev GroqKey
 * Get your key at: https://console.groq.com/keys
 */
const groqKey = secret("GroqKey");

/**
 * Modelos disponíveis no Groq (Llama 3.3 é o mais recente)
 */
export const GROQ_MODELS = {
  LLAMA_3_3_70B: 'llama-3.3-70b-versatile',      // Mais recente e poderoso
  LLAMA_3_1_70B: 'llama-3.1-70b-versatile',      // Anterior, muito bom
  LLAMA_3_1_8B: 'llama-3.1-8b-instant',          // Mais rápido, menor qualidade
  MIXTRAL_8X7B: 'mixtral-8x7b-32768',            // Alternativa Mistral
  GEMMA_2_9B: 'gemma2-9b-it',                    // Google Gemma
} as const;

const DEFAULT_MODEL = GROQ_MODELS.LLAMA_3_3_70B;

/**
 * Cria e retorna uma instância do cliente Groq
 */
function getGroqClient(): Groq {
  const apiKey = groqKey();
  
  if (!apiKey) {
    throw new Error('Groq API Key não configurada. Use: encore secret set --dev GroqKey\nObtenha em: https://console.groq.com/keys');
  }
  
  return new Groq({
    apiKey,
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
 * Processa dados com Groq LLM (Llama 3.3)
 * MUITO mais rápido que OpenAI (até 10x)!
 */
export async function processDataWithGroq(
  data: ExcelRow[],
  prompt: string,
  model?: string
): Promise<string> {
  try {
    const groq = getGroqClient();
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
    
    console.log(`🚀 Usando modelo Groq: ${selectedModel}`);
    const startTime = Date.now();
    
    const requestConfig = {
      model: selectedModel,
      messages: [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: `${prompt}\n\nDADOS (JSON compacto):\n${dataString}\n\nRetorne APENAS JSON no formato: {"data": [...]}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 32768, // Groq suporta mais tokens
      response_format: { type: 'json_object' as const }, // Groq suporta JSON mode
    };
    
    console.log('📝 Usando modo JSON forçado (Groq)');
    
    const completion = await groq.chat.completions.create(requestConfig as any);
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Resposta recebida em ${elapsedTime} segundos (Groq é RÁPIDO! ⚡)`);
    
    const response = completion.choices[0]?.message?.content || '';
    if (!response) {
      throw new Error('Resposta vazia do Groq');
    }
    
    if (completion.usage) {
      console.log(`📊 Tokens usados: ${completion.usage.total_tokens} (prompt: ${completion.usage.prompt_tokens}, completion: ${completion.usage.completion_tokens})`);
    }
    
    return response;
  } catch (error: unknown) {
    console.error('❌ Erro na requisição Groq:', error);
    
    // Tratamento de erros específicos do Groq
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      if (errorMessage.includes('invalid api key') || errorMessage.includes('unauthorized')) {
        throw new Error('API Key do Groq inválida. Configure: encore secret set --dev GroqKey\nObtenha em: https://console.groq.com/keys');
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        throw new Error('Limite de requisições excedido. Aguarde e tente novamente.');
      } else if (errorMessage.includes('quota') || errorMessage.includes('billing')) {
        throw new Error('Sem créditos Groq. Verifique sua conta.');
      }
    }
    
    throw new Error(`Erro ao processar com Groq: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

/**
 * Parse JSON response com múltiplas estratégias de fallback
 */
export function parseGroqResponse(response: string): any[] {
  console.log('🔍 Parseando resposta do Groq...');
  
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
      throw new Error('Não foi possível parsear resposta do Groq');
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

