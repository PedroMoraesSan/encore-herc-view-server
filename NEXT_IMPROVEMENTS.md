# 🎯 Próximas Melhorias Prioritárias

## 📊 Status Atual

### ✅ Já Implementado (Fases 1 e 2)
- ✅ Eliminação de código duplicado (-350 linhas)
- ✅ Centralização de prompts e regras de negócio
- ✅ Parser unificado de IA
- ✅ Validação Zod criada e integrada nos endpoints
- ✅ Funções de sanitização compartilhadas
- ✅ **Refatoração de `normalizeOpenCloseTimes()` completa**
- ✅ **Retry utility com backoff exponencial criado**
- ✅ **Logger estruturado implementado em todos os serviços**
- ✅ **Validação Zod integrada nos endpoints da API**

---

## 🔴 CRÍTICO - Próxima Sprint

### 1. ~~**Refatorar `normalizeOpenCloseTimes()` - Alta Complexidade**~~ ✅ CONCLUÍDO

**Problema**: Função com 95 linhas, complexidade ciclomática ~12-15  
**Localização**: `file/processing.ts:17-110`  
**Impacto**: Difícil testar, manter e debugar

**Solução**: Quebrar em 6 funções menores:

```typescript
// shared/date-utils.ts ✨ NOVO
export function parseFlexibleDate(value: any): Date | null { }
export function formatDateToString(date: Date, original: any): string { }
export function setTimeOnDate(date: Date, hour: number, minute: number): Date { }
export function isTimeInRange(date: Date, start: Time, end: Time): boolean { }

// file/normalization.ts ✨ NOVO
export function normalizeOpeningTime(date: Date, description: string): Date | null { }
export function normalizeClosingTime(date: Date, description: string): Date | null { }
export function normalizeOpenCloseTimes(rows: any[]): any[] {
  // Orquestra as funções acima - fica com ~30 linhas
}
```

**Benefícios**:
- ✅ Cada função testável isoladamente
- ✅ Complexidade de ~3-4 por função
- ✅ Reutilizável em outros contextos
- ✅ Mais fácil de entender e manter

**Estimativa**: 3-4 horas

---

### 2. ~~**Extrair Lógica de Retry com Backoff Exponencial**~~ ✅ CONCLUÍDO

**Status**: Implementado em `shared/retry-utils.ts`  
**Resultado**: Código de retry centralizado, testável e reutilizável

**Solução**: Criar utility genérico

```typescript
// shared/retry-utils.ts ✨ NOVO
export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  retryableErrors?: RegExp;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let attempts = 0;
  
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempts++;
      const msg = error instanceof Error ? error.message : String(error);
      
      // Verificar se deve retentar
      const shouldRetry = attempts < options.maxRetries &&
        (!options.retryableErrors || options.retryableErrors.test(msg));
      
      if (!shouldRetry) {
        throw error;
      }
      
      // Backoff exponencial
      const delay = options.baseDelay * Math.pow(2, attempts - 1);
      
      if (options.onRetry) {
        options.onRetry(attempts, error as Error);
      }
      
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

**Uso**:
```typescript
// Em processing.ts
const result = await retryWithExponentialBackoff(
  () => processChunk(slice, i, total),
  {
    maxRetries: rateLimitConfig.maxRetries,
    baseDelay: rateLimitConfig.baseRetryDelay,
    retryableErrors: /429|rate limit|too large|TPM/i,
    onRetry: (attempt, error) => {
      console.warn(`⚠️  Tentativa ${attempt} falhou: ${error.message}`);
    }
  }
);
```

**Benefícios**:
- ✅ -40 linhas duplicadas
- ✅ Estratégia de retry centralizada
- ✅ Testável isoladamente
- ✅ Reutilizável em toda aplicação

**Estimativa**: 2 horas

---

### 3. ~~**Substituir `console.log` por Logger Estruturado**~~ ✅ CONCLUÍDO

**Status**: Implementado em `shared/logger.ts` e migrado em todos os serviços  
**Resultado**: Logs estruturados, categorizados e integrados com Encore

**Solução**: Usar Logger do Encore

```typescript
// shared/logger.ts ✨ NOVO
import { Logger } from 'encore.dev/observability';

export const logger = {
  file: new Logger('file-service'),
  history: new Logger('history-service'),
  health: new Logger('health-service'),
};

// Helpers
export function logDataSize(service: Logger, size: any, records: number) {
  service.info('data_received', {
    size_readable: size.readable,
    size_kb: size.kb,
    size_mb: size.mb,
    records,
  });
}

