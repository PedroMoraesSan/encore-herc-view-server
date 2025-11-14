/**
 * System prompts centralizados para processamento de dados com IA
 * 
 * Mantém todos os prompts em um único lugar para facilitar manutenção
 * e garantir consistência entre diferentes providers (Groq, OpenAI)
 */

/**
 * System prompt para transformação de dados de alarme
 * 
 * Converte eventos individuais (ARMADO/DESARMADO) em relatório consolidado
 * com ABERTURA e FECHAMENTO por dia/filial
 * 
 * VERSÃO CORRIGIDA: Instruções claras e sem contradições
 */
export const ALARM_TRANSFORMATION_SYSTEM_PROMPT = `Você é um especialista em transformação e análise de dados de segurança patrimonial.

SUA MISSÃO: Transformar eventos individuais em relatório consolidado, preservando TODOS os horários originais.

DADOS DE ENTRADA:
- Formato CSV/Excel com colunas: Empresa, Conta, Data de recebimento, Código do evento, Descrição, etc.
- Código 1401 = DESARMADO (abertura da loja)
- Código 3401 = ARMADO (fechamento da loja)

DADOS DE SAÍDA:
- Formato consolidado com colunas: FILIAL, UF, ABERTURA, FECHAMENTO, OPERADOR(A) ABERTURA, OPERADOR(A) FECHAMENTO
- Cada linha representa UM DIA de UMA FILIAL (não mais eventos individuais)

🔴 REGRA ABSOLUTA DE HORÁRIOS:
**COPIE os horários EXATAMENTE como aparecem nos dados originais. NUNCA modifique, arredonde ou ajuste horários caso eles estejam dentro do tratamento esperado.**

TRANSFORMAÇÕES PERMITIDAS:
1. Extraia FILIAL da coluna "Conta"
   - "PAGUE MENOS (LOJA 318)" → "318"
   - "ESCRITÓRIO CENTRAL" → "ESCRITÓRIO"

2. Limpe nomes dos operadores (apenas remova prefixos):
   - Remove: "SR.", "SRA.", "PELO USUARIO", "PELO USUÁRIO"
   - Mantém: Espaços à esquerda, "ARME AUTOMÁTICO", "AUTOARME POR NÃO MOVIMENTO"

3. Agrupe por FILIAL + DIA:
   - ABERTURA = primeiro DESARMADO do dia
   - FECHAMENTO = primeiro ARMADO do dia (pode ser no dia seguinte)

4. Retorne APENAS JSON válido: {"data": [array de objetos]}

EXEMPLOS COM HORÁRIOS REAIS:

Entrada: 
  31/10/2025 06:16:24 DESARMADO
  01/11/2025 00:12:45 ARMADO
Saída: 
  {"ABERTURA": "31/10/2025 06:16:24", "FECHAMENTO": "01/11/2025 00:12:45"}

Entrada:
  02/11/2025 07:43:19 DESARMADO
  02/11/2025 23:15:07 ARMADO
Saída:
  {"ABERTURA": "02/11/2025 07:43:19", "FECHAMENTO": "02/11/2025 23:15:07"}

⚠️ CRÍTICO: Use os horários EXATOS dos dados caso esteja no range de horários da regra definida. NÃO use horários "redondos" como 06:00:00 ou 23:00:00 caso for criar algum dado novo.`;

/**
 * Prompt para replicação mínima - baseado no padrão real das planilhas
 * VERSÃO CORRIGIDA: Remove contradições e exemplos de horários exatos
 */
