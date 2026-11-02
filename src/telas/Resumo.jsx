import { useMemo, useState } from "react";
import { supabase } from "../supabase.js";
import { brl, num, dataBR, mesAtual, nomeMes, NAO_ALIMENTO, medidaTxt, baixarCSV, ORIGEM_TXT, mesmaCompra } from "../util.js";
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
  const [importando, setImportando] = useState(false);
  const [aberta, setAberta] = useState(null);

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
  const itensDaCompra = useMemo(() => precos.reduce((m, r) => r.compra_id ? m.set(r.compra_id, (m.get(r.compra_id) ?? 0) + 1) : m, new Map()), [precos]);
  // a mais recente de cada par igual é marcada como repetida (a lista vem da mais nova para a mais antiga)
  const repetidas = new Set(doMes.filter((c, i) => doMes.slice(i + 1).some((o) => mesmaCompra(c, o))).map((c) => c.id));

  const anterior = somarMes(mes, -1);
  const totalAnterior = compras.filter((c) => c.data.startsWith(anterior)).reduce((s, c) => s + c.total_pago, 0);

  async function importar() {
    if (importando) return;
    setImportando(true);
    setAviso({ tipo: "ok", texto: "Importando o cupom de 31/10/2026…" });
    const c = cupomInicial;
    const { error } = await supabase.rpc("salvar_compra", { p: {
      mercado: c.mercado, data: c.data, pagamento: c.pagamento, origem: "importacao",
      observacao: `${c.referencia} · NFC-e ${c.nfce} · ${c.loja}`,
      itens: c.itens.map((i) => ({ nome: i.item, categoria: i.cat, tipo: i.tipo, medida: i.base,
        descricao_cupom: `Cód. ${i.codigo}`, marca: i.marca === "—" ? "" : i.marca, embalagem: i.emb,
        tamanho: i.tam, quantidade: i.qtd, valor_unitario: i.vu, desconto: i.desconto, valor_total: i.total })),
    } });
    if (error) { setImportando(false); return setAviso({ tipo: "erro", texto: "Não consegui importar: " + error.message }); }
    setAviso({ tipo: "ok", texto: "Cupom de 31/10/2026 importado: 83 itens, R$ 1.069,36." });
    setMes("2026-10"); await dados.recarregar(); setImportando(false);
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
          <button className="btn" onClick={importar} disabled={importando}>{importando ? "Importando…" : "Importar cupom de 31/10/2026"}</button>
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
      {repetidas.size > 0 && <div className="banner">
        {repetidas.size === 1 ? "Uma compra parece ter sido lançada duas vezes" : `${repetidas.size} compras parecem ter sido lançadas duas vezes`} (mesma data, mercado e total).
        Os totais abaixo estão contando em dobro. <a href="#compras-do-mes">Ver e apagar a repetida</a>.
      </div>}

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

      <div className="panel" id="compras-do-mes">
        <h2>Compras de {nomeMes(mes)}</h2>
        <p className="note">Cada linha é um lançamento inteiro. "Ver itens" abre a compra para excluir um item; "Apagar" remove a compra com todos os itens dela.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Data</th><th>Mercado</th><th className="r">Itens</th><th className="r">Desconto</th><th className="r">Pago</th><th /></tr></thead>
          <tbody>{doMes.map((c) => [
            <tr key={c.id} className={repetidas.has(c.id) ? "duvida" : ""}>
              <td className="num">{dataBR(c.data)}</td>
              <td>{c.mercado}
                {repetidas.has(c.id) && <div><b>Repetida</b>: igual a outra compra desta lista</div>}
                <div className="note">{[ORIGEM_TXT[c.origem], c.observacao].filter(Boolean).join(" · ")}</div></td>
              <td className="r num">{itensDaCompra.get(c.id) ?? 0}</td>
              <td className="r money">{brl(c.desconto)}</td>
              <td className="r money"><b>{brl(c.total_pago)}</b></td>
              <td className="r">{apagando === c.id
                ? <span className="row" style={{ justifyContent: "flex-end" }}><button className="btn" onClick={() => apagar(c)}>Confirmar</button><button className="btn ghost" onClick={() => setApagando(null)}>Cancelar</button></span>
                : <span className="row" style={{ justifyContent: "flex-end" }}>
                    <button className="btn ghost" onClick={() => setAberta(aberta === c.id ? null : c.id)} aria-expanded={aberta === c.id}>{aberta === c.id ? "Fechar" : "Ver itens"}</button>
                    <button className="sair" onClick={() => setApagando(c.id)}>Apagar compra</button></span>}</td>
            </tr>,
            aberta === c.id && <tr key={c.id + "-itens"}><td colSpan={6}>
              <ItensDaCompra compra={c} linhas={precos.filter((r) => r.compra_id === c.id)} prod={prod}
                aoMudar={(texto) => { setAviso({ tipo: "ok", texto }); dados.recarregar(); }} aoErro={(texto) => setAviso({ tipo: "erro", texto })} />
            </td></tr>,
          ])}</tbody>
        </table></div>
      </div>
    </>
  );
}

