import { ExcelRow } from '../shared/types';
import { processDataWithOpenAI, parseOpenAIResponse } from './openai';
import { createExcelFile } from './excel';

/**
 * Normaliza horários de ABERTURA/FECHAMENTO conforme regras do negócio
 */
function normalizeOpenCloseTimes(rows: any[]): any[] {
  const parseDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') {
      const parts = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (parts) {
        const d = Number(parts[1]);
        const m = Number(parts[2]) - 1;
        const y = Number(parts[3].length === 2 ? `20${parts[3]}` : parts[3]);
        const hh = Number(parts[4]);
        const mm = Number(parts[5]);
        const ss = Number(parts[6] || 0);
        return new Date(y, m, d, hh, mm, ss);
      }
      const d2 = new Date(value);
      if (!isNaN(d2.getTime())) return d2;
    }
    return null;
  };

  const formatBack = (date: Date, original: any): any => {
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const str = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    if (typeof original === 'string') return str;
    return date;
  };

  const getField = (obj: any, candidates: string[]): string | null => {
    const keys = Object.keys(obj);
    const found = keys.find(k => candidates.some(c => k.toLowerCase().includes(c.toLowerCase())));
    return found || null;
  };

  return rows.map(row => {
    const descKey = getField(row, ['descrição', 'evento', 'status', 'tipo']);
    const dateKey = getField(row, ['data de recebimento', 'data/hora', 'data', 'timestamp', 'hora']);
    if (!dateKey) return row;

    const original = row[dateKey];
    const dt = parseDate(original);
    if (!dt) return row;

    const description: string = (descKey ? String(row[descKey]) : '').toUpperCase();

    const setTime = (d: Date, hh: number, mm: number) => {
      const nd = new Date(d);
      nd.setHours(hh, mm, 0, 0);
      return nd;
    };

    const inRange = (d: Date, startHH: number, startMM: number, endHH: number, endMM: number): boolean => {
      const t = d.getHours() * 60 + d.getMinutes();
      const start = startHH * 60 + startMM;
      const end = endHH * 60 + endMM;
      return t >= start && t <= end;
    };

    const isAbertura = /ABERT|DESARM/.test(description);
    const isFechamento = /FECH|ARMAD/.test(description);

    let adjusted: Date | null = null;

    if (isAbertura) {
      if (!inRange(dt, 5, 30, 8, 30)) {
        adjusted = setTime(dt, 7, 0);
      }
    } else if (isFechamento) {
      const minutes = dt.getHours() * 60 + dt.getMinutes();
      const isSameDayNight = minutes >= (22 * 60 + 30);
      const isNextDayEarly = minutes <= (1 * 60 + 30);

      if (!(isSameDayNight || isNextDayEarly)) {
        if (dt.getHours() < 12) {
          const next = new Date(dt);
          next.setDate(next.getDate() + 1);
          adjusted = setTime(next, 0, 30);
        } else {
          adjusted = setTime(dt, 22, 30);
        }
      }
    }

    if (adjusted) {
      row[dateKey] = formatBack(adjusted, original);
    }
    return row;
  });
}

/**
 * Processa um arquivo Excel completo com IA
 */
