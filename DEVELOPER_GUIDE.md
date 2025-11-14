# 👨‍💻 Guia do Desenvolvedor - Código Refatorado

## 🎯 Como Usar os Novos Módulos Compartilhados

### 1. Alterando Prompts da IA

**Antes** (ruim - duplicado):
```typescript
// Em groq.ts e openai.ts - dois lugares diferentes!
const systemPrompt = `Você é um especialista...`
```

**Depois** (bom - centralizado):
```typescript
// Em shared/prompts.ts - um único lugar!
import { ALARM_TRANSFORMATION_SYSTEM_PROMPT } from '../shared/prompts';

// Usar em qualquer lugar
const systemPrompt = ALARM_TRANSFORMATION_SYSTEM_PROMPT;
```

**Para adicionar novo prompt:**
```typescript
// shared/prompts.ts
export const NOVO_PROMPT_TEMPLATE = `Seu novo prompt aqui...`;
```

---

### 2. Trabalhando com Regras de Negócio

**Antes** (ruim - hardcoded):
```typescript
const isAbertura = /ABERT|DESARM/.test(description);
if (!inRange(dt, 5, 30, 8, 30)) {
  adjusted = setTime(dt, 7, 0);
}
```

**Depois** (bom - usando constantes):
```typescript
import { 
  isOpeningDescription, 
  BUSINESS_HOURS 
} from '../shared/business-rules';

const isAbertura = isOpeningDescription(description);
const { start, end, default: defaultTime } = BUSINESS_HOURS.OPENING;
if (!inRange(dt, start.hour, start.minute, end.hour, end.minute)) {
  adjusted = setTime(dt, defaultTime.hour, defaultTime.minute);
}
```

**Para mudar horários de abertura:**
```typescript
// shared/business-rules.ts
export const BUSINESS_HOURS = {
  OPENING: {
    start: { hour: 6, minute: 0 },    // Era 5:30
    end: { hour: 9, minute: 0 },      // Era 8:30
    default: { hour: 7, minute: 30 }, // Era 7:00
  },
  // ...
}
```

---

### 3. Sanitizando Dados

**Antes** (ruim - lógica espalhada):
```typescript
const optimizedData = data.map(row => {
  const optimized: any = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined && value !== '') {
      optimized[key] = sanitizeValue(value);
    }
  }
  return optimized;
});
```

**Depois** (bom - função compartilhada):
```typescript
import { sanitizeDataArray, calculateDataSize } from '../shared/sanitization';

const optimizedData = sanitizeDataArray(data);
const dataSize = calculateDataSize(optimizedData);
console.log(`Tamanho: ${dataSize.readable}`);
```

---

### 4. Parseando Respostas da IA

**Antes** (ruim - 60 linhas duplicadas):
```typescript
export function parseGroqResponse(response: string): any[] {
  let cleanedResponse = response.trim();
  // ... 60 linhas de código complexo
}
```

**Depois** (bom - função compartilhada):
```typescript
import { parseAIResponse } from '../shared/ai-response-parser';

// Groq
const data = parseAIResponse(response, 'Groq');

// OpenAI
const data = parseAIResponse(response, 'OpenAI');

// Qualquer outro provider
const data = parseAIResponse(response, 'Claude');
```

---

### 5. Validando Dados com Zod

**Novo** (validação em runtime):
```typescript
import { validateAlarmEvents, validateProcessedReport } from '../shared/schemas';

// Validar entrada
const inputValidation = validateAlarmEvents(rawData);
if (!inputValidation.success) {
  console.error('Erros:', inputValidation.errors);
  throw new Error('Dados de entrada inválidos');
}

// Validar saída
const outputValidation = validateProcessedReport(processedData);
if (!outputValidation.success) {
  console.error('Erros:', outputValidation.errors);
  throw new Error('Dados processados inválidos');
}

// Usar dados validados (type-safe!)
const validatedData = inputValidation.data;
```

---

## 🛠️ Casos de Uso Comuns

### Adicionar Novo Provider de IA

```typescript
// 1. Criar arquivo: file/anthropic.ts
import { 
  ALARM_TRANSFORMATION_SYSTEM_PROMPT, 
  buildUserPrompt 
} from '../shared/prompts';
import { sanitizeDataArray } from '../shared/sanitization';
import { parseAIResponse } from '../shared/ai-response-parser';

export async function processDataWithAnthropic(
  data: ExcelRow[],
  prompt: string
): Promise<string> {
  const sanitizedData = sanitizeDataArray(data);
  const dataString = JSON.stringify(sanitizedData);
  
  // Chamar API Anthropic...
  const response = await anthropicClient.complete({
    prompt: ALARM_TRANSFORMATION_SYSTEM_PROMPT + buildUserPrompt(prompt, dataString),
    // ...
  });
  
  return response.completion;
}

// 2. Parse é automático!
const parsed = parseAIResponse(response, 'Anthropic');
```