/* ---------- Compra já lançada: excluir um item e recalcular o total ---------- */
function ItensDaCompra({ compra, linhas, prod, aoMudar, aoErro }) {
  const [excluindo, setExcluindo] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function excluir(item) {
    setOcupado(true);
    const nome = prod.get(item.produto_id)?.nome ?? "Item";
    const { error } = await supabase.from("compra_itens").delete().eq("id", item.id);
    if (error) { setOcupado(false); setExcluindo(null); return aoErro("Não consegui excluir o item: " + error.message); }

    const resto = linhas.filter((l) => l.id !== item.id);
    if (!resto.length) {
      // era o último item: a compra inteira deixa de existir
      const { error: e2 } = await supabase.from("compras").delete().eq("id", compra.id);
      setOcupado(false); setExcluindo(null);
      if (e2) return aoErro("O item saiu, mas não consegui apagar a compra vazia: " + e2.message);
      return aoMudar(`${nome} excluído. Era o último item, então a compra de ${dataBR(compra.data)} foi apagada.`);
    }
    const bruto = resto.reduce((s, l) => s + l.valor_total + l.desconto, 0);
    const desc = resto.reduce((s, l) => s + l.desconto, 0);
    const r2 = (v) => Math.round(v * 100) / 100;
    const { error: e3 } = await supabase.from("compras")
      .update({ total_bruto: r2(bruto), desconto: r2(desc), total_pago: r2(bruto - desc) }).eq("id", compra.id);
    setOcupado(false); setExcluindo(null);
    if (e3) return aoErro("O item saiu, mas não consegui atualizar o total da compra: " + e3.message);
    aoMudar(`${nome} excluído da compra de ${dataBR(compra.data)}. Novo total: ${brl(bruto - desc)}.`);
  }

  if (!linhas.length) return <p className="empty">Esta compra não tem itens.</p>;
  return (
    <div className="tablewrap"><table className="revisao">
      <thead><tr><th>Item</th><th>Marca</th><th>Embalagem</th><th className="r">Qtd</th><th className="r">R$ unit.</th><th className="r">Desc.</th><th className="r">Total</th><th /></tr></thead>
      <tbody>{linhas.map((l) => (
        <tr key={l.id}>
          <td>{prod.get(l.produto_id)?.nome}</td>
          <td>{l.marca ?? ""}</td>
          <td>{l.embalagem ?? ""}</td>
          <td className="r num">{num(l.quantidade)}</td>
          <td className="r money">{brl(l.valor_unitario)}</td>
          <td className="r money">{brl(l.desconto)}</td>
          <td className="r money">{brl(l.valor_total)}</td>
          <td className="r">{excluindo === l.id
            ? <span className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => excluir(l)} disabled={ocupado}>Confirmar</button>
                <button className="btn ghost" onClick={() => setExcluindo(null)} disabled={ocupado}>Cancelar</button></span>
            : <button className="sair" onClick={() => setExcluindo(l.id)} disabled={ocupado}>Excluir</button>}</td>
        </tr>))}</tbody>
    </table></div>
  );
}
