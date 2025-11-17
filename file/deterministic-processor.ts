/**
 * Processador Determinístico de Planilhas de Arme/Desarme
 * 
 * REGRAS DE NEGÓCIO:
 * - ABERTURA: primeiro DESARME do dia, entre 05:30-08:30
 * - FECHAMENTO: último ARME do dia, entre 22:30-01:30 (dia seguinte)
 * 
 * REGRA PRINCIPAL: Preservar horários originais quando dentro do intervalo esperado
 * - Horários dentro do intervalo: MANTER ORIGINAL (não alterar)
 * - Horários fora do intervalo: AJUSTAR para dentro do intervalo
 * - Dias faltantes: CRIAR horário artificial dentro do intervalo
 * 
 * Operador faltante: repetir operador do dia anterior
 * Garantir unicidade: horários nunca se repetem (hora, minuto, segundo)
 */

import { ExcelRow } from '../shared/types';
import { EVENT_CODES } from '../shared/business-rules';

/**
 * Configurações de intervalos de horários
 */
const OPEN_MIN = { hour: 5, minute: 30 }; // 05:30
const OPEN_MAX = { hour: 8, minute: 30 }; // 08:30
const CLOSE_START = { hour: 22, minute: 30 }; // 22:30
const CLOSE_END = { hour: 1, minute: 30 }; // 01:30

/**
 * Interface para dados processados
 */
export interface ProcessedRow {
  FILIAL: string;
  UF?: string;
  ABERTURA: string; // Formato: dd/mm/yyyy HH:mm:ss
  FECHAMENTO: string; // Formato: dd/mm/yyyy HH:mm:ss
  'OPERADOR(A) ABERTURA': string;
  'OPERADOR(A) FECHAMENTO': string;
}

/**
 * Interface para evento classificado
 */
interface ClassifiedEvent {
  timestamp: Date;
  type: 'DESARME' | 'ARME' | 'OTHER';
  operador: string;
  filial: string;
  date: Date; // Data sem hora (para agrupamento)
}

/**
 * Converte time object para segundos desde meia-noite
 */
function timeToSeconds(hour: number, minute: number, second: number = 0): number {
  return hour * 3600 + minute * 60 + second;
}

/**
 * Converte segundos desde meia-noite para time object
 */
function secondsToTime(seconds: number): { hour: number; minute: number; second: number } {
  seconds = seconds % (24 * 3600);
  const hour = Math.floor(seconds / 3600);
  const minute = Math.floor((seconds % 3600) / 60);
  const second = seconds % 60;
  return { hour, minute, second };
}

/**
 * Gera horário aleatório determinístico dentro de um intervalo
 * 
 * @param seedKey - Chave para gerar seed determinística (ex: "OPEN-318-2025-10-27")
 * @param startHour - Hora inicial
 * @param startMinute - Minuto inicial
 * @param endHour - Hora final
 * @param endMinute - Minuto final
 * @returns Objeto com hour, minute, second
 */
function randomTimeBetween(
  seedKey: string,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number
): { hour: number; minute: number; second: number } {
  // Gerar seed determinística a partir da chave
  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) {
    const char = seedKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const seed = Math.abs(hash);
  
  // Usar seed para gerador pseudo-aleatório simples
  let rnd = seed;
  const next = () => {
    rnd = (rnd * 9301 + 49297) % 233280;
    return rnd / 233280;
  };

  const startSeconds = timeToSeconds(startHour, startMinute);
  const endSeconds = timeToSeconds(endHour, endMinute);

  let randomSeconds: number;

  if (endSeconds >= startSeconds) {
    // Intervalo normal (não cruza meia-noite)
    const range = endSeconds - startSeconds;
    randomSeconds = startSeconds + Math.floor(next() * (range + 1));
  } else {
    // Intervalo cruza meia-noite (22:30 até 01:30)
    const range1 = 24 * 3600 - startSeconds; // 22:30 até 23:59:59
    const range2 = endSeconds + 1; // 00:00:00 até 01:30
    const total = range1 + range2;
    const pick = Math.floor(next() * total);
    
    if (pick < range1) {
      randomSeconds = startSeconds + pick;
    } else {
      randomSeconds = pick - range1;
    }
  }

  return secondsToTime(randomSeconds);
}

/**
 * Verifica se um horário está dentro da janela de ABERTURA
 */
function isInOpenWindow(date: Date): boolean {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeSeconds = timeToSeconds(hour, minute);
  const minSeconds = timeToSeconds(OPEN_MIN.hour, OPEN_MIN.minute);
  const maxSeconds = timeToSeconds(OPEN_MAX.hour, OPEN_MAX.minute);
  
  return timeSeconds >= minSeconds && timeSeconds <= maxSeconds;
}

