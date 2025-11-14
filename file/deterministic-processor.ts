/**
 * Processador Determinístico de Planilhas de Arme/Desarme
 * 
 * Implementa as regras de negócio definidas no plano do ChatGPT:
 * - ABERTURA: primeiro DESARME do dia, entre 05:30-08:30
 * - FECHAMENTO: último ARME do dia, entre 22:30-01:30 (dia seguinte)
 * - Horários fora do intervalo: gerar aleatório dentro do intervalo
 * - Dias faltantes: criar dia artificial com horários aleatórios
 * - Operador faltante: repetir operador do dia anterior
 * - Garantir unicidade: horários nunca se repetem (hora, minuto, segundo)
 * 
 * Baseado no código Python fornecido no chatgpt-view.txt
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
 */
function extractFilial(conta: any): string {
  if (!conta) return 'INDEFINIDO';
  
  const contaStr = String(conta).toUpperCase();
  
  // Padrão: "PAGUE MENOS (LOJA 318)" -> "318"
  const match = contaStr.match(/LOJA\s*(\d+)/i);
  if (match) {
    return match[1];
  }
  
  // Padrão: "ESCRITÓRIO CENTRAL" -> "ESCRITÓRIO"
  if (contaStr.includes('ESCRITÓRIO')) {
    return 'ESCRITÓRIO';
  }
  
  // Se já é um número, retorna direto
  if (/^\d+$/.test(contaStr.trim())) {
    return contaStr.trim();
  }
  
  return contaStr;
}

/**
 * Captura e limpa nome do operador, mantendo apenas o nome principal
 * Remove prefixos e espaços extras, mas mantém o nome do operador
 * 
 * Abordagem robusta: busca em todas as chaves do objeto por padrões relacionados
 * E também extrai da coluna "Descrição" quando o nome está lá
 */
