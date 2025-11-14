# ⚡ Quick Start: Testar Anthropic Claude

## 🚀 Passos Rápidos (5 minutos)

### 1️⃣ Instalar Dependências
```bash
cd herc-view-server
npm install
```

### 2️⃣ Configurar API Key
```bash
encore secret set --dev AnthropicKey
# Cole sua key de: https://console.anthropic.com/settings/keys
```

### 3️⃣ Ativar Claude como Padrão

Edite `file/processing.ts` na **linha 33**:

**ANTES:**
```typescript
const DEFAULT_PROVIDER: AIProvider = 'groq';
```

**DEPOIS:**
```typescript
const DEFAULT_PROVIDER: AIProvider = 'anthropic';
```

### 4️⃣ Testar

```bash
# Terminal 1 - Backend
encore run

# Terminal 2 - Frontend (em outra aba)
cd ../frontend
npm run dev
```

Acesse http://localhost:5173 e faça upload de um arquivo Excel pequeno (10-50 registros) para testar.

---

## 🔄 Alternar Entre Providers

### Usar Claude (Máxima Qualidade)
```typescript
const DEFAULT_PROVIDER: AIProvider = 'anthropic';
```

### Usar Groq (Máxima Velocidade)
```typescript
const DEFAULT_PROVIDER: AIProvider = 'groq';
```

### Usar OpenAI (Balanceado)
```typescript
const DEFAULT_PROVIDER: AIProvider = 'openai';
```

**Sempre reinicie o servidor após mudar!**

---

## 💡 Dica: Teste Comparativo

1. Processe um arquivo com Groq
2. Mude para `'anthropic'` e reinicie
3. Processe o MESMO arquivo
4. Compare os resultados

Veja qual produz dados mais precisos para seu caso de uso!

---

## 📊 Custos Aproximados

| Arquivo | Groq | Claude | Diferença |
|---------|------|--------|-----------|
| 50 reg  | $0.005 | $0.03 | 6x |
| 100 reg | $0.01 | $0.06 | 6x |
| 500 reg | $0.05 | $0.30 | 6x |

**Claude é ~6x mais caro, mas pode valer pela qualidade!**

---

## ❓ Problemas?

Veja o guia completo: `ANTHROPIC_SETUP.md`