### Alterar Código de Eventos

```typescript
// shared/business-rules.ts
export const EVENT_CODES = {
  DISARMED: 1401,  // Abertura
  ARMED: 3401,     // Fechamento
  PANIC: 1100,     // NOVO!
  FIRE: 1101,      // NOVO!
} as const;

// Usar em qualquer lugar
import { EVENT_CODES } from '../shared/business-rules';

if (code === EVENT_CODES.PANIC) {
  // Tratar pânico
}
```

### Ajustar Rate Limiting

```typescript
// shared/business-rules.ts
export const RATE_LIMIT_CONFIG = {
  GROQ: {
    minTimePerChunk: 1,        // Era 2 - mais rápido agora!
    minDelayBetweenChunks: 0.5, // Era 1
    maxRetries: 5,              // Era 3 - mais tentativas
    baseRetryDelay: 2000,       // Era 3000 - retry mais rápido
  },
  // ...
}
```

---

## 🐛 Debugging

### Log de Tamanho de Dados
```typescript
import { calculateDataSize } from '../shared/sanitization';

const size = calculateDataSize(myData);
console.log(`
  Bytes: ${size.bytes}
  KB: ${size.kb.toFixed(2)}
  MB: ${size.mb.toFixed(2)}
  Legível: ${size.readable}
`);
```

### Validar JSON Manualmente
```typescript
import { isValidJson, cleanJsonString } from '../shared/sanitization';

if (!isValidJson(response)) {
  const cleaned = cleanJsonString(response);
  console.log('JSON limpo:', cleaned);
}
```

### Extrair Filial
```typescript
import { extractFilialNumber } from '../shared/schemas';

const filial = extractFilialNumber('LOJA 318'); // '318'
const filial2 = extractFilialNumber('Loja 42'); // '42'
```

---

## ⚠️ Armadilhas Comuns

### ❌ NÃO FAÇA ISSO:
```typescript
// Hardcoding valores
const CHUNK_SIZE = 100;
const EVENT_CODE_DISARMED = 1401;
if (desc.includes('ABERT') || desc.includes('DESARM')) { }
```

### ✅ FAÇA ISSO:
```typescript
// Usar constantes compartilhadas
import { 
  PROCESSING_CONFIG, 
  EVENT_CODES,
  isOpeningDescription 
} from '../shared/business-rules';

const CHUNK_SIZE = PROCESSING_CONFIG.CHUNK_SIZE;
if (code === EVENT_CODES.DISARMED) { }
if (isOpeningDescription(desc)) { }
```

---

## 🧪 Testes (TODO)

**Exemplo de teste futuro:**
```typescript
// shared/__tests__/sanitization.test.ts
import { sanitizeValue, sanitizeDataArray } from '../sanitization';

describe('sanitizeValue', () => {
  it('remove caracteres de controle', () => {
    expect(sanitizeValue('Test\x00\x1F')).toBe('Test');
  });
  
  it('normaliza quebras de linha', () => {
    expect(sanitizeValue('Test\r\nValue')).toBe('Test Value');
  });
});
```

---

## 📖 Referência Rápida

### Imports Mais Usados

```typescript
// Prompts
import { 
  ALARM_TRANSFORMATION_SYSTEM_PROMPT,
  DEFAULT_PROCESSING_PROMPT,
  buildUserPrompt 
} from '../shared/prompts';

// Business Rules
import { 
  EVENT_CODES,
  BUSINESS_HOURS,
  PROCESSING_CONFIG,
  RATE_LIMIT_CONFIG,
  isOpeningDescription,
  isClosingDescription 
} from '../shared/business-rules';

// Sanitização
import { 
  sanitizeValue,
  sanitizeDataArray,
  calculateDataSize,
  cleanJsonString 
} from '../shared/sanitization';

// Parsing
import { 
  parseAIResponse,
  validateProcessedData 
} from '../shared/ai-response-parser';

// Validação
import { 
  validateAlarmEvents,
  validateProcessedReport,
  extractFilialNumber 
} from '../shared/schemas';
```

---

## 🚀 Performance Tips

1. **Use sanitizeDataArray** ao invés de loop manual - é otimizado
2. **calculateDataSize** é rápido - use para debugging sem medo
3. **parseAIResponse** tem fallbacks - não precisa try/catch extra
4. **validateAlarmEvents** adiciona overhead mínimo (~1-2ms) e vale a pena

---

## 📞 Suporte

Dúvidas sobre o código refatorado? Consulte:
- `REFACTORING_SUMMARY.md` - Resumo das mudanças
- `shared/*.ts` - Código comentado e documentado
- Cada função tem JSDoc explicando uso e exemplos

---

**Última atualização**: Refatoração de Novembro 2025  
**Autor**: Assistente de IA + Time de Desenvolvimento

