import { useMemo, useState } from "react";
import { supabase } from "../supabase.js";
import { brl, num, dataBR, mesAtual, nomeMes, NAO_ALIMENTO, medidaTxt, baixarCSV } from "../util.js";
import cupomInicial from "../importacao/cupom-2026-10-31.json";

const somarMes = (aaaamm, delta) => {
  const [a, m] = aaaamm.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function Resumo({ dados, ir }) {
  const { compras, precos, produtos } = dados;
  const [mes, setMes] = useState(() => compras[0]?.data.slice(0, 7) ?? mesAtual());
  const [aviso, setAviso] = useState(null);
  const [apagando, setApagando] = useState(null);

  const prod = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const doMes = compras.filter((c) => c.data.startsWith(mes));
  const linhas = precos.filter((r) => r.origem === "compra" && r.data.startsWith(mes))
    .map((r) => ({ ...r, p: prod.get(r.produto_id) }));

  const total = doMes.reduce((s, c) => s + c.total_pago, 0);
  const alim = linhas.filter((l) => !NAO_ALIMENTO.has(l.p?.tipo)).reduce((s, l) => s + l.valor_total, 0);
  const outros = total - alim;
  const descontos = doMes.reduce((s, c) => s + c.desconto, 0);

  const porCat = [...linhas.reduce((m, l) => {
    const k = l.p?.categoria ?? "Outros"; const o = m.get(k) ?? { v: 0, tipo: l.p?.tipo }; o.v += l.valor_total; return m.set(k, o);
  }, new Map())].sort((a, b) => b[1].v - a[1].v);

  // por item: gasto, vezes que entrou na compra e quantidade
  const porItem = [...linhas.reduce((m, l) => {
    const o = m.get(l.produto_id) ?? { p: l.p, gasto: 0, vezes: new Set(), qtd: 0 };
    o.gasto += l.valor_total; o.vezes.add(l.compra_id); o.qtd += l.quantidade * l.tamanho; // 4 pacotes de 1 kg = 4 kg; 0,935 kg a granel = 0,935 kg
    return m.set(l.produto_id, o);
  }, new Map()).values()].filter((o) => !NAO_ALIMENTO.has(o.p?.tipo));
  const maisGasto = [...porItem].sort((a, b) => b.gasto - a.gasto).slice(0, 8);
  const maisComprados = [...porItem].sort((a, b) => b.vezes.size - a.vezes.size || b.gasto - a.gasto).slice(0, 8);

  // comparação com o mês anterior
  const anterior = somarMes(mes, -1);
  const totalAnterior = compras.filter((c) => c.data.startsWith(anterior)).reduce((s, c) => s + c.total_pago, 0);

  async function importar() {
    setAviso({ tipo: "ok", texto: "Importando o cupom de 31/10/2026…" });
    const c = cupomInicial;
    const { error } = await supabase.rpc("salvar_compra", { p: {
      mercado: c.mercado, data: c.data, pagamento: c.pagamento, origem: "importacao",
      observacao: `${c.referencia} · NFC-e ${c.nfce} · ${c.loja}`,
      itens: c.itens.map((i) => ({ nome: i.item, categoria: i.cat, tipo: i.tipo, medida: i.base,
        descricao_cupom: `Cód. ${i.codigo}`, marca: i.marca === "—" ? "" : i.marca, embalagem: i.emb,
        tamanho: i.tam, quantidade: i.qtd, valor_unitario: i.vu, desconto: i.desconto, valor_total: i.total })),
    } });
    if (error) return setAviso({ tipo: "erro", texto: "Não consegui importar: " + error.message });
    setAviso({ tipo: "ok", texto: "Cupom de 31/10/2026 importado: 83 itens, R$ 1.069,36." });
    setMes("2026-10"); dados.recarregar();
  }

  async function apagar(c) {
    const { error } = await supabase.from("compras").delete().eq("id", c.id);
    setApagando(null);
    if (error) return setAviso({ tipo: "erro", texto: "Não consegui apagar: " + error.message });
    setAviso({ tipo: "ok", texto: `Compra de ${dataBR(c.data)} no ${c.mercado} apagada.` });
    dados.recarregar();
  }

  function exportar(todos) {
    const sel = todos ? precos.filter((r) => r.origem === "compra") : linhas;
    const cab = ["Data", "Mercado", "Item", "Categoria", "Tipo", "Marca", "Embalagem", "Quantidade", "Valor unitário", "Desconto", "Valor pago", "Preço por medida", "Medida"];
    const rows = sel.map((r) => { const p = r.p ?? prod.get(r.produto_id) ?? {};
      return [dataBR(r.data), r.mercado, p.nome, p.categoria, p.tipo, r.marca ?? "", r.embalagem ?? "", r.quantidade,
        r.valor_unitario, r.desconto, r.valor_total, Math.round(r.preco_referencia * 100) / 100, medidaTxt[p.medida]]; });
    baixarCSV(todos ? "compras-todas.csv" : `compras-${mes}.csv`, cab, rows);
  }

  if (!compras.length) {
    return (
      <div className="panel">
        <h2>Nenhuma compra registrada ainda</h2>
        <p>Comece pelo cupom do Atacadão de 31/10/2026, que já está lido (83 itens, R$ 1.069,36), ou lance uma compra nova.</p>
        {aviso && <div className={aviso.tipo}>{aviso.texto}</div>}
        <div className="row">
          <button className="btn" onClick={importar}>Importar cupom de 31/10/2026</button>
          <button className="btn ghost" onClick={() => ir("lancar")}>Lançar outra compra</button>
        </div>
      </div>
    );
  }

  const max = porCat[0]?.[1].v || 1;
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="mesnav">
          <button aria-label="Mês anterior" onClick={() => setMes(somarMes(mes, -1))}>‹</button>
          <strong>{nomeMes(mes)}</strong>
          <button aria-label="Próximo mês" onClick={() => setMes(somarMes(mes, 1))}>›</button>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => exportar(false)} disabled={!linhas.length}>Exportar o mês (planilha)</button>
          <button className="btn ghost" onClick={() => exportar(true)}>Exportar tudo</button>
        </div>
      </div>
      {aviso && <div className={aviso.tipo}>{aviso.texto}</div>}

      <div className="kpis">
        <div className="kpi main"><span className="lbl">Gasto no mês</span><span className="money">{brl(total)}</span>
          <span style={{ fontSize: ".8rem" }}>{doMes.length} {doMes.length === 1 ? "compra" : "compras"}{totalAnterior ? ` · mês anterior ${brl(totalAnterior)}` : ""}</span></div>
        <div className="kpi"><span className="lbl">Alimentação</span><span className="money">{brl(alim)}</span><span className="note">{total ? Math.round(alim / total * 100) : 0}% do mês</span></div>
        <div className="kpi"><span className="lbl">Limpeza e higiene</span><span className="money">{brl(outros)}</span><span className="note">{total ? Math.round(outros / total * 100) : 0}% do mês</span></div>
        <div className="kpi"><span className="lbl">Descontos</span><span className="money">{brl(descontos)}</span><span className="note">economizados no caixa</span></div>
      </div>

      {!doMes.length ? <div className="panel"><p className="empty">Nenhuma compra em {nomeMes(mes)}.</p></div> : (
        <>
          <div className="grid2">
            <div className="panel">
              <h2>Para onde foi o dinheiro</h2>
              <div className="bars">
                {porCat.map(([c, o]) => (
                  <div key={c} className={"bar" + (NAO_ALIMENTO.has(o.tipo) ? " off" : "")}>
                    <span>{c}</span><span className="track"><span className="fill" style={{ width: `${(o.v / max * 100).toFixed(1)}%`, display: "block" }} /></span>
                    <span className="money">{brl(o.v)}</span>
                  </div>
                ))}
              </div>
              <p className="note">Em cinza, o que não é alimento.</p>
            </div>
            <div className="panel">
              <h2>Alimentos que mais pesaram</h2>
              <div className="list">{maisGasto.map((o) => (
                <div className="it" key={o.p?.id}><span className="nm">{o.p?.nome}</span>
                  <span className="pr"><span className="money">{brl(o.gasto)}</span></span></div>))}</div>
            </div>
          </div>
          <div className="panel">
            <h2>Alimentos mais comprados</h2>
            <p className="note">Quantas compras do mês tiveram o item e quanto entrou em casa.</p>
            <div className="list">{maisComprados.map((o) => (
              <div className="it" key={o.p?.id}><span className="nm">{o.p?.nome}</span>
                <span className="pr"><span className="num">{o.vezes.size}×</span><span className="ref">{num(o.qtd)} {medidaTxt[o.p?.medida]}</span></span></div>))}</div>
          </div>
        </>
      )}

      <div className="panel">
        <h2>Compras de {nomeMes(mes)}</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Data</th><th>Mercado</th><th className="r">Desconto</th><th className="r">Pago</th><th /></tr></thead>
          <tbody>{doMes.map((c) => (
            <tr key={c.id}>
              <td className="num">{dataBR(c.data)}</td>
              <td>{c.mercado}{c.observacao && <div className="note">{c.observacao}</div>}</td>
              <td className="r money">{brl(c.desconto)}</td>
              <td className="r money"><b>{brl(c.total_pago)}</b></td>
              <td className="r">{apagando === c.id
                ? <span className="row" style={{ justifyContent: "flex-end" }}><button className="btn" onClick={() => apagar(c)}>Confirmar</button><button className="btn ghost" onClick={() => setApagando(null)}>Cancelar</button></span>
                : <button className="sair" onClick={() => setApagando(c.id)}>Apagar</button>}</td>
            </tr>))}</tbody>
        </table></div>
      </div>
    </>
  );
}