/**
 * Verifica se um horário está dentro da janela de FECHAMENTO
 */
function isInCloseWindow(date: Date): boolean {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeSeconds = timeToSeconds(hour, minute);
  const startSeconds = timeToSeconds(CLOSE_START.hour, CLOSE_START.minute);
  const endSeconds = timeToSeconds(CLOSE_END.hour, CLOSE_END.minute);
  
  // Janela válida: 22:30-23:59:59 OU 00:00-01:30
  if (endSeconds < startSeconds) {
    // Cruza meia-noite
    return timeSeconds >= startSeconds || timeSeconds <= endSeconds;
  } else {
    return timeSeconds >= startSeconds && timeSeconds <= endSeconds;
  }
}

/**
 * Extrai número da filial da coluna "Conta"
 * 
 * PRIORIDADE:
 * 1. Se tiver "LOJA X", retorna o número da loja
 * 2. Se não tiver "LOJA", retorna número da conta + nome completo do cliente
 * 3. Se for "ESCRITÓRIO", retorna "ESCRITÓRIO"
 * 4. Se for apenas número, retorna o número
 */
function extractFilial(conta: any): string {
  if (!conta) return 'INDEFINIDO';
  
  const contaStr = String(conta).trim();
  const contaStrUpper = contaStr.toUpperCase();
  
  // PRIORIDADE 1: Se tiver "LOJA X", retorna o número da loja
  // Exemplo: "3691 - SÃO LUIZ SUPERMERCADO (LOJA 19)..." -> "19"
  // Exemplo: "PAGUE MENOS (LOJA 318)" -> "318"
  const lojaMatch = contaStrUpper.match(/LOJA\s*(\d+)/i);
  if (lojaMatch && lojaMatch[1]) {
    return lojaMatch[1];
  }
  
  // PRIORIDADE 2: "ESCRITÓRIO CENTRAL" -> "ESCRITÓRIO"
  // IMPORTANTE: Verificar antes de retornar nome completo
  if (contaStrUpper.includes('ESCRITÓRIO')) {
    return 'ESCRITÓRIO';
  }
  
  // PRIORIDADE 3: Se não tiver "LOJA" nem "ESCRITÓRIO", retorna número da conta + nome completo
  // Exemplo: "3691 - SÃO LUIZ SUPERMERCADO SHOPPING DEL PASSEO (DISTRIBUIDORA DE ALIMENTOS FARTURA S.A)"
  // -> "3691 - SÃO LUIZ SUPERMERCADO SHOPPING DEL PASSEO (DISTRIBUIDORA DE ALIMENTOS FARTURA S.A)"
  
  // Remover a parte "(LOJA X)" se existir (caso não tenha sido capturada acima)
  let resultado = contaStr.replace(/\s*\(LOJA\s*\d+\)\s*/gi, '').trim();
  
  // Se após remover LOJA ainda tiver conteúdo, retornar
  if (resultado && resultado.length > 0) {
    return resultado;
  }
  
  // PRIORIDADE 4: Se já é um número, retorna direto
  if (/^\d+$/.test(contaStr.trim())) {
    return contaStr.trim();
  }
  
  // Fallback: retorna a string original
  return contaStr;
}

/**
 * Captura e limpa nome do operador, mantendo apenas o nome principal
 * Remove prefixos e espaços extras, mas mantém o nome do operador
 * 
 * Abordagem robusta: busca em todas as chaves do objeto por padrões relacionados
 * E também extrai da coluna "Descrição" quando o nome está lá
 * 
 * ESPECIAL: Se for ARME REMOTO, retorna "ARME REMOTO" diretamente
 */