export function logProcessingTime(service: Logger, operation: string, timeMs: number) {
  service.info('processing_complete', {
    operation,
    duration_ms: timeMs,
    duration_s: (timeMs / 1000).toFixed(2),
  });
}
```

**Migração**:
```typescript
// ANTES
console.log(`📊 Tamanho dos dados: ${dataSize.readable} (${data.length} registros)`);

// DEPOIS
logger.file.info('data_received', {
  size: dataSize.readable,
  size_kb: dataSize.kb,
  records: data.length,
});
```

**Benefícios**:
- ✅ Logs estruturados (JSON)
- ✅ Filtráveis por nível e serviço
- ✅ Integração com observabilidade do Encore
- ✅ Melhor para produção

**Estimativa**: 3-4 horas (refatorar 62 ocorrências)

---

### 4. ~~**Adicionar Validação Zod nos Endpoints**~~ ✅ CONCLUÍDO

**Status**: Validação Zod integrada em `file/file.ts` (upload e validate)  
**Resultado**: Detecção precoce de problemas, erros mais claros para usuários

**Solução**: Validar entrada na API

```typescript
// file/file.ts
import { validateAlarmEvents, validateBasicStructure } from '../shared/schemas';

export const upload = api(
  // ...
  async (req: UploadRequest): Promise<UploadResponse> => {
    // ... código existente para obter rawData ...
    
    // ✨ NOVO: Validar estrutura dos dados
    if (!validateBasicStructure(rawData)) {
      throw APIError.invalidArgument('Estrutura de dados inválida');
    }
    
    // ✨ NOVO: Validação completa (opcional - pode ser lenta)
    const validation = validateAlarmEvents(rawData);
    if (!validation.success && validation.errors) {
      logger.file.warn('validation_warnings', {
        errors: validation.errors.slice(0, 5), // Primeiros 5 erros
        total_errors: validation.errors.length,
      });
      // Continua processamento com warning
    }
    
    // ... resto do código ...
  }
);
```

**Benefícios**:
- ✅ Detecta problemas antes de processar
- ✅ Erros mais claros para o usuário
- ✅ Menos falhas no meio do processamento
- ✅ Schemas documentam formato esperado

**Estimativa**: 1-2 horas

---

## 🟡 IMPORTANTE - Próximo Mês

### 5. **Implementar Lógica de Replicação de Dias Faltantes**

**Problema**: Regra existe no prompt mas não no código  
**Localização**: Apenas no prompt, linha 114 do `processing.ts`  
**Impacto**: Comportamento inconsistente, dependente da IA

**Solução**: Implementar pós-processamento

```typescript
// file/normalization.ts ✨ NOVO
export function replicateMissingDays(data: ProcessedReport[]): ProcessedReport[] {
  // Agrupar por filial
  const byFilial = groupBy(data, 'FILIAL');
  
  for (const [filial, records] of Object.entries(byFilial)) {
    // Ordenar por data
    const sorted = sortBy(records, 'DATA');
    
    // Para cada dia, verificar se tem abertura E fechamento
    for (let i = 0; i < sorted.length; i++) {
      const record = sorted[i];
      
      if (!record.ABERTURA || !record.FECHAMENTO) {
        // Replicar do dia anterior
        const previous = sorted[i - 1];
        if (previous) {
          record.ABERTURA = record.ABERTURA || previous.ABERTURA;
          record.FECHAMENTO = record.FECHAMENTO || previous.FECHAMENTO;
          record['OPERADOR(A) ABERTURA'] = record['OPERADOR(A) ABERTURA'] || previous['OPERADOR(A) ABERTURA'];
          record['OPERADOR(A) FECHAMENTO'] = record['OPERADOR(A) FECHAMENTO'] || previous['OPERADOR(A) FECHAMENTO'];
        }
      }
    }
  }
  
  return data;
}
```

**Estimativa**: 3 horas

---

### 6. **Adicionar Testes Unitários Críticos** 🧪

**Problema**: Cobertura de testes = 0%  
**Impacto**: Refatorações são arriscadas, bugs não detectados

**Prioridade de Testes**:

```typescript
// shared/__tests__/sanitization.test.ts
describe('sanitizeValue', () => {
  test('remove caracteres de controle', () => { });
  test('normaliza quebras de linha', () => { });
  test('escapa aspas', () => { });
});

// shared/__tests__/ai-response-parser.test.ts
describe('parseAIResponse', () => {
  test('parse JSON direto', () => { });
  test('parse JSON com markdown', () => { });
  test('parse JSON malformado com correção', () => { });
  test('extrai array de objeto com data', () => { });
});

