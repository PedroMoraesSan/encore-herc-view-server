# 🤖 Configuração do Anthropic Claude

Este guia explica como configurar e usar o Anthropic Claude como provider de IA alternativo ao Groq e OpenAI.

## 📋 Pré-requisitos

1. Conta na Anthropic: https://console.anthropic.com/
2. Créditos disponíveis na conta
3. API Key gerada

## 🔑 Obter API Key

1. Acesse: https://console.anthropic.com/settings/keys
2. Clique em **"Create Key"**
3. Dê um nome descritivo (ex: "HERC Development")
4. Copie a chave gerada (ela só será mostrada uma vez!)

## ⚙️ Configurar no Encore

### Ambiente de Desenvolvimento

```bash
cd herc-view-server
encore secret set --dev AnthropicKey
# Cole sua API key quando solicitado
```

### Ambiente de Produção

```bash
encore secret set --prod AnthropicKey
# Cole sua API key de produção
```

### Verificar Configuração

```bash
encore secret list
```

Você deve ver `AnthropicKey` listado.

## 🚀 Instalar Dependências

```bash
npm install
```

Isso instalará o SDK `@anthropic-ai/sdk` que foi adicionado ao `package.json`.

## 🧪 Como Testar

### Opção 1: Mudar o Provider Padrão

Edite `file/processing.ts` linha 33:

```typescript
const DEFAULT_PROVIDER: AIProvider = 'anthropic'; // Era 'groq'
```

Agora todos os processamentos usarão Claude automaticamente.

### Opção 2: Testar Pontualmente (Futuro)

No futuro, você poderá passar o provider via API:

```typescript
// No frontend (futuro)
await processExcelFile(file, customPrompt, 'anthropic');
```

## 📊 Modelos Disponíveis

O sistema está configurado para usar **Claude 3.5 Sonnet** por padrão, que é o modelo mais recente e poderoso.

Modelos disponíveis (em `file/anthropic.ts`):

```typescript
CLAUDE_3_5_SONNET: 'claude-3-5-sonnet-20240620'  // ⭐ Padrão - Melhor qualidade
CLAUDE_3_OPUS: 'claude-3-opus-20240229'          // Máxima inteligência
CLAUDE_3_SONNET: 'claude-3-sonnet-20240229'      // Balanceado
CLAUDE_3_HAIKU: 'claude-3-haiku-20240307'        // Rápido e econômico
```

Para mudar o modelo, edite `file/anthropic.ts` linha 42:

```typescript
const DEFAULT_MODEL = ANTHROPIC_MODELS.CLAUDE_3_5_SONNET;
```

## 💰 Custos Estimados

### Claude 3.5 Sonnet (Recomendado)
- **Input**: $3.00 / 1M tokens
- **Output**: $15.00 / 1M tokens

### Exemplo Prático
Para um arquivo com **100 registros**:
- Input: ~5K tokens = $0.015
- Output: ~3K tokens = $0.045
- **Total**: ~$0.06 por arquivo

### Claude 3.5 Haiku (Econômico)
- **Input**: $1.00 / 1M tokens
- **Output**: $5.00 / 1M tokens
- ~3x mais barato que Sonnet

## 🔍 Comparação de Providers

| Provider | Velocidade | Qualidade | Custo/100 reg | Melhor Para |
|----------|-----------|-----------|---------------|-------------|
| **Groq** | ⚡⚡⚡⚡⚡ | ⭐⭐⭐ | $0.01 | Arquivos grandes, velocidade |
| **Claude** | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | $0.06 | Máxima precisão, dados críticos |
| **GPT-4o** | ⚡⚡⚡ | ⭐⭐⭐⭐ | $0.04 | Balanceado |

## ✅ Vantagens do Claude

1. **Precisão Superior**: Melhor compreensão de regras complexas
2. **Menos Erros**: Menor taxa de alucinação em dados estruturados
3. **JSON Confiável**: Produz JSON válido com mais consistência
4. **Contexto Grande**: Suporta até 200K tokens (vs 128K do GPT-4)
5. **Instruções Complexas**: Excelente em seguir regras detalhadas

## ⚠️ Limitações

1. **Custo**: ~3x mais caro que GPT-4o, ~15x mais que Groq
2. **Velocidade**: Mais lento que Groq (similar ao GPT-4o)
3. **Rate Limits**: 
   - Tier 1: 50 requests/min, 40K tokens/min
   - Tier 2: 1000 requests/min, 80K tokens/min

## 🐛 Troubleshooting

### Erro: "Anthropic API Key não configurada"

```bash
# Verifique se a secret está configurada
encore secret list

# Se não estiver, configure:
encore secret set --dev AnthropicKey
```

### Erro: "401 Unauthorized"

- API Key inválida ou expirada
- Gere uma nova key em: https://console.anthropic.com/settings/keys

### Erro: "402 Payment Required"

- Sem créditos na conta
- Adicione créditos em: https://console.anthropic.com/settings/billing

### Erro: "429 Rate Limit"

- Muitas requisições em pouco tempo
- O sistema já tem retry automático configurado
- Aguarde alguns segundos e tente novamente

### Erro: "529 Overloaded"

- API temporariamente sobrecarregada
- Sistema fará retry automaticamente
- Geralmente resolve em 10-30 segundos

## 📝 Logs

Os logs do Claude seguem o mesmo padrão dos outros providers:

```json
{
  "level": "info",
  "service": "ai-processing",
  "event": "ai_model_used",
  "provider": "Anthropic",
  "model": "claude-3-5-sonnet-20241022"
}
```

## 🔄 Voltar para Groq

Se quiser voltar a usar Groq:

1. Edite `file/processing.ts` linha 33:
```typescript
const DEFAULT_PROVIDER: AIProvider = 'groq';
```

2. Reinicie o servidor:
```bash
encore run
```

## 📚 Documentação Oficial

- API Reference: https://docs.anthropic.com/claude/reference
- Pricing: https://www.anthropic.com/pricing
- Console: https://console.anthropic.com/

## 💡 Dicas de Uso

1. **Use Claude para arquivos críticos**: Quando a precisão é mais importante que velocidade
2. **Use Groq para volume**: Quando precisa processar muitos arquivos rapidamente
3. **Teste ambos**: Compare a qualidade dos resultados com seus dados reais
4. **Monitore custos**: Acompanhe o uso em https://console.anthropic.com/settings/usage

## 🎯 Próximos Passos

1. Configure a API key
2. Instale as dependências (`npm install`)
3. Mude o provider padrão para `'anthropic'`
4. Teste com um arquivo pequeno primeiro
5. Compare os resultados com Groq
6. Ajuste o modelo se necessário (Sonnet vs Haiku)

---

**Pronto!** 🎉 Agora você pode usar o Claude para processamento de dados com máxima qualidade.

