/**
 * Utilitários para manipulação de datas
 * 
 * Funções reutilizáveis para parsing, formatação e manipulação de datas
 * Extraído de normalizeOpenCloseTimes para melhor testabilidade
 */

/**
 * Representa um horário (hora e minuto)
 */
export interface Time {
  hour: number;
  minute: number;
}

/**
 * Parse flexível de data que suporta múltiplos formatos
 * 
 * Suporta:
 * - Date objects
 * - Timestamps numéricos
 * - Strings em formato dd/mm/yyyy HH:mm:ss
 * - Strings em formato ISO
 * 
 * @param value - Valor a ser parseado
 * @returns Date object ou null se inválido
 * 
 * @example
 * parseFlexibleDate('25/12/2024 14:30:00') // Date
 * parseFlexibleDate(1735140600000) // Date
 * parseFlexibleDate(new Date()) // Date
 */
export function parseFlexibleDate(value: any): Date | null {
  if (!value) return null;
  
  // Já é Date
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  // É timestamp numérico
  if (typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // É string
  if (typeof value === 'string') {
    // Tenta formato brasileiro: dd/mm/yyyy HH:mm:ss
    const brFormat = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    
    if (brFormat) {
      const day = Number(brFormat[1]);
      const month = Number(brFormat[2]) - 1; // JS months são 0-indexed
      const year = Number(brFormat[3].length === 2 ? `20${brFormat[3]}` : brFormat[3]);
      const hour = Number(brFormat[4]);
      const minute = Number(brFormat[5]);
      const second = Number(brFormat[6] || 0);
      
      return new Date(year, month, day, hour, minute, second);
    }
    
    // Tenta parse genérico (ISO, etc)
    const genericDate = new Date(value);
    return isNaN(genericDate.getTime()) ? null : genericDate;
  }
  
  return null;
}

/**
 * Formata data de volta para string no formato original
 * 
 * Se o valor original era string, retorna string no formato brasileiro
 * Se era Date/number, retorna Date object
 * 
 * @param date - Data a ser formatada
 * @param original - Valor original para detectar tipo
 * @returns String formatada ou Date object
 * 
 * @example
 * formatDateToOriginal(new Date(), '25/12/2024 14:30:00')
 * // '25/12/2024 14:30:00'
 */
export function formatDateToOriginal(date: Date, original: any): any {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  
  const formattedString = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  
  // Se original era string, retorna string
  if (typeof original === 'string') {
    return formattedString;
  }
  
  // Senão retorna Date
  return date;
}

/**
 * Define horário específico em uma data
 * 
 * Cria nova instância de Date com o horário alterado,
 * preservando dia/mês/ano originais
 * 
 * @param date - Data base
 * @param hour - Hora (0-23)
 * @param minute - Minuto (0-59)
 * @returns Nova instância de Date com horário ajustado
 * 
 * @example
 * const date = new Date('2024-12-25T14:30:00');
 * setTimeOnDate(date, 7, 0) // 2024-12-25T07:00:00
 */
export function setTimeOnDate(date: Date, hour: number, minute: number): Date {
  const newDate = new Date(date);
  newDate.setHours(hour, minute, 0, 0);
  return newDate;
}

/**
 * Verifica se um horário está dentro de um range
 * 
 * @param date - Data a verificar
 * @param start - Horário inicial do range
 * @param end - Horário final do range
 * @returns true se está no range, false caso contrário
 * 
 * @example
 * const date = new Date('2024-12-25T07:30:00');
 * isTimeInRange(date, { hour: 5, minute: 30 }, { hour: 8, minute: 30 })
 * // true
 */
export function isTimeInRange(date: Date, start: Time, end: Time): boolean {
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

/**
 * Converte Date para minutos desde meia-noite
 * 
 * @param date - Data a converter
 * @returns Número de minutos desde 00:00
 * 
 * @example
 * dateToMinutes(new Date('2024-12-25T07:30:00')) // 450
 */
export function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Adiciona dias a uma data
 * 
 * @param date - Data base
 * @param days - Número de dias a adicionar (pode ser negativo)
 * @returns Nova instância de Date
 * 
 * @example
 * addDays(new Date('2024-12-25'), 1) // 2024-12-26
 * addDays(new Date('2024-12-25'), -1) // 2024-12-24
 */
export function addDays(date: Date, days: number): Date {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}

/**
 * Verifica se duas datas são do mesmo dia
 * 
 * @param date1 - Primeira data
 * @param date2 - Segunda data
 * @returns true se são do mesmo dia
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

/**
 * Retorna apenas a parte de data (sem hora)
 * 
 * @param date - Data a processar
 * @returns Nova Date com hora zerada (00:00:00)
 */
export function getDateOnly(date: Date): Date {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}