function getOperadorOriginal(row: ExcelRow): string {
  // Verificar se é ARME REMOTO - se for, retornar "ARME REMOTO" diretamente
  const descricao = String(row['Descrição'] || '').toUpperCase();
  if (descricao.includes('ARME REMOTO') || descricao.includes('ARMADO REMOTO')) {
    return 'ARME REMOTO';
  }
  
  // Lista de possíveis nomes de colunas (case insensitive)
  const possibleKeys = [
    'Usuário', 'Usuario', 'USUÁRIO', 'USUARIO',
    'Operador', 'OPERADOR',
    'Usuário(a)', 'Usuario(a)', 'USUÁRIO(A)',
    'Operador(a)', 'OPERADOR(A)',
    'User', 'USER',
    'Nome', 'NOME',
    'Nome do Usuário', 'Nome do Usuario',
    'Nome do Operador'
  ];
  
  // Primeiro, tentar busca direta nas chaves conhecidas
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      const valor = String(row[key]).trim();
      if (valor) {
        return cleanOperadorName(valor);
      }
    }
  }
  
  // Se não encontrou, buscar em todas as chaves do objeto por padrões
  const allKeys = Object.keys(row);
  const operadorKeywords = ['usuario', 'usuário', 'operador', 'user', 'nome'];
  
  for (const key of allKeys) {
    const keyLower = key.toLowerCase().trim();
    
    // Verificar se a chave contém alguma palavra-chave relacionada a operador
    const matchesKeyword = operadorKeywords.some(keyword => 
      keyLower.includes(keyword)
    );
    
    if (matchesKeyword) {
      const valor = row[key];
      if (valor !== undefined && valor !== null && valor !== '') {
        const valorStr = String(valor).trim();
        if (valorStr) {
          return cleanOperadorName(valorStr);
        }
      }
    }
  }
  
  // NOVO: Extrair da coluna "Descrição" se o nome do operador estiver lá
  // Exemplo: "ARMADO PELO USUARIO  - SRA. JOSEFÁ" -> "JOSEFÁ"
  // Exemplo: "DESARMADO PELO USUÁRIO  - SR. JOÃO" -> "JOÃO"
  // NOTA: ARME REMOTO já foi tratado no início da função
  const descricaoForExtraction = row['Descrição'];
  if (descricaoForExtraction) {
    const descricaoStr = String(descricaoForExtraction).trim();
    
    // Padrões para extrair nome do operador da descrição:
    // - "ARMADO PELO USUARIO  - SRA. JOSEFÁ" -> "JOSEFÁ"
    // - "DESARMADO PELO USUÁRIO  - SR. JOÃO" -> "JOÃO"
    // - "ARMADO PELO USUARIO - MARIA" -> "MARIA"
    // - "DESARMADO POR USUARIO - PEDRO" -> "PEDRO"
    // - "ARMADO PELO USUARIO - SRA. MARIA SILVA" -> "MARIA SILVA"
    
    // Múltiplos padrões para capturar diferentes formatos
    
    // Padrão 1: Com SR./SRA. e hífen/espaços
    // Exemplo: "ARMADO PELO USUARIO  - SRA. JOSEFÁ" -> captura "JOSEFÁ"
    // Exemplo: "ARMADO PELO USUARIO  - SRA. MARIA SILVA" -> captura "MARIA SILVA"
    let pattern1 = /(?:PELO|POR)\s+USU[ÁA]RIO\s*[-\s]+\s*(?:SR\.|SRA\.)\s+([^\s][^\d\-–—]+?)(?:\s*[-–—]|\s*$|\s*\d)/i;
    let match1 = descricaoStr.match(pattern1);
    if (match1 && match1[1]) {
      const nomeExtraido = match1[1].trim();
      // Validar que não é apenas o prefixo e tem conteúdo válido (mínimo 2 caracteres)
      if (nomeExtraido && nomeExtraido.length >= 2 && !/^(SR\.|SRA\.)$/i.test(nomeExtraido)) {
        const nomeLimpo = cleanOperadorName(nomeExtraido);
        if (nomeLimpo && nomeLimpo.length >= 2) {
          return nomeLimpo;
        }
      }
    }
    
    // Padrão 2: Com SR./SRA. sem hífen (apenas espaços)
    // Exemplo: "ARMADO PELO USUARIO SRA. JOSEFÁ" -> captura "JOSEFÁ"
    let pattern2 = /(?:PELO|POR)\s+USU[ÁA]RIO\s+(?:SR\.|SRA\.)\s+([^\s][^\d\-–—]+?)(?:\s*[-–—]|\s*$|\s*\d)/i;
    let match2 = descricaoStr.match(pattern2);
    if (match2 && match2[1]) {
      const nomeExtraido = match2[1].trim();
      if (nomeExtraido && nomeExtraido.length >= 2 && !/^(SR\.|SRA\.)$/i.test(nomeExtraido)) {
        const nomeLimpo = cleanOperadorName(nomeExtraido);
        if (nomeLimpo && nomeLimpo.length >= 2) {
          return nomeLimpo;
        }
      }
    }
    
    // Padrão 3: Sem SR./SRA., apenas com hífen/espaços
    // Exemplo: "ARMADO PELO USUARIO - MARIA" -> captura "MARIA"
    let pattern3 = /(?:PELO|POR)\s+USU[ÁA]RIO\s*[-\s]+\s*([^\s][^\d\-–—]+?)(?:\s*[-–—]|\s*$|\s*\d)/i;
    let match3 = descricaoStr.match(pattern3);
    if (match3 && match3[1]) {
      const nomeExtraido = match3[1].trim();
      // Validar que não é apenas o prefixo
      if (nomeExtraido && nomeExtraido.length >= 2 && !/^(SR\.|SRA\.)$/i.test(nomeExtraido)) {
        const nomeLimpo = cleanOperadorName(nomeExtraido);
        if (nomeLimpo && nomeLimpo.length >= 2) {
          return nomeLimpo;
        }
      }
    }
    
    // Padrão 4: Fallback - captura qualquer coisa após "PELO USUARIO" ou "POR USUARIO"
    // Último recurso para formatos não previstos
    let pattern4 = /(?:PELO|POR)\s+USU[ÁA]RIO\s*[:\-\s]+\s*(.+?)(?:\s*[-–—]|\s*$|\s*\d)/i;
    let match4 = descricaoStr.match(pattern4);
    if (match4 && match4[1]) {
      const nomeExtraido = match4[1].trim();
      // Remover SR./SRA. se estiver no início e pegar o que vem depois
      let nomeLimpo = nomeExtraido.replace(/^(SR\.|SRA\.)\s*/i, '').trim();
      // Remover caracteres especiais no final
      nomeLimpo = nomeLimpo.replace(/[-–—]+.*$/, '').trim();
      // Validar que não é apenas o prefixo e tem conteúdo válido
      if (nomeLimpo && nomeLimpo.length >= 2 && !/^(SR\.|SRA\.)$/i.test(nomeLimpo)) {
        const nomeFinal = cleanOperadorName(nomeLimpo);
        if (nomeFinal && nomeFinal.length >= 2) {
          return nomeFinal;
        }
      }
    }
  }
  
  // Se ainda não encontrou, retornar vazio
  return '';
}

