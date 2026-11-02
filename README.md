# Despensa e Preços

Controle pessoal das compras de supermercado:
- registra cada compra pela **foto do cupom** (a IA lê os itens e você confere) ou digitando;
- guarda o **histórico de preço** de cada item, por mercado, com o preço por kg, litro ou unidade;
- marca o que você **tem em casa** e monta a **lista de compras** com o custo estimado;
- **compara mercados**, mostrando onde cada item estava mais barato;
- fecha o **mês**: quanto gastou, quanto foi alimentação e quanto foi limpeza ou higiene, e os itens mais comprados;
- **exporta** para planilha (CSV que o Excel abre direto).

Login com e-mail e senha. Cada usuário só vê os próprios dados.

## Peças

| Peça | Onde | O que faz |
|---|---|---|
| Aplicativo (React + Vite) | `src/` | as telas; publicado na Vercel |
| Banco de dados | `supabase/migrations/` | tabelas, regras de acesso por usuário, pasta das fotos |
| Leitura da foto | `supabase/functions/ler-cupom/` | recebe a foto e devolve os itens lidos pela IA (Claude) |
| Primeira compra | `src/importacao/cupom-2026-10-31.json` | o cupom do Atacadão de 31/10/2026, já lido e conferido |

## Configuração automática

Com estas variáveis de ambiente definidas, `bash scripts/configurar.sh` faz tudo:

| Variável | Onde pegar |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com > Account > Access Tokens |
| `SUPABASE_PROJECT_REF` | o código do projeto na URL do painel (`https://supabase.com/dashboard/project/<ref>`) |
| `ANTHROPIC_API_KEY` | console.anthropic.com > API Keys |
| `VERCEL_TOKEN` | vercel.com > Account Settings > Tokens |

O script:
1. cria o banco (roda a migração pela API do Supabase);
2. publica a função `ler-cupom` e guarda a `ANTHROPIC_API_KEY` como segredo dela;
3. ajusta o login: endereço do site e links de confirmação;
4. publica o aplicativo na Vercel, já com a URL e a chave pública do Supabase.

## Configuração manual (alternativa)

1. **Banco:** no Supabase, abra *SQL Editor*, cole `supabase/migrations/20261102000000_esquema_inicial.sql` e clique em *Run*.
2. **Função:** `npx supabase functions deploy ler-cupom --project-ref <ref> --use-api` e depois
   `npx supabase secrets set ANTHROPIC_API_KEY=... --project-ref <ref>`.
3. **Login:** em *Authentication > URL Configuration*, ponha o endereço da Vercel em *Site URL* e em *Redirect URLs*.
4. **Vercel:** importe o repositório e cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Supabase > Project Settings > API).

## Custo da leitura por foto

A função usa o modelo `claude-opus-5-5` (padrão). Um cupom de cerca de 80 itens custa em torno de **US$ 0,15 a 0,30 por leitura (cerca de R$ 1 a R$ 1,70)**. Para gastar menos, defina o segredo `MODELO_IA=claude-sonnet-5-5`, que custa cerca de metade, ao preço de mais itens para corrigir na conferência.

## Rodar no computador

```bash
cp .env.example .env.local   # preencha a URL e a chave anon
npm install
npm run dev
```
