/**
 * Normalização de horários de abertura e fechamento
 * 
 * Refatorado de processing.ts para melhor manutenibilidade e testabilidade
 * Cada função tem responsabilidade única e pode ser testada isoladamente
 */

import { 
  parseFlexibleDate, 
  formatDateToOriginal, 
  setTimeOnDate,
  isTimeInRange,
  dateToMinutes,
  addDays,
} from '../shared/date-utils';
import { 
  BUSINESS_HOURS, 
  COLUMN_NAMES,
  isOpeningDescription,
  isClosingDescription,
} from '../shared/business-rules';

/**
 * Encontra a chave de um campo em um objeto baseado em candidatos
 * 
 * Busca case-insensitive por nomes de colunas que contenham qualquer
 * das strings candidatas
 * 
 * @param obj - Objeto a buscar
 * @param candidates - Lista de strings candidatas
 * @returns Nome da chave encontrada ou null
 */
function findFieldKey(obj: any, candidates: readonly string[]): string | null {
  const keys = Object.keys(obj);
  const found = keys.find(k => 
    candidates.some(c => k.toLowerCase().includes(c.toLowerCase()))
  );
  return found || null;
}

/**
 * Normaliza horário de abertura (desarmamento)
 * 
 * Se o horário estiver fora do range esperado (05:30 - 08:30),
 * ajusta para o horário padrão (07:00)
 * 
 * @param date - Data/hora do evento de abertura
 * @returns Data ajustada ou null se não precisa ajustar
 */
export function normalizeOpeningTime(date: Date): Date | null {
  const { start, end, default: defaultTime } = BUSINESS_HOURS.OPENING;
  
  // Se está no range esperado, não ajusta
  if (isTimeInRange(date, start, end)) {
    return null;
  }
  
  // Ajusta para horário padrão
  return setTimeOnDate(date, defaultTime.hour, defaultTime.minute);
}

/**
 * Normaliza horário de fechamento (armamento)
 * 
 * Horários esperados:
 * - Mesmo dia: 22:30 - 23:59
 * - Dia seguinte: 00:00 - 01:30
 * 
 * Se fora desses ranges:
 * - Antes do meio-dia: ajusta para 00:30 do dia seguinte
 * - Após meio-dia: ajusta para 22:30 do mesmo dia
 * 
 * @param date - Data/hora do evento de fechamento
 * @returns Data ajustada ou null se não precisa ajustar
 */
export function normalizeClosingTime(date: Date): Date | null {
  const { sameDay, nextDay, defaultSameDay, defaultNextDay } = BUSINESS_HOURS.CLOSING;
  
  const minutes = dateToMinutes(date);
  const sameDayMinutes = sameDay.hour * 60 + sameDay.minute;
  const nextDayMinutes = nextDay.hour * 60 + nextDay.minute;
  
  // Verifica se está nos ranges esperados
  const isInSameDayRange = minutes >= sameDayMinutes; // >= 22:30
  const isInNextDayRange = minutes <= nextDayMinutes; // <= 01:30
  
  // Se está em um dos ranges esperados, não ajusta
  if (isInSameDayRange || isInNextDayRange) {
    return null;
  }
  
  // Fora do range - precisa ajustar
  if (date.getHours() < 12) {
    // Antes do meio-dia -> considera dia seguinte
    const nextDay = addDays(date, 1);
    return setTimeOnDate(nextDay, defaultNextDay.hour, defaultNextDay.minute);
  } else {
    // Após meio-dia -> mesmo dia à noite
    return setTimeOnDate(date, defaultSameDay.hour, defaultSameDay.minute);
  }
}

/**
 * Normaliza um único registro de horário
 * 
 * Identifica se é abertura ou fechamento pela descrição e
 * ajusta o horário se necessário
 * 
 * @param row - Registro a normalizar
 * @returns Registro com horário possivelmente ajustado
 */
export function normalizeRow(row: any): any {
  // Encontrar campos de descrição e data
  const descKey = findFieldKey(row, COLUMN_NAMES.DESCRIPTION);
  const dateKey = findFieldKey(row, COLUMN_NAMES.DATETIME);
  
  // Se não tem campo de data, retorna sem modificar
  if (!dateKey) {
    return row;
  }
  
  // Parse da data
  const original = row[dateKey];
  const date = parseFlexibleDate(original);
  
  // Se não conseguiu parsear, retorna sem modificar
  if (!date) {
    return row;
  }
  
  // Pegar descrição
  const description: string = (descKey ? String(row[descKey]) : '');
  
  // Determinar tipo de evento e normalizar
  let adjustedDate: Date | null = null;
  
  if (isOpeningDescription(description)) {
    adjustedDate = normalizeOpeningTime(date);
  } else if (isClosingDescription(description)) {
    adjustedDate = normalizeClosingTime(date);
  }
  
  // Se houve ajuste, atualizar o registro
  if (adjustedDate) {
    row[dateKey] = formatDateToOriginal(adjustedDate, original);
  }
  
  return row;
}

/**
 * Normaliza horários de ABERTURA/FECHAMENTO em array de dados
 * 
 * Função principal que processa todos os registros aplicando
 * as regras de normalização de horários de negócio
 * 
 * @param rows - Array de registros a normalizar
 * @returns Array com registros normalizados
 * 
 * @example
 * const data = [
 *   { 'Data de recebimento': '25/12/2024 04:30:00', 'Descrição': 'DESARMADO' }
 * ];
 * normalizeOpenCloseTimes(data);
 * // [{ 'Data de recebimento': '25/12/2024 07:00:00', 'Descrição': 'DESARMADO' }]
 */
export function normalizeOpenCloseTimes(rows: any[]): any[] {
  return rows.map(row => normalizeRow(row));
}