/**
 * Limpa o nome do operador removendo prefixos mas mantendo o nome
 */
function cleanOperadorName(nome: string): string {
  if (!nome) return '';
  
  let cleaned = String(nome).trim();
  
  // Se estiver vazio após trim, retornar vazio
  if (!cleaned) return '';
  
  // Se for apenas "SR." ou "SRA." sem nome, retornar vazio
  if (/^(SR\.|SRA\.)$/i.test(cleaned)) return '';
  
  // Remover prefixos comuns (case insensitive) apenas se estiverem no início
  // Padrões: "SR.", "SRA.", "PELO USUARIO", "PELO USUÁRIO", "POR USUARIO", "POR USUÁRIO"
  cleaned = cleaned.replace(/^(SR\.|SRA\.)\s+/i, ''); // Remove SR./SRA. apenas se seguido de espaço
  cleaned = cleaned.replace(/^(PELO\s+USUARIO|PELO\s+USUÁRIO|POR\s+USUARIO|POR\s+USUÁRIO)\s*/i, '');
  
  // Remover espaços extras no início e fim, mas manter espaços internos
  cleaned = cleaned.trim();
  
  // Remover caracteres especiais no final (hífens, traços, etc)
  cleaned = cleaned.replace(/[-–—]+.*$/, '').trim();
  
  // Se após limpeza ficar vazio ou for apenas "SR." ou "SRA.", retornar vazio
  if (!cleaned || /^(SR\.|SRA\.)$/i.test(cleaned)) return '';
  
  return cleaned;
}

/**
 * Classifica evento como DESARME, ARME ou OTHER
 */
function classifyEvent(row: ExcelRow): 'DESARME' | 'ARME' | 'OTHER' {
  const codigo = row['Código do evento'];
  const descricao = String(row['Descrição'] || '').toUpperCase();
  
  // Verificar código do evento
  if (codigo === EVENT_CODES.DISARMED || codigo === 1401) {
    return 'DESARME';
  }
  if (codigo === EVENT_CODES.ARMED || codigo === 3401) {
    return 'ARME';
  }
  
  // Verificar descrição como fallback
  if (descricao.includes('DESARM') || descricao.includes('DESARME')) {
    return 'DESARME';
  }
  if (descricao.includes('ARM') && !descricao.includes('DESARM')) {
    return 'ARME';
  }
  
  return 'OTHER';
}

/**
 * Parse timestamp da coluna "Data de recebimento"
 * ATUALIZADO: Lida com Date objects nativos do Excel (raw: true)
 */