export async function processExcelData(
  data: ExcelRow[],
  customPrompt?: string
): Promise<Uint8Array> {
  try {
    const defaultPrompt = `Você é um especialista em transformação de dados de segurança.

FORMATO DE ENTRADA (você receberá):
- Empresa, Conta, Data de recebimento, Código do evento, Descrição, Partição, Auxiliar, Descrição do receptor
- Conta contém: "LOJA XXX" onde XXX é o número da filial
- Código do evento: 1401 = DESARMADO (abertura), 3401 = ARMADO (fechamento)
- Descrição: "DESARMADO/ARMADO PELO USUARIO - SR./SRA. NOME DO OPERADOR"
- Data de recebimento: formato dd/mm/yyyy HH:mm:ss

FORMATO DE SAÍDA (você deve gerar):
{
  "data": [
    {
      "FILIAL": "número extraído da loja",
      "UF": "SE",
      "ABERTURA": "data/hora do DESARMADO (1401)",
      "FECHAMENTO": "data/hora do ARMADO (3401)",
      "OPERADOR(A) ABERTURA": "nome extraído do DESARMADO",
      "OPERADOR(A) FECHAMENTO": "nome extraído do ARMADO"
    }
  ]
}

REGRAS DE TRANSFORMAÇÃO:
1. Extraia o número da FILIAL da coluna "Conta" (ex: "LOJA 318" → "318")
2. Agrupe eventos por FILIAL e DIA (apenas data, ignore hora)
3. Para cada FILIAL + DIA, crie UMA linha com:
   - ABERTURA = evento com código 1401 (DESARMADO)
   - FECHAMENTO = evento com código 3401 (ARMADO)
4. Se um dia tiver apenas ABERTURA ou apenas FECHAMENTO, duplique do dia anterior mantendo a mesma filial
5. Garanta que cada dia de cada filial tenha 1 ABERTURA e 1 FECHAMENTO
6. Ordene por FILIAL (crescente) e depois por data (decrescente - mais recente primeiro)
7. Mantenha o formato de data/hora: dd/mm/yyyy HH:mm:ss
8. Extraia apenas o NOME do operador da descrição (remova "SR.", "SRA.", "PELO USUARIO", etc)

IMPORTANTE:
- Mantenha espaços à esquerda dos nomes dos operadores
- NÃO invente dados
- Se faltar dia, copie do dia anterior da mesma filial
- Retorne APENAS o JSON, sem explicações`;

    const prompt = customPrompt || defaultPrompt;
    const CHUNK_SIZE = 100;
    const needsChunking = data.length > CHUNK_SIZE;

    const processChunk = async (chunk: ExcelRow[], idx: number, total: number) => {
      const chunkPrompt = `${prompt}\n\nIMPORTANTE: Você está processando o LOTE ${idx + 1} de ${total}. Retorne SOMENTE os eventos deste lote.`;
      const response = await processDataWithOpenAI(chunk, chunkPrompt);
      const parsed = parseOpenAIResponse(response);
      return Array.isArray(parsed) ? parsed : [];
    };

    let processedData: any[] = [];
    const processStartTime = Date.now();
    
    if (needsChunking) {
      const total = Math.ceil(data.length / CHUNK_SIZE);
      console.log(`📦 Processamento em lotes: ${total} lotes de até ${CHUNK_SIZE} registros`);
      
      for (let i = 0; i < total; i++) {
        const chunkStartTime = Date.now();
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, data.length);
        const slice = data.slice(start, end);

        let attempts = 0;
        const maxAttempts = 3;
        
        while (true) {
          try {
            console.log(`📡 Enviando lote ${i + 1}/${total}... (${slice.length} registros)`);
            const result = await processChunk(slice, i, total);
            const chunkTime = (Date.now() - chunkStartTime) / 1000;
            console.log(`✅ Lote ${i + 1}/${total} processado em ${chunkTime.toFixed(2)}s (${result.length} registros)`);
            processedData.push(...result);
            
            // Delay adaptativo entre chunks para respeitar rate limit da OpenAI
            // Se ainda há mais chunks e o processamento foi rápido, adiciona delay
            if (i < total - 1) {
              const minTimePerChunk = 7; // 7s por chunk = ~8.5 req/min (abaixo de 500 RPM)
              const timeElapsed = chunkTime;
              
              if (timeElapsed < minTimePerChunk) {
                const delayNeeded = (minTimePerChunk - timeElapsed) * 1000;
                console.log(`⏱️  Aguardando ${(delayNeeded / 1000).toFixed(1)}s antes do próximo lote...`);
                await new Promise(r => setTimeout(r, delayNeeded));
              }
            }
            
            break;
          } catch (e) {
            attempts++;
            const msg = e instanceof Error ? e.message : String(e);
            if (attempts >= maxAttempts || !/429|rate limit|too large|TPM/i.test(msg)) {
              throw e;
            }
            const delay = 1500 * Math.pow(2, attempts - 1);
            console.warn(`⚠️  Lote ${i + 1}/${total} falhou (${msg}). Retentando em ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      
      const totalTime = ((Date.now() - processStartTime) / 1000).toFixed(2);
      console.log(`✅ Todos os lotes concluídos em ${totalTime}s. Total acumulado: ${processedData.length}`);
    } else {
      console.log('📡 Enviando dados para processamento com OpenAI...');
      const openaiResponse = await processDataWithOpenAI(data, prompt);
      const processTime = ((Date.now() - processStartTime) / 1000).toFixed(2);
      console.log(`✅ Resposta recebida do OpenAI em ${processTime}s`);
      processedData = parseOpenAIResponse(openaiResponse);
    }

    // Normalização pós-processamento
    processedData = normalizeOpenCloseTimes(processedData);
    
    if (!Array.isArray(processedData) || processedData.length === 0) {
      throw new Error('Dados processados estão vazios ou em formato inválido');
    }
    
    console.log(`✅ ${processedData.length} registros processados`);
    
    // Gerar Excel
    console.log('📊 Gerando arquivo Excel...');
    const excelBuffer = createExcelFile(processedData);
    
    console.log('✅ Arquivo Excel gerado com sucesso');
    
    return excelBuffer;
  } catch (error) {
    throw new Error(`Erro no processamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

