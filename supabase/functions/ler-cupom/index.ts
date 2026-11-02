// Edge Function "ler-cupom": recebe o caminho da(s) foto(s) do cupom no Storage,
// pede à IA que leia os itens e devolve a lista para o usuário conferir.
// Nada é gravado aqui: quem grava é o app, depois que o usuário confere.
//
// Segredos necessários (Supabase > Edge Functions > Secrets):
//   ANTHROPIC_API_KEY  — chave da API da Anthropic
//   MODELO_IA          — opcional; padrão claude-opus-5-5
import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const CATEGORIAS = [
  "Carnes e aves", "Hortifruti", "Mercearia", "Laticínios", "Padaria", "Congelados",
  "Doces e biscoitos", "Temperos e molhos", "Bebidas", "Limpeza", "Higiene", "Utilidades", "Outros",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mercado", "data", "pagamento", "total_bruto", "desconto_total", "total_pago", "itens", "observacoes"],
  properties: {
    mercado: { type: "string", description: "Nome curto do mercado, ex.: Atacadão" },
    data: { type: "string", description: "Data da compra no formato AAAA-MM-DD, ou vazio se ilegível" },
    pagamento: { type: "string" },
    total_bruto: { type: "number" },
    desconto_total: { type: "number" },
    total_pago: { type: "number" },
    observacoes: { type: "string", description: "Trechos ilegíveis ou dúvidas, em português; vazio se nenhuma" },
    itens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["descricao_cupom", "nome", "marca", "categoria", "tipo", "embalagem", "tamanho",
          "medida", "quantidade", "valor_unitario", "desconto", "valor_total", "duvida", "fora_rancho"],
        properties: {
          descricao_cupom: { type: "string", description: "Texto como está no cupom" },
          nome: { type: "string", description: "Nome genérico do item, sem marca. Ex.: Arroz tipo 1" },
          marca: { type: "string" },
          categoria: { type: "string", enum: CATEGORIAS },
          tipo: { type: "string", enum: ["alimento", "limpeza", "higiene", "utilidade"] },
          embalagem: { type: "string", description: "Ex.: 1 kg, 500 ml, 4 un, a granel" },
          tamanho: { type: "number", description: "Tamanho da embalagem na medida. 500 g = 0.5; a granel = 1" },
          medida: { type: "string", enum: ["kg", "L", "un"] },
          quantidade: { type: "number", description: "Unidades compradas; a granel = peso em kg" },
          valor_unitario: { type: "number" },
          desconto: { type: "number", description: "Desconto da linha 'desconto sobre item' logo abaixo; 0 se não houver" },
          valor_total: { type: "number", description: "Valor pago no item já com o desconto" },
          duvida: { type: "boolean", description: "true se algum número deste item ficou ilegível ou incerto" },
          fora_rancho: { type: "boolean", description: "true se o item NÃO é de rancho (bem durável, não consumível): eletrodoméstico, eletrônico, cama/mesa/banho, roupa, brinquedo, ferramenta, móvel, decoração, panela" },
        },
      },
    },
  },
} as const;

function instrucoes(produtosConhecidos: string[]) {
  return `Você lê fotos de cupons fiscais brasileiros (NFC-e / DANFE) de supermercado e extrai cada item.

Regras de leitura:
- Uma linha "desconto sobre item" pertence ao item imediatamente ACIMA dela. Some esse valor em "desconto" daquele item e calcule valor_total = quantidade × valor_unitario − desconto. Não crie item para a linha de desconto.
- Item pesado aparece como "0,935kg x 6,99 R$/kg": quantidade = 0.935, valor_unitario = 6.99, tamanho = 1, medida = "kg", embalagem = "a granel".
- Em "1X500G 3 UND 2,69 8,07": embalagem 500 g (tamanho 0.5, medida kg), quantidade 3, valor_unitario 2.69.
- ML e L viram medida "L" (250ML = 0.25). Itens contados (rolos, unidades, absorventes) usam medida "un" com tamanho = número de unidades do pacote.
- A foto pode estar inclinada ou amassada: as colunas de valores podem parecer deslocadas uma linha. Use a sequência (cada item tem um bloco de qtde/valor) e confira que quantidade × valor_unitario bate com o valor total impresso.
- Quando houver várias fotos, são partes consecutivas do mesmo cupom, com sobreposição: não repita itens que aparecem em duas partes (o código do produto ajuda a reconhecer).
- Confira a soma: a soma de (valor_total + desconto) dos itens deve dar o "Valor total R$" do cupom, e a soma dos descontos deve dar o "Desconto total". Se não bater, revise os itens antes de responder e explique em "observacoes".
- Marque duvida = true no item cujo número você não conseguiu ler com certeza. Nunca invente item ou valor.
- "nome" é o item genérico, sem marca, em português claro (ex.: "FEIJAO KICALDO FRAD" -> nome "Feijão fradinho", marca "Kicaldo").
- "fora_rancho": o rancho é o que a casa consome e repõe todo mês: alimentos, bebidas, produtos de limpeza, higiene e descartáveis do dia a dia (papel higiênico, papel toalha, guardanapo, saco de lixo, esponja, papel-alumínio, filme plástico, filtro de café, fósforo, vela, pilha, ração de animal). Marque fora_rancho = true só para o que não é consumo do mês: eletrodomésticos e eletroportáteis (liquidificador, ventilador, ferro), eletrônicos e acessórios (fone, cabo, carregador, lâmpada), cama, mesa e banho (lençol, toalha, cobertor), roupas e calçados, brinquedos, ferramentas, móveis, decoração, utensílios duráveis (panela, jogo de copos, pote, garrafa térmica), material escolar e de escritório, presentes. Na dúvida, deixe false: o usuário marca à mão na conferência.
${produtosConhecidos.length ? `- O usuário já tem estes itens cadastrados. Quando for o mesmo produto, use exatamente o mesmo nome, para o histórico de preços casar:\n${produtosConhecidos.map((n) => "  • " + n).join("\n")}` : ""}

Responda somente com o JSON pedido.`;
}

