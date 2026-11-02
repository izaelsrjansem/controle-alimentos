// Leitura do banco e cálculos derivados (último preço, melhor mercado, variação).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";

async function lerTudo() {
  const [produtos, precos, compras, despensa] = await Promise.all([
    supabase.from("produtos").select("id,nome,categoria,tipo,medida").order("nome"),
    supabase.from("precos").select("*").order("data", { ascending: false }),
    supabase.from("compras").select("id,data,total_bruto,desconto,total_pago,pagamento,origem,observacao,mercado:mercados(nome)").order("data", { ascending: false }),
    supabase.from("despensa").select("produto_id,situacao"),
  ]);
  const erro = produtos.error || precos.error || compras.error || despensa.error;
  if (erro) throw erro;
  return {
    produtos: produtos.data,
    precos: precos.data.map((p) => ({ ...p,
      tamanho: Number(p.tamanho), quantidade: p.quantidade == null ? null : Number(p.quantidade),
      valor_unitario: Number(p.valor_unitario), desconto: Number(p.desconto || 0),
      valor_total: p.valor_total == null ? null : Number(p.valor_total),
      preco_referencia: p.preco_referencia == null ? null : Number(p.preco_referencia) })),
    compras: compras.data.map((c) => ({ ...c, mercado: c.mercado?.nome ?? "",
      total_bruto: Number(c.total_bruto), desconto: Number(c.desconto), total_pago: Number(c.total_pago) })),
    situacao: Object.fromEntries(despensa.data.map((d) => [d.produto_id, d.situacao])),
  };
}

export function useDados() {
  const [estado, setEstado] = useState({ carregando: true, erro: null, produtos: [], precos: [], compras: [], situacao: {} });
  const recarregar = useCallback(async () => {
    try { const d = await lerTudo(); setEstado({ carregando: false, erro: null, ...d }); }
    catch (e) { setEstado((s) => ({ ...s, carregando: false, erro: e.message || "Falha ao ler os dados." })); }
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);

  const itens = useMemo(() => agrupar(estado.produtos, estado.precos), [estado.produtos, estado.precos]);
  return { ...estado, itens, recarregar, setSituacaoLocal: (id, s) =>
    setEstado((e) => { const situacao = { ...e.situacao }; s ? (situacao[id] = s) : delete situacao[id]; return { ...e, situacao }; }) };
}

// Um "item" = produto + todo o histórico de preços dele
function agrupar(produtos, precos) {
  const porProduto = new Map(produtos.map((p) => [p.id, { ...p, regs: [] }]));
  for (const r of precos) porProduto.get(r.produto_id)?.regs.push(r);
  const lista = [];
  for (const g of porProduto.values()) {
    if (!g.regs.length) continue;
    g.regs.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.origem === "compra" ? -1 : 1));
    g.compras = g.regs.filter((r) => r.origem === "compra");
    g.ultima = g.compras[0] ?? null;
    g.ultimoReg = g.regs[0];
    if (g.ultima) {
      const mesma = g.compras.filter((r) => r.compra_id === g.ultima.compra_id);
      g.qtdUlt = mesma.reduce((s, r) => s + r.quantidade, 0);
      g.totUlt = mesma.reduce((s, r) => s + r.valor_total, 0);
    }
    // preço mais recente de cada mercado, e o menor entre eles
    g.porMercado = new Map();
    for (const r of g.regs) if (r.preco_referencia != null && !g.porMercado.has(r.mercado)) g.porMercado.set(r.mercado, r);
    g.melhor = [...g.porMercado.values()].reduce((m, r) => (!m || r.preco_referencia < m.preco_referencia ? r : m), null);
    // variação entre as duas ocasiões mais recentes com preço
    const ocasioes = [];
    for (const r of g.regs) { const k = r.data + "|" + r.mercado; if (r.preco_referencia != null && !ocasioes.some((o) => o.k === k)) ocasioes.push({ k, r }); }
    g.variacao = ocasioes.length >= 2 && ocasioes[1].r.preco_referencia
      ? (ocasioes[0].r.preco_referencia - ocasioes[1].r.preco_referencia) / ocasioes[1].r.preco_referencia : null;
    lista.push(g);
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function definirSituacao(produtoId, situacao) {
  if (!situacao) return supabase.from("despensa").delete().eq("produto_id", produtoId);
  return supabase.from("despensa").upsert({ produto_id: produtoId, situacao, atualizado_em: new Date().toISOString() });
}