function parseTimestamp(dataRecebimento: any): Date | null {
  if (!dataRecebimento) return null;
  
  // Se já é um Date object (vindo do Excel com raw: true), retornar diretamente
  if (dataRecebimento instanceof Date) {
    const validDate = isNaN(dataRecebimento.getTime()) ? null : dataRecebimento;
    return validDate;
  }
  
  // Tentar parsear como string (fallback para CSV ou outros formatos)
  const str = String(dataRecebimento);
  
  // Formato: dd/mm/yyyy HH:mm:ss ou dd/mm/yyyy HH:mm
  const match = str.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, day, month, year, hour, minute, second = '0'] = match;
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    );
  }
  
  // Tentar parsear como ISO string ou formato mm/dd/yy
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }
  
  return null;
}

/**
 * Formata data para dd/mm/yyyy HH:mm:ss
 */
function formatDateTime(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}

/**
 * Obtém apenas a data (sem hora) para agrupamento
 */
function getDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Garante que horários não se repetem
 * IMPORTANTE: Preserva TODOS os campos do row, incluindo operadores
 * 
 * REGRA: Só ajusta horários quando há conflito real (duplicação)
 * Preserva horários originais sempre que possível
 */
function ensureUniqueTimestamps(rows: ProcessedRow[]): ProcessedRow[] {
  const seen = new Set<string>();
  
  return rows.map(row => {
    let abertura = parseTimestamp(row.ABERTURA);
    let fechamento = parseTimestamp(row.FECHAMENTO);
    
    if (!abertura || !fechamento) return row;
    
    // Normalizar para segundo (remover milissegundos)
    abertura = new Date(abertura.getFullYear(), abertura.getMonth(), abertura.getDate(),
      abertura.getHours(), abertura.getMinutes(), abertura.getSeconds());
    fechamento = new Date(fechamento.getFullYear(), fechamento.getMonth(), fechamento.getDate(),
      fechamento.getHours(), fechamento.getMinutes(), fechamento.getSeconds());
    
    const aberturaKey = abertura.toISOString();
    const fechamentoKey = fechamento.toISOString();
    
    // Ajustar abertura APENAS se houver conflito (duplicação)
    // Preservar horário original quando possível
    if (seen.has(aberturaKey)) {
      // Conflito detectado: ajustar mínimo necessário (+1 segundo)
      while (seen.has(abertura.toISOString())) {
        abertura = new Date(abertura.getTime() + 1000);
      }
    }
    seen.add(abertura.toISOString());
    
    // Ajustar fechamento APENAS se houver conflito (duplicação ou igual à abertura)
    // Preservar horário original quando possível
    const fechamentoFinalKey = fechamento.toISOString();
    if (seen.has(fechamentoFinalKey) || fechamento.getTime() === abertura.getTime()) {
      // Conflito detectado: ajustar mínimo necessário (+1 segundo)
      while (seen.has(fechamento.toISOString()) || fechamento.getTime() === abertura.getTime()) {
        fechamento = new Date(fechamento.getTime() + 1000);
      }
    }
    seen.add(fechamento.toISOString());
    
    // Preservar TODOS os campos do row original, incluindo operadores
    return {
      FILIAL: row.FILIAL,
      UF: row.UF,
      ABERTURA: formatDateTime(abertura),
      FECHAMENTO: formatDateTime(fechamento),
      'OPERADOR(A) ABERTURA': row['OPERADOR(A) ABERTURA'] || '',
      'OPERADOR(A) FECHAMENTO': row['OPERADOR(A) FECHAMENTO'] || '',
    };
  });
}

/**
 * Processa dados brutos e aplica todas as regras de negócio
 * 
 * @param rawData - Array de linhas do Excel original
 * @param uf - Unidade Federativa (padrão: 'SE' para Sergipe)
 * @returns Array de linhas processadas
 */
