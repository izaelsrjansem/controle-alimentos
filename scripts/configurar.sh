#!/usr/bin/env bash
# Configura tudo de uma vez: banco, função de leitura da foto, login e publicação na Vercel.
# Precisa das variáveis: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, ANTHROPIC_API_KEY, VERCEL_TOKEN.
# Pode rodar de novo sem estragar nada (a migração é idempotente).
set -euo pipefail
cd "$(dirname "$0")/.."

for v in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF ANTHROPIC_API_KEY VERCEL_TOKEN; do
  [ -n "${!v:-}" ] || { echo "Falta a variável $v." >&2; exit 1; }
done
REF="$SUPABASE_PROJECT_REF"
API="https://api.supabase.com/v1/projects/$REF"
H=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json")
falhou() { echo "ERRO: $1" >&2; exit 1; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

echo "1/4 Banco de dados…"
python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' \
  supabase/migrations/20261102000000_esquema_inicial.sql > $T/migracao.json
code=$(curl -sS -o $T/resp -w '%{http_code}' -X POST "${H[@]}" "$API/database/query" --data @$T/migracao.json)
[ "${code:0:1}" = 2 ] || falhou "migração recusada ($code): $(cat $T/resp)"

echo "2/4 Função ler-cupom e segredo da IA…"
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" npx --yes supabase@2.121.0 functions deploy ler-cupom --project-ref "$REF" --use-api
python3 -c 'import json,os; print(json.dumps([{"name":"ANTHROPIC_API_KEY","value":os.environ["ANTHROPIC_API_KEY"]}]))' > $T/segredo.json
code=$(curl -sS -o $T/resp -w '%{http_code}' -X POST "${H[@]}" "$API/secrets" --data @$T/segredo.json)
[ "${code:0:1}" = 2 ] || falhou "segredo recusado ($code): $(cat $T/resp)"

echo "3/4 Publicação na Vercel…"
URL_SUPABASE="https://$REF.supabase.co"
ANON=$(curl -sS "${H[@]}" "$API/api-keys" | python3 -c '
import json,sys
ks=json.load(sys.stdin)
pub=[k for k in ks if k.get("type")=="publishable"] or [k for k in ks if k.get("name")=="anon"]
print(pub[0]["api_key"] if pub else "")')
[ -n "$ANON" ] || falhou "não encontrei a chave pública (anon/publishable) do projeto."
SITE=$(npx --yes vercel@64.5.0 deploy --prod --yes --token "$VERCEL_TOKEN" \
  --build-env VITE_SUPABASE_URL="$URL_SUPABASE" --build-env VITE_SUPABASE_ANON_KEY="$ANON" 2>/dev/null | tail -1)
[ -n "$SITE" ] || falhou "a Vercel não devolveu o endereço publicado."
DOMINIO=$(npx --yes vercel@64.5.0 inspect "$SITE" --token "$VERCEL_TOKEN" 2>&1 | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | grep -v -- "-[a-z0-9]\{9\}-" | head -1 || true)
SITE_FINAL="${DOMINIO:-$SITE}"

echo "4/4 Login por e-mail…"
python3 -c 'import json,sys; s=sys.argv[1]; print(json.dumps({"site_url": s, "uri_allow_list": s + "/**", "mailer_autoconfirm": False}))' "$SITE_FINAL" > $T/auth.json
code=$(curl -sS -o $T/resp -w '%{http_code}' -X PATCH "${H[@]}" "$API/config/auth" --data @$T/auth.json)
[ "${code:0:1}" = 2 ] || falhou "configuração do login recusada ($code): $(cat $T/resp)"

echo
echo "Pronto. Abra $SITE_FINAL, crie sua conta com e-mail e senha e confirme pelo e-mail recebido."