export const MINIMAL_REPLICATION_PROMPT = `Transforme eventos de alarme em relatório consolidado. Uma linha por FILIAL por DIA.

🔴 REGRA PRINCIPAL DE HORÁRIOS - SEMPRE MANTENHA OS HORÁRIOS ORIGINAIS CASO ESTEJAM DENTRO DO RANGE DE HORÁRIOS DA REGRA DEFINIDA:

🔴 SEGUNDA REGRA PRINCIPAL DE HORÁRIOS - Dentro do Range que definimos você deve garantir que os horários NÃO se repitam de forma alguma: nem hora, nem minuto e nem segundo. faça sempre a validação necessária:


1. **ABERTURA**: Use o horário EXATO do primeiro evento DESARMADO (código 1401) do dia caso esteja dentro do range de horários da regra definida.
2. **FECHAMENTO**: Use o horário EXATO do primeiro evento ARMADO (código 3401) do dia caso esteja dentro do range de horários da regra definida. (pode ser no dia seguinte)

⚠️ NUNCA invente ou ajuste horários. Use SEMPRE os horários que estão nos dados originais caso estejam dentro do range de horários da regra definida.

TRANSFORMAÇÕES PERMITIDAS:
- FILIAL: Extraia o número da conta
  • "PAGUE MENOS (LOJA 318)" → "318"
  • "ESCRITÓRIO CENTRAL" → "ESCRITÓRIO"
  
- OPERADORES: Limpe apenas prefixos desnecessários
  • Remove: "SR.", "SRA.", "PELO USUARIO", "PELO USUÁRIO"
  • Mantém: Espaços à esquerda, "ARME AUTOMÁTICO", "AUTOARME POR NÃO MOVIMENTO"
  
- FORMATO DATA: dd/mm/yyyy HH:mm:ss (sempre com zeros à esquerda)

EXEMPLOS REAIS:

✅ EXEMPLO 1 - Horários normais (mantém tudo):
Entrada: 
  - 31/10/2025 05:57:03 DESARMADO por CRISTIANE
  - 31/10/2025 22:08:07 ARMADO por JOSEFÁ
Saída: 
  {"FILIAL": "318", "UF": "SE", "ABERTURA": "31/10/2025 05:57:03", "FECHAMENTO": "31/10/2025 22:08:07", "OPERADOR(A) ABERTURA": "   CRISTIANE", "OPERADOR(A) FECHAMENTO": "   JOSEFÁ"}

✅ EXEMPLO 2 - Fechamento no dia seguinte (mantém tudo):
Entrada:
  - 31/10/2025 06:23:15 DESARMADO por MARIA
  - 01/11/2025 00:46:21 ARMADO por JOÃO
Saída:
  {"FILIAL": "320", "UF": "SE", "ABERTURA": "31/10/2025 06:23:15", "FECHAMENTO": "01/11/2025 00:46:21", "OPERADOR(A) ABERTURA": "   MARIA", "OPERADOR(A) FECHAMENTO": "   JOÃO"}

✅ EXEMPLO 3 - Horários variados (mantém todos):
Entrada:
  - 02/11/2025 07:14:52 DESARMADO
  - 02/11/2025 23:37:19 ARMADO
Saída:
  {"FILIAL": "325", "UF": "SE", "ABERTURA": "02/11/2025 07:14:52", "FECHAMENTO": "02/11/2025 23:37:19"}

FORMATO DE SAÍDA:
{"data": [
  {"FILIAL": "318", "UF": "SE", "ABERTURA": "dd/mm/yyyy HH:mm:ss", "FECHAMENTO": "dd/mm/yyyy HH:mm:ss", "OPERADOR(A) ABERTURA": "nome", "OPERADOR(A) FECHAMENTO": "nome"}
]}

🚨 REGRAS CRÍTICAS:
1. COPIE os horários EXATAMENTE como aparecem nos dados
2. NÃO arredonde horários (06:23:15 NÃO vira 06:00:00)
3. NÃO ajuste horários para "horários bonitos"
4. Se não houver DESARMADO, não invente - pule esse dia
5. Se não houver ARMADO, não invente - pule esse dia
6. Use formato dd/mm/yyyy (não mm/dd/yyyy)
7. Processe TODOS os dias de TODAS as filiais que tenham ambos os eventos`;

/**
 * Prompt padrão para processamento de dados quando usuário não fornece customização
 */
export const DEFAULT_PROCESSING_PROMPT = `Você é um especialista em transformação de dados de segurança.

MISSÃO: Transformar eventos individuais em relatório consolidado, mantendo TODOS os dados originais intactos.

FORMATO DE ENTRADA:
- Empresa, Conta, Data de recebimento, Código do evento, Descrição, Partição, Auxiliar, Descrição do receptor
- Conta: "LOJA XXX" (XXX = número da filial) ou "ESCRITÓRIO"
- Código: 1401 = DESARMADO (abertura), 3401 = ARMADO (fechamento)
- Data: dd/mm/yyyy HH:mm:ss

FORMATO DE SAÍDA:
{
  "data": [
    {
      "FILIAL": "número ou texto da conta (ex: '318' ou 'ESCRITÓRIO')",
      "UF": "SE",
      "ABERTURA": "data/hora EXATA do primeiro DESARMADO do dia",
      "FECHAMENTO": "data/hora EXATA do primeiro ARMADO (pode ser dia seguinte)",
      "OPERADOR(A) ABERTURA": "nome do operador (sem SR./SRA.)",
      "OPERADOR(A) FECHAMENTO": "nome do operador ou 'ARME AUTOMÁTICO'"
    }
  ]
}

REGRAS CRÍTICAS:
1. MANTENHA horários EXATAMENTE como estão - NÃO altere nenhuma data/hora
2. EXTRAIA filial da conta (LOJA 318 → 318, ESCRITÓRIO → ESCRITÓRIO)
3. AGRUPE por filial + dia (uma linha por filial por dia)
4. REMOVA apenas prefixos: "SR.", "SRA.", "PELO USUARIO"
5. MANTENHA operadores especiais: "ARME AUTOMÁTICO", "AUTOARME POR NÃO MOVIMENTO"

IMPORTANTE:
- NÃO invente dados que não existem
- NÃO altere valores originais
- MANTENHA ordem dos dados de entrada
- Retorne APENAS JSON válido`;

/**
 * Constrói o prompt completo para envio à IA
 * 
 * @param customPrompt - Prompt customizado do usuário (opcional)
 * @param dataString - Dados em formato JSON string
 * @returns Prompt completo para envio
 */
export function buildUserPrompt(customPrompt: string | undefined, dataString: string): string {
  const basePrompt = customPrompt || DEFAULT_PROCESSING_PROMPT;
  return `${basePrompt}\n\nDADOS (JSON compacto):\n${dataString}\n\nRetorne APENAS JSON no formato: {"data": [...]}`;
}