export function processDeterministic(rawData: ExcelRow[], uf: string = 'SE'): ProcessedRow[] {
  // 1. Classificar e normalizar eventos
  const events: ClassifiedEvent[] = [];
  
  for (const row of rawData) {
    const timestamp = parseTimestamp(row['Data de recebimento']);
    if (!timestamp) {
      continue;
    }
    
    const type = classifyEvent(row);
    if (type === 'OTHER') {
      continue;
    }
    
    const filial = extractFilial(row['Conta']);
    const operador = getOperadorOriginal(row);
    const date = getDateOnly(timestamp);
    
    events.push({
      timestamp,
      type,
      operador,
      filial,
      date,
    });
  }
  
  // 2. Agrupar por filial e determinar range de datas
  const filialDateRanges = new Map<string, { min: Date; max: Date }>();
  
  for (const event of events) {
    const filial = event.filial;
    const date = event.date;
    
    if (!filialDateRanges.has(filial)) {
      filialDateRanges.set(filial, { min: date, max: date });
    } else {
      const range = filialDateRanges.get(filial)!;
      if (date < range.min) range.min = date;
      if (date > range.max) range.max = date;
    }
  }
  
  // 3. Processar cada filial e cada dia
  // IMPORTANTE: Ordenar filiais - numéricas primeiro, depois textuais (alfabeticamente)
  const sortedFilials = Array.from(filialDateRanges.entries()).sort((a, b) => {
    const filialA = a[0];
    const filialB = b[0];
    
    // Verificar se são numéricas (apenas dígitos)
    const isNumericA = /^\d+$/.test(filialA);
    const isNumericB = /^\d+$/.test(filialB);
    
    // Filiais numéricas vêm primeiro
    if (isNumericA && !isNumericB) return -1;
    if (!isNumericA && isNumericB) return 1;
    
    // Se ambas são numéricas, ordenar numericamente
    if (isNumericA && isNumericB) {
      const numA = parseInt(filialA);
      const numB = parseInt(filialB);
      return numA - numB;
    }
    
    // Se ambas são textuais, ordenar alfabeticamente
    return filialA.localeCompare(filialB);
  });
  
  const processedRows: ProcessedRow[] = [];
  
  for (const [filial, range] of sortedFilials) {
    const filialEvents = events.filter(e => e.filial === filial);
    // Armazenar operadores do dia anterior para usar em dias faltantes
    let prevAberturaOperador: string | null = null;
    let prevFechamentoOperador: string | null = null;
    
    // Rastrear ARMEs já usados para evitar usar o mesmo ARME duas vezes
    // Chave: timestamp ISO do ARME
    const usedArmes = new Set<string>();
    
    // Iterar por todos os dias no range
    const currentDate = new Date(range.min);
    const endDate = new Date(range.max);
    
    while (currentDate <= endDate) {
      const dateKey = getDateOnly(currentDate);
      
      // Para ABERTURA: eventos do dia atual
      const dayEvents = filialEvents.filter(e => 
        e.date.getTime() === dateKey.getTime()
      );
      
      // Para FECHAMENTO: eventos do dia atual E eventos do dia seguinte até 01:30
      // (porque fechamento pode ser entre 22:30 do dia atual e 01:30 do dia seguinte)
      const nextDate = new Date(dateKey);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDayEvents = filialEvents.filter(e => {
        const eventDate = getDateOnly(e.timestamp);
        const isNextDay = eventDate.getTime() === nextDate.getTime();
        if (!isNextDay) return false;
        
        // Só considerar eventos até 01:30 do dia seguinte
        const hour = e.timestamp.getHours();
        const minute = e.timestamp.getMinutes();
        return hour === 0 || (hour === 1 && minute <= 30);
      });
      
      // Encontrar primeiro DESARME (abertura) - apenas do dia atual
      const desarmes = dayEvents
        .filter(e => e.type === 'DESARME')
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Encontrar último ARME (fechamento) - do dia atual OU do dia seguinte até 01:30
      // IMPORTANTE: Filtrar ARMEs que já foram usados
      // PRIORIDADE: Primeiro tentar ARMEs do dia atual, depois do dia seguinte
      const armesDay = dayEvents
        .filter(e => e.type === 'ARME' && !usedArmes.has(e.timestamp.toISOString()))
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Mais recente primeiro
      
      const armesNextDay = nextDayEvents
        .filter(e => e.type === 'ARME' && !usedArmes.has(e.timestamp.toISOString()))
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Mais recente primeiro
      
      // PRIORIDADE: Usar ARME do dia atual se existir, senão usar do dia seguinte
      const armes = armesDay.length > 0 ? armesDay : armesNextDay;
      
      let abertura: Date;
      let aberturaOperador: string;
      let fechamento: Date;
      let fechamentoOperador: string;
      
      // Processar ABERTURA
      if (desarmes.length > 0) {
        const firstDesarme = desarmes[0];
        const timestampOriginal = new Date(firstDesarme.timestamp);
        // Usar nome do operador (já limpo pela função getOperadorOriginal)
        aberturaOperador = firstDesarme.operador || '';
        
        // REGRA: Se horário está dentro da janela esperada (05:30-08:30), MANTER ORIGINAL
        // Só ajustar se estiver FORA da janela
        if (isInOpenWindow(timestampOriginal)) {
          // Horário dentro da regra: preservar original
          abertura = timestampOriginal;
        } else {
          // Horário fora da janela: ajustar para dentro do intervalo
          const seedKey = `OPEN-${filial}-${dateKey.toISOString().split('T')[0]}`;
          const randomTime = randomTimeBetween(
            seedKey,
            OPEN_MIN.hour,
            OPEN_MIN.minute,
            OPEN_MAX.hour,
            OPEN_MAX.minute
          );
          abertura = new Date(
            dateKey.getFullYear(),
            dateKey.getMonth(),
            dateKey.getDate(),
            randomTime.hour,
            randomTime.minute,
            randomTime.second
          );
        }
      } else {
        // Dia faltando - criar artificialmente usando operador do dia anterior da mesma filial
        const seedKey = `OPEN-${filial}-${dateKey.toISOString().split('T')[0]}`;
        const randomTime = randomTimeBetween(
          seedKey,
          OPEN_MIN.hour,
          OPEN_MIN.minute,
          OPEN_MAX.hour,
          OPEN_MAX.minute
        );
        abertura = new Date(
          dateKey.getFullYear(),
          dateKey.getMonth(),
          dateKey.getDate(),
          randomTime.hour,
          randomTime.minute,
          randomTime.second
        );
        // Usar operador do dia anterior da mesma filial (se disponível)
        aberturaOperador = prevAberturaOperador || prevFechamentoOperador || '';
        
      }
      
      // GARANTIR que sempre há um operador de abertura (usar do dia anterior se vazio)
      // Se não houver dia anterior, tentar usar do fechamento do mesmo dia (será processado depois)
      if (!aberturaOperador || !aberturaOperador.trim()) {
        // Primeiro tentar do dia anterior, depois do fechamento do mesmo dia (se já processado)
        aberturaOperador = prevAberturaOperador || prevFechamentoOperador || '';
      }
      
      // Processar FECHAMENTO
      if (armes.length > 0) {
        const lastArme = armes[0];
        const timestampOriginal = new Date(lastArme.timestamp);
        fechamento = new Date(lastArme.timestamp);
        // Usar nome do operador (já limpo pela função getOperadorOriginal)
        fechamentoOperador = lastArme.operador || '';
        
        // Marcar este ARME como usado
        usedArmes.add(lastArme.timestamp.toISOString());
        
        // VALIDAÇÃO MELHORADA: Verificar se horário está dentro da regra
        // Regra: 22:30 do dia atual até 01:30 do dia seguinte
        const hour = fechamento.getHours();
        const minute = fechamento.getMinutes();
        const fechamentoDate = getDateOnly(fechamento);
        const isDiaSeguinte = fechamentoDate.getTime() !== dateKey.getTime();
        
        // Verificar se está dentro da janela permitida
        let dentroJanela = false;
        
        if (isDiaSeguinte) {
          // Se é do dia seguinte, deve estar entre 00:00 e 01:30
          dentroJanela = hour === 0 || (hour === 1 && minute <= 30);
        } else {
          // Se é do mesmo dia, deve estar entre 22:30 e 23:59
          dentroJanela = hour === 22 && minute >= 30 || hour === 23;
        }
        
        // REGRA: Se horário está dentro da janela esperada, MANTER ORIGINAL
        // Só ajustar se estiver FORA da janela
        if (dentroJanela) {
          // Horário dentro da regra: preservar original (não alterar)
          fechamento = timestampOriginal;
        } else {
          // Horário fora da janela: ajustar para dentro do intervalo
          const seedKey = `CLOSE-${filial}-${dateKey.toISOString().split('T')[0]}`;
          const randomTime = randomTimeBetween(
            seedKey,
            CLOSE_START.hour,
            CLOSE_START.minute,
            CLOSE_END.hour,
            CLOSE_END.minute
          );
          
          // Se horário gerado está entre 00:00 e 01:30, pertence ao dia seguinte
          if (randomTime.hour === 0 || (randomTime.hour === 1 && randomTime.minute <= 30)) {
            fechamento = new Date(
              dateKey.getFullYear(),
              dateKey.getMonth(),
              dateKey.getDate() + 1,
              randomTime.hour,
              randomTime.minute,
              randomTime.second
            );
          } else {
            fechamento = new Date(
              dateKey.getFullYear(),
              dateKey.getMonth(),
              dateKey.getDate(),
              randomTime.hour,
              randomTime.minute,
              randomTime.second
            );
          }
        }
      } else {
        // Dia faltando - criar artificialmente usando operador do dia anterior da mesma filial
        // EXATAMENTE como abertura
        const seedKey = `CLOSE-${filial}-${dateKey.toISOString().split('T')[0]}`;
        const randomTime = randomTimeBetween(
          seedKey,
          CLOSE_START.hour,
          CLOSE_START.minute,
          CLOSE_END.hour,
          CLOSE_END.minute
        );
        
        // Se horário gerado está entre 00:00 e 01:30, pertence ao dia seguinte
        if (randomTime.hour === 0 || (randomTime.hour === 1 && randomTime.minute <= 30)) {
          fechamento = new Date(
            dateKey.getFullYear(),
            dateKey.getMonth(),
            dateKey.getDate() + 1,
            randomTime.hour,
            randomTime.minute,
            randomTime.second
          );
        } else {
          fechamento = new Date(
            dateKey.getFullYear(),
            dateKey.getMonth(),
            dateKey.getDate(),
            randomTime.hour,
            randomTime.minute,
            randomTime.second
          );
        }
        
        // Usar operador do dia anterior da mesma filial (se disponível)
        fechamentoOperador = prevFechamentoOperador || prevAberturaOperador || '';
      }
      
      // GARANTIR que sempre há um operador de fechamento (usar do dia anterior se vazio)
      // Se não houver dia anterior, usar da abertura do mesmo dia
      if (!fechamentoOperador || !fechamentoOperador.trim()) {
        // Primeiro tentar do dia anterior, depois da abertura do mesmo dia
        fechamentoOperador = prevFechamentoOperador || prevAberturaOperador || aberturaOperador || '';
      }
      
      // Se ainda estiver vazio após todas as tentativas, usar abertura do mesmo dia
      if (!fechamentoOperador || !fechamentoOperador.trim()) {
        fechamentoOperador = aberturaOperador || '';
      }
      
      // Se abertura ainda estiver vazia, usar fechamento do mesmo dia
      if (!aberturaOperador || !aberturaOperador.trim()) {
        aberturaOperador = fechamentoOperador || '';
      }
      
      // Garantir que abertura e fechamento não sejam iguais
      if (abertura.getTime() === fechamento.getTime()) {
        fechamento = new Date(fechamento.getTime() + 1000); // +1 segundo
      }
      
      const processedRow: ProcessedRow = {
        FILIAL: filial,
        UF: uf, // UF passada como parâmetro
        ABERTURA: formatDateTime(abertura),
        FECHAMENTO: formatDateTime(fechamento),
        'OPERADOR(A) ABERTURA': aberturaOperador || '',
        'OPERADOR(A) FECHAMENTO': fechamentoOperador || '',
      };
      
      processedRows.push(processedRow);
      
      // Atualizar operadores do dia anterior para usar em dias faltantes
      // Atualizar apenas se houver um operador válido (não vazio)
      if (aberturaOperador && aberturaOperador.trim()) {
        prevAberturaOperador = aberturaOperador;
      }
      if (fechamentoOperador && fechamentoOperador.trim()) {
        prevFechamentoOperador = fechamentoOperador;
      }
      
      // Avançar para próximo dia
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  // 4. Garantir unicidade de horários
  const finalRows = ensureUniqueTimestamps(processedRows);
  
  // 5. Ordenar registros finais: numéricas primeiro, textuais no final, depois por data
  const sortedFinalRows = finalRows.sort((a, b) => {
    const filialA = a.FILIAL;
    const filialB = b.FILIAL;
    
    // Verificar se são numéricas (apenas dígitos)
    const isNumericA = /^\d+$/.test(filialA);
    const isNumericB = /^\d+$/.test(filialB);
    
    // Filiais numéricas vêm primeiro
    if (isNumericA && !isNumericB) return -1;
    if (!isNumericA && isNumericB) return 1;
    
    // Se ambas são numéricas, ordenar numericamente
    if (isNumericA && isNumericB) {
      const numA = parseInt(filialA);
      const numB = parseInt(filialB);
      
      if (numA !== numB) {
        return numA - numB;
      }
    } else {
      // Se ambas são textuais, ordenar alfabeticamente
      const textCompare = filialA.localeCompare(filialB);
      if (textCompare !== 0) {
        return textCompare;
      }
    }
    
    // Se mesma filial, ordenar por data de ABERTURA
    const dateA = parseTimestamp(a.ABERTURA);
    const dateB = parseTimestamp(b.ABERTURA);
    
    if (!dateA || !dateB) {
      return 0; // Manter ordem se não conseguir parsear
    }
    
    return dateA.getTime() - dateB.getTime();
  });
  
  return sortedFinalRows;
}