function getOperadorOriginal(row: ExcelRow): string {
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
  const descricao = row['Descrição'];
  if (descricao) {
    const descricaoStr = String(descricao).trim();
    
    // Padrões para extrair nome do operador da descrição:
    // - "ARMADO PELO USUARIO  - SRA. JOSEFÁ" -> "JOSEFÁ"
    // - "DESARMADO PELO USUÁRIO  - SR. JOÃO" -> "JOÃO"
    // - "ARMADO PELO USUARIO - MARIA" -> "MARIA"
    // - "DESARMADO POR USUARIO - PEDRO" -> "PEDRO"
    
    // Regex para capturar nome após "PELO USUARIO" ou "PELO USUÁRIO" ou "POR USUARIO"
    // Exemplo: "ARMADO PELO USUARIO  - SRA. JOSEFÁ" -> captura "JOSEFÁ"
    // Exemplo: "DESARMADO PELO USUÁRIO  - SR. JOÃO" -> captura "JOÃO"
    
    // Padrão principal: captura tudo após "PELO USUARIO" ou "PELO USUÁRIO" seguido de hífen/espaços e opcionalmente SR./SRA.
    const pattern = /(?:PELO|POR)\s+USU[ÁA]RIO\s*[-\s]+\s*(?:SR\.|SRA\.)?\s*(.+)/i;
    const match = descricaoStr.match(pattern);
    
    if (match && match[1]) {
      const nomeExtraido = match[1].trim();
      // Remover qualquer coisa após o nome (como hífens ou outros caracteres)
      const nomeLimpo = nomeExtraido.split(/[-–\s]+/)[0].trim();
      if (nomeLimpo && nomeLimpo.length > 0) {
        return cleanOperadorName(nomeLimpo);
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
  
  // Remover prefixos comuns (case insensitive)
  // Padrões: "SR.", "SRA.", "PELO USUARIO", "PELO USUÁRIO", "POR USUARIO", "POR USUÁRIO"
  cleaned = cleaned.replace(/^(SR\.|SRA\.|PELO\s+USUARIO|PELO\s+USUÁRIO|POR\s+USUARIO|POR\s+USUÁRIO|PELO\s+USUÁRIO\s+)\s*/i, '');
  
  // Remover espaços extras no início e fim, mas manter espaços internos
  cleaned = cleaned.trim();
  
  // Se após limpeza ficar vazio, retornar vazio
  if (!cleaned) return '';
  
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
    // Se parseou mas perdeu horário (virou 00:00:00), é porque a string não tinha horário
    // Neste caso, é melhor retornar null para podermos debugar
    if (isoDate.getHours() === 0 && isoDate.getMinutes() === 0 && isoDate.getSeconds() === 0) {
      console.log(`⚠️ Data parseada sem horário: "${str}" -> ${formatDateTime(isoDate)}`);
    }
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
 */
function ensureUniqueTimestamps(rows: ProcessedRow[]): ProcessedRow[] {
  const seen = new Set<string>();
  
  return rows.map(row => {
    let abertura = parseTimestamp(row.ABERTURA);
    let fechamento = parseTimestamp(row.FECHAMENTO);
    
    if (!abertura || !fechamento) return row;
    
    // Normalizar para segundo
    abertura = new Date(abertura.getFullYear(), abertura.getMonth(), abertura.getDate(),
      abertura.getHours(), abertura.getMinutes(), abertura.getSeconds());
    fechamento = new Date(fechamento.getFullYear(), fechamento.getMonth(), fechamento.getDate(),
      fechamento.getHours(), fechamento.getMinutes(), fechamento.getSeconds());
    
    // Ajustar abertura se colidir
    while (seen.has(abertura.toISOString())) {
      abertura = new Date(abertura.getTime() + 1000); // +1 segundo
    }
    seen.add(abertura.toISOString());
    
    // Ajustar fechamento se colidir
    while (seen.has(fechamento.toISOString()) || fechamento.getTime() === abertura.getTime()) {
      fechamento = new Date(fechamento.getTime() + 1000); // +1 segundo
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
 * @returns Array de linhas processadas
 */
export function processDeterministic(rawData: ExcelRow[]): ProcessedRow[] {
  // Debug: Verificar estrutura dos dados
  if (rawData.length > 0) {
    const firstRow = rawData[0];
    const keys = Object.keys(firstRow);
    console.log('🔍 Colunas disponíveis no Excel:', keys);
    console.log('🔍 Primeira linha de exemplo:', JSON.stringify(firstRow, null, 2));
    
    // Debug CRÍTICO: Verificar tipo do timestamp
    const dataRecebimento = firstRow['Data de recebimento'];
    console.log('🔍 DEBUG TIMESTAMP - Tipo do campo "Data de recebimento":',{
      valor: dataRecebimento,
      tipo: typeof dataRecebimento,
      isDate: dataRecebimento instanceof Date,
      constructor: dataRecebimento?.constructor?.name,
    });
    
    // Testar primeiras 5 linhas
    console.log('🔍 DEBUG TIMESTAMPS - Primeiras 5 linhas:');
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      const row = rawData[i];
      const dt = row['Data de recebimento'];
      console.log(`  Linha ${i + 1}:`, {
        valor: dt,
        tipo: typeof dt,
        isDate: dt instanceof Date,
        formatted: dt instanceof Date ? formatDateTime(dt) : String(dt),
      });
    }
  }
  
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
  
  console.log(`✅ Total de eventos processados: ${events.length}`);
  if (events.length > 0) {
    console.log('🔍 Primeiro evento:', events[0]);
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
  const processedRows: ProcessedRow[] = [];
  
  for (const [filial, range] of filialDateRanges.entries()) {
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
      
      // Log detalhado dos ARMEs encontrados
      if (armes.length > 0) {
        console.log(`🔍 ARMEs ENCONTRADOS - Filial ${filial}, Data ${dateKey.toISOString().split('T')[0]}:`, {
          totalArmesDisponíveis: armes.length,
          fonte: armesDay.length > 0 ? 'mesmo dia' : 'dia seguinte',
          armesDetalhados: armes.slice(0, 3).map(a => ({
            timestamp: formatDateTime(a.timestamp),
            hora: a.timestamp.getHours(),
            minuto: a.timestamp.getMinutes(),
            dataEvento: getDateOnly(a.timestamp).toISOString().split('T')[0],
            operador: a.operador,
          })),
          selecionado: {
            timestamp: formatDateTime(armes[0].timestamp),
            hora: armes[0].timestamp.getHours(),
            minuto: armes[0].timestamp.getMinutes(),
            operador: armes[0].operador,
          },
        });
      }
      
      let abertura: Date;
      let aberturaOperador: string;
      let fechamento: Date;
      let fechamentoOperador: string;
      
      // Processar ABERTURA
      if (desarmes.length > 0) {
        const firstDesarme = desarmes[0];
        abertura = new Date(firstDesarme.timestamp);
        // Usar nome do operador (já limpo pela função getOperadorOriginal)
        aberturaOperador = firstDesarme.operador || '';
        
        
        // Se horário fora da janela, ajustar
        if (!isInOpenWindow(abertura)) {
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
        
        console.log(`🔍 VALIDAÇÃO FECHAMENTO - Filial ${filial}, Data ${dateKey.toISOString().split('T')[0]}:`, {
          timestampOriginal: formatDateTime(timestampOriginal),
          hora: hour,
          minuto: minute,
          isDiaSeguinte: isDiaSeguinte,
          dataEvento: fechamentoDate.toISOString().split('T')[0],
          dataProcessando: dateKey.toISOString().split('T')[0],
          dentroJanela: dentroJanela,
          janelaEsperada: isDiaSeguinte ? '00:00-01:30 (dia seguinte)' : '22:30-23:59 (mesmo dia)',
        });
        
        // Se horário fora da janela, ajustar
        if (!dentroJanela) {
          console.log(`⚠️ FECHAMENTO FORA DA JANELA - Ajustando...`);
          
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
            console.log(`✅ FECHAMENTO AJUSTADO (dia seguinte): ${formatDateTime(fechamento)}`);
          } else {
            fechamento = new Date(
              dateKey.getFullYear(),
              dateKey.getMonth(),
              dateKey.getDate(),
              randomTime.hour,
              randomTime.minute,
              randomTime.second
            );
            console.log(`✅ FECHAMENTO AJUSTADO (mesmo dia): ${formatDateTime(fechamento)}`);
          }
        } else {
          console.log(`✅ FECHAMENTO MANTIDO (dentro da janela): ${formatDateTime(fechamento)}`);
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
        UF: 'SE', // Pode ser extraído dos dados originais se disponível
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
  
  console.log(`✅ Total de linhas processadas: ${finalRows.length}`);
  
  return finalRows;
}

