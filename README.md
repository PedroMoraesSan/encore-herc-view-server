# HERC View Server - Backend API

Sistema de processamento de planilhas de eventos de alarme com IA (Groq e OpenAI).

## 🚀 Tecnologias

- **[Encore.ts](https://encore.dev)** - Framework de microserviços
- **TypeScript** - Linguagem de programação
- **PostgreSQL** - Banco de dados (gerenciado pelo Encore)
- **Groq (Llama 3.3-70b)** - IA principal para processamento (6x mais rápida, 96% mais barata)
- **OpenAI (GPT-4o)** - IA alternativa para processamento
- **XLSX** - Biblioteca de manipulação de planilhas
- **Zod** - Validação de dados com schemas

## 📦 Instalação

### 1. Instale o Encore CLI:

```bash
curl -L https://encore.dev/install.sh | bash
```

### 2. Clone o repositório e navegue até o backend:

```bash
cd herc-view-server
```

### 3. Instale as dependências:

```bash
npm install
```

### 4. Configure as variáveis de ambiente:

Crie um arquivo `.env` na raiz do projeto:

```env
# API Keys
GROQ_API_KEY=sua_chave_groq_aqui
OPENAI_API_KEY=sua_chave_openai_aqui (opcional)

# Database (Encore gerencia automaticamente)
# Não é necessário configurar manualmente
```

**Obtenha sua chave Groq gratuitamente:**
1. Acesse [console.groq.com](https://console.groq.com)
2. Crie uma conta
3. Gere uma API Key gratuita (rate limit: ~30 req/min)

### 5. Inicie o servidor:

```bash
encore run
```

O servidor estará disponível em:
- **API**: `http://localhost:4000`
- **Dashboard Encore**: `http://localhost:9400`

## 🏗️ Arquitetura

### Serviços (Microservices)

```
herc-view-server/
├── file/              # Serviço de upload e processamento de arquivos
│   ├── file.ts           # API endpoints principais
│   ├── processing.ts     # Lógica de processamento de dados
│   ├── normalization.ts  # Normalização de datas e horários
│   ├── groq.ts           # Integração com Groq AI
│   ├── openai.ts         # Integração com OpenAI
│   └── excel.ts          # Manipulação de arquivos Excel
├── history/           # Serviço de histórico de processamentos
│   └── history.ts        # API e gerenciamento do histórico
├── shared/            # Módulos compartilhados
│   ├── types.ts          # Tipos TypeScript
│   ├── prompts.ts        # Prompts de IA centralizados
│   ├── business-rules.ts # Regras de negócio centralizadas
│   ├── schemas.ts        # Schemas de validação (Zod)
│   ├── sanitization.ts   # Sanitização de dados
│   ├── ai-response-parser.ts # Parser de respostas da IA
│   ├── date-utils.ts     # Utilitários de data
│   ├── retry-utils.ts    # Retry com backoff exponencial
│   └── logger.ts         # Logging estruturado (Encore)
└── encore.app         # Configuração do Encore
```

### Endpoints da API

#### Serviço de Arquivos (`/file`)

- **POST `/file/upload`**: Upload e processamento de arquivo Excel
  - Aceita JSON ou base64
  - Valida estrutura e formato
  - Processa com IA (Groq ou OpenAI)
  - Retorna dados transformados

- **POST `/file/validate`**: Valida arquivo Excel sem processar
  - Verifica formato
  - Valida estrutura dos dados
  - Retorna status e warnings

#### Serviço de Histórico (`/history`)

- **GET `/history/list`**: Lista histórico de processamentos
  - Paginação configurável
  - Filtragem por status
  - Ordenação por data

- **GET `/history/:id`**: Obtém detalhes de um processamento específico

- **GET `/history/stats`**: Estatísticas gerais
  - Total de processamentos
  - Taxa de sucesso
  - Estatísticas por provedor de IA

#### Health Check

- **GET `/file/health`**: Verifica status do servidor

## 🧩 Principais Features

### 1. Processamento de Dados de Alarme

- Transforma eventos individuais de alarme em relatório consolidado
- Agrupa eventos por filial e data
- Normaliza horários de abertura/fechamento
- Replica dados faltantes do dia anterior

### 2. Integração com IA

- **Groq (Principal)**: Processamento rápido e econômico
- **OpenAI (Fallback)**: Alternativa confiável
- Rate limiting inteligente para evitar erros 429
- Retry automático com backoff exponencial

### 3. Validação Robusta

- Schemas Zod para validação de entrada e saída
- Validação de estrutura de dados
- Sanitização automática de valores
- Logs detalhados de validação

### 4. Observabilidade

- Logging estruturado com contexto
- Métricas de processamento
- Rastreamento de tempo de execução
- Dashboard de desenvolvimento do Encore

### 5. Histórico e Auditoria

- Registro completo de todos os processamentos
- Estatísticas de uso
- Rastreamento de erros
- Armazenamento seguro no PostgreSQL

## 🔧 Desenvolvimento

### Executar em desenvolvimento:

```bash
encore run
```

### Executar testes:

```bash
encore test
```

### Build para produção:

```bash
encore build
```

### Deploy:

```bash
git add .
git commit -m "Deploy message"
git push encore
```

Acesse o [Cloud Dashboard](https://app.encore.dev) para gerenciar seus deploys.

## 📝 Regras de Negócio

### Eventos de Alarme

- **Código 1401 (DESARMADO)**: Abertura da loja
- **Código 3401 (ARMADO)**: Fechamento da loja

### Horários Esperados

**Abertura:**
- Range: 05:30 - 08:30
- Padrão: 07:00

**Fechamento:**
- Mesmo dia: 22:30 - 23:59
- Dia seguinte: 00:00 - 01:30
- Padrão: 22:30 ou 00:30

### Transformação de Dados

**Entrada:**
```
Empresa, Conta, Data de recebimento, Código do evento, Descrição, ...
```

**Saída:**
```
FILIAL, UF, ABERTURA, FECHAMENTO, OPERADOR(A) ABERTURA, OPERADOR(A) FECHAMENTO
```

## 📚 Documentação Adicional

- **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)**: Guia de desenvolvimento
- **[REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)**: Resumo da refatoração (Fase 1)
- **[IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md)**: Melhorias implementadas (Fase 2)
- **[NEXT_IMPROVEMENTS.md](./NEXT_IMPROVEMENTS.md)**: Roadmap de melhorias futuras

## 🤝 Contribuindo

1. Clone o repositório
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto é proprietário da HERC Segurança.

---

**Desenvolvido com [Encore.ts](https://encore.dev)** 🚀