// shared/__tests__/date-utils.test.ts (quando criar)
describe('parseFlexibleDate', () => {
  test('parse formato dd/mm/yyyy HH:mm:ss', () => { });
  test('parse Date object', () => { });
  test('parse number timestamp', () => { });
  test('retorna null para inválido', () => { });
});

// file/__tests__/normalization.test.ts (quando criar)
describe('normalizeOpeningTime', () => {
  test('ajusta horário fora do range', () => { });
  test('mantém horário dentro do range', () => { });
});
```

**Estimativa**: 8-10 horas (cobertura de 50-60%)

---

### 7. **Implementar Cache de Resultados**

**Problema**: Mesmo arquivo processado múltiplas vezes  
**Impacto**: Desperdício de recursos e tempo

**Solução**: Cache por hash de arquivo + prompt

```typescript
// shared/cache.ts ✨ NOVO
import { cache } from 'encore.dev/cache';

const processedCache = new cache.Cluster({
  name: 'processed-files',
  keyPattern: 'file::hash:{hash}::prompt:{promptHash}',
  evictionPolicy: 'allkeys-lru',
});

export async function getCachedResult(
  fileHash: string,
  promptHash: string
): Promise<Uint8Array | null> {
  const key = `file::hash:${fileHash}::prompt:${promptHash}`;
  return await processedCache.get(key);
}

export async function setCachedResult(
  fileHash: string,
  promptHash: string,
  result: Uint8Array
): Promise<void> {
  const key = `file::hash:${fileHash}::prompt:${promptHash}`;
  await processedCache.set(key, result, { expire: 3600 * 24 }); // 24h
}
```

**Estimativa**: 3-4 horas

---

## 🔵 DESEJÁVEL - Backlog

### 8. **Frontend: Implementar Estado Global com Zustand**

**Problema**: Estado local em `Home.tsx` (370 linhas)  
**Estimativa**: 4-6 horas

### 9. **Adicionar Métricas de Performance**

```typescript
// shared/metrics.ts ✨ NOVO
import { Metric } from 'encore.dev/metrics';

export const processingDuration = new Metric('processing_duration', {
  value: Metric.ValueType.GAUGE,
});

export const processingErrors = new Metric('processing_errors', {
  value: Metric.ValueType.COUNTER,
});
```

**Estimativa**: 2-3 horas

### 10. **Criar `.env.example` e Validação de Ambiente**

```bash
# .env.example
GROQ_API_KEY=your_groq_key_here
OPENAI_API_KEY=your_openai_key_here  # opcional
DATABASE_URL=postgresql://...         # auto por Encore
```

**Estimativa**: 1 hora

---

## 📅 Roadmap Sugerido

### ~~Sprint 1~~ ✅ CONCLUÍDO
1. ✅ Refatorar `normalizeOpenCloseTimes()` (3-4h)
2. ✅ Extrair retry utility (2h)
3. ✅ Substituir console.log por Logger (3-4h)
4. ✅ Adicionar validação Zod nos endpoints (1-2h)

### Sprint 2 (Próxima Semana) - 12-15h
5. ✅ Implementar replicação de dias faltantes (3h)
6. ✅ Adicionar testes unitários (8-10h)
7. ✅ Implementar cache de resultados (3-4h)

### Sprint 3 (Backlog)
8. Estado global no frontend
9. Métricas de performance
10. Validação de ambiente

---

## 🎯 Priorização por Impacto

| Melhoria | Impacto | Esforço | ROI | Prioridade |
|----------|---------|---------|-----|------------|
| Refatorar normalizeOpenCloseTimes | 🔴 Alto | Médio | ⭐⭐⭐⭐⭐ | 1 |
| Extrair retry utility | 🟡 Médio | Baixo | ⭐⭐⭐⭐⭐ | 2 |
| Logger estruturado | 🔴 Alto | Médio | ⭐⭐⭐⭐ | 3 |
| Validação Zod | 🟡 Médio | Baixo | ⭐⭐⭐⭐ | 4 |
| Testes unitários | 🔴 Alto | Alto | ⭐⭐⭐⭐ | 5 |
| Replicação de dias | 🟡 Médio | Médio | ⭐⭐⭐ | 6 |
| Cache | 🟢 Baixo | Médio | ⭐⭐⭐ | 7 |

---

## 💡 Recomendação

**Comece por**: 
1. Refatorar `normalizeOpenCloseTimes()` 
2. Extrair retry utility
3. Implementar Logger

Essas 3 melhorias eliminam os maiores problemas técnicos atuais e preparam terreno para os testes unitários.

**Tempo total estimado para resolver críticos**: ~10-12 horas  
**Débito técnico eliminado**: ~15-20 dias de trabalho futuro