function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder({ erro: "Use POST." }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return responder({ erro: "Faça login para enviar o cupom." }, 401);

  // Cliente com o token do próprio usuário: o Storage só entrega as fotos dele.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return responder({ erro: "Sessão expirada. Entre de novo." }, 401);

  let caminhos: string[] = [];
  try {
    const corpo = await req.json();
    caminhos = Array.isArray(corpo.caminhos) ? corpo.caminhos.slice(0, 6) : [];
  } catch { /* corpo inválido cai na validação abaixo */ }
  if (!caminhos.length || caminhos.some((c) => !c.startsWith(user.id + "/"))) {
    return responder({ erro: "Envie de 1 a 6 fotos do cupom." }, 400);
  }

  const imagens = [];
  for (const caminho of caminhos) {
    const { data, error } = await supabase.storage.from("cupons").download(caminho);
    if (error || !data) return responder({ erro: "Não encontrei a foto enviada. Tente enviar de novo." }, 404);
    const tipo = data.type === "image/png" || data.type === "image/webp" ? data.type : "image/jpeg";
    imagens.push({ type: "image" as const, source: { type: "base64" as const, media_type: tipo, data: base64(new Uint8Array(await data.arrayBuffer())) } });
  }

  const { data: produtos } = await supabase.from("produtos").select("nome").order("nome").limit(400);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return responder({ erro: "A leitura por foto ainda não foi configurada (falta ANTHROPIC_API_KEY)." }, 500);
  const client = new Anthropic({ apiKey });

  try {
    const stream = client.beta.messages.stream({
      model: Deno.env.get("MODELO_IA") || "claude-opus-5-5",
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
      system: instrucoes((produtos ?? []).map((p) => p.nome)),
      messages: [{
        role: "user",
        content: [
          ...imagens,
          { type: "text", text: imagens.length > 1
              ? `São ${imagens.length} partes do mesmo cupom, de cima para baixo. Extraia todos os itens.`
              : "Extraia todos os itens deste cupom." },
        ],
      }],
    } as any);
    const msg = await stream.finalMessage();

    if (msg.stop_reason === "refusal") return responder({ erro: "A IA não conseguiu ler esta foto. Lance os itens manualmente." }, 422);
    if (msg.stop_reason === "max_tokens") return responder({ erro: "O cupom é longo demais para uma leitura. Envie em duas partes." }, 422);

    const texto = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const cupom = JSON.parse(texto);

    // Conferência das somas, para a tela avisar o usuário
    const soma = cupom.itens.reduce((s: number, i: any) => s + i.valor_total + i.desconto, 0);
    const descontos = cupom.itens.reduce((s: number, i: any) => s + i.desconto, 0);
    cupom.conferencia = {
      soma_itens: Math.round(soma * 100) / 100,
      soma_descontos: Math.round(descontos * 100) / 100,
      bate_total: Math.abs(soma - cupom.total_bruto) < 0.02,
      bate_desconto: Math.abs(descontos - cupom.desconto_total) < 0.02,
    };
    cupom.modelo = msg.model;
    cupom.uso = { entrada: msg.usage.input_tokens, saida: msg.usage.output_tokens };
    return responder(cupom);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return responder({ erro: "Muitas leituras seguidas. Aguarde um minuto e tente de novo." }, 429);
    if (e instanceof Anthropic.AuthenticationError) return responder({ erro: "A chave da IA está inválida. Confira ANTHROPIC_API_KEY." }, 500);
    if (e instanceof Anthropic.APIError) return responder({ erro: `A IA respondeu com erro (${e.status}). Tente de novo em instantes.` }, 502);
    if (e instanceof SyntaxError) return responder({ erro: "A leitura veio incompleta. Tente de novo." }, 502);
    console.error("ler-cupom", e);
    return responder({ erro: "Falha ao ler o cupom. Tente de novo." }, 500);
  }
});
