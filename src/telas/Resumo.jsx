import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [exportando, setExportando] = useState(false);
  const { recarregar } = dados;
  const aoMudarItens = useCallback((texto) => { setAviso({ tipo: "ok", texto }); recarregar(); }, [recarregar]);
  const aoErroItens = useCallback((texto) => setAviso({ tipo: "erro", texto }), []);

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

  // planilha das compras entre duas datas (AAAA-MM-DD, as duas incluídas)
  function exportar(de, ate, nome) {
    const sel = precos.filter((r) => r.origem === "compra" && r.data >= de && r.data <= ate)
      .sort((a, b) => a.data.localeCompare(b.data));
    const cab = ["Data", "Mercado", "Item", "Categoria", "Tipo", "Marca", "Embalagem", "Quantidade", "Valor unitário", "Desconto", "Valor pago", "Preço por medida", "Medida"];
    const rows = sel.map((r) => { const p = r.p ?? prod.get(r.produto_id) ?? {};
      return [dataBR(r.data), r.mercado, p.nome, p.categoria, p.tipo, r.marca ?? "", r.embalagem ?? "", r.quantidade,
        r.valor_unitario, r.desconto, r.valor_total, Math.round(r.preco_referencia * 100) / 100, medidaTxt[p.medida]]; });
    baixarCSV(nome, cab, rows);
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
        <button className="btn ghost" onClick={() => setExportando(!exportando)} aria-expanded={exportando}>
          {exportando ? "Fechar exportação" : "Exportar planilha"}</button>
      </div>
      {exportando && <Exportar precos={precos} mesAtualTela={mes} exportar={exportar} fechar={() => setExportando(false)} />}
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
        <div className="tablewrap"><table className="compras">
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
            aberta === c.id && <tr key={c.id + "-itens"} className="detalhe"><td colSpan={6}>
              <ItensDaCompra compra={c} prod={prod} aoMudar={aoMudarItens} aoErro={aoErroItens} />
            </td></tr>,
          ])}</tbody>
        </table></div>
      </div>
    </>
  );
}

/* ---------- Compra já lançada: marcar item como fora do rancho ou excluir, recalculando o total ---------- */
function ItensDaCompra({ compra, prod, aoMudar, aoErro }) {
  const [linhas, setLinhas] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  // lê compra_itens direto: a visão de preços não mostra os itens fora do rancho
  const ler = useCallback(async () => {
    const { data, error } = await supabase.from("compra_itens")
      .select("id,produto_id,marca,embalagem,quantidade,valor_unitario,desconto,valor_total,fora_rancho")
      .eq("compra_id", compra.id).order("fora_rancho").order("valor_total", { ascending: false });
    if (error) return aoErro("Não consegui ler os itens: " + error.message);
    setLinhas(data.map((l) => ({ ...l, quantidade: Number(l.quantidade), valor_unitario: Number(l.valor_unitario),
      desconto: Number(l.desconto), valor_total: Number(l.valor_total) })));
  }, [compra.id, aoErro]);
  useEffect(() => { ler(); }, [ler]);

  async function concluir(texto) {
    const { error } = await supabase.rpc("recalcular_compra", { p_compra: compra.id });
    setOcupado(false); setExcluindo(null);
    if (error) return aoErro("A mudança foi feita, mas não consegui atualizar o total da compra: " + error.message);
    await ler(); aoMudar(texto);
  }

  async function alternarFora(item) {
    setOcupado(true);
    const nome = prod.get(item.produto_id)?.nome ?? "Item";
    const { error } = await supabase.from("compra_itens").update({ fora_rancho: !item.fora_rancho }).eq("id", item.id);
    if (error) { setOcupado(false); return aoErro("Não consegui mudar o item: " + error.message); }
    concluir(item.fora_rancho ? `${nome} voltou a contar na compra de ${dataBR(compra.data)}.`
      : `${nome} marcado como fora do rancho: continua na compra de ${dataBR(compra.data)}, mas não conta no total.`);
  }

  async function excluir(item) {
    setOcupado(true);
    const nome = prod.get(item.produto_id)?.nome ?? "Item";
    const { error } = await supabase.from("compra_itens").delete().eq("id", item.id);
    if (error) { setOcupado(false); setExcluindo(null); return aoErro("Não consegui excluir o item: " + error.message); }
    if (linhas.length === 1) {
      // era o último item: a compra inteira deixa de existir
      const { error: e2 } = await supabase.from("compras").delete().eq("id", compra.id);
      setOcupado(false); setExcluindo(null);
      if (e2) return aoErro("O item saiu, mas não consegui apagar a compra vazia: " + e2.message);
      return aoMudar(`${nome} excluído. Era o último item, então a compra de ${dataBR(compra.data)} foi apagada.`);
    }
    concluir(`${nome} excluído da compra de ${dataBR(compra.data)}.`);
  }

  if (!linhas) return <p className="carregando">Carregando os itens…</p>;
  if (!linhas.length) return <p className="empty">Esta compra não tem itens.</p>;
  const fora = linhas.filter((l) => l.fora_rancho);
  return (
    <>
    {fora.length > 0 && <p className="note">{fora.length} {fora.length === 1 ? "item fora" : "itens fora"} do rancho ({brl(fora.reduce((s, l) => s + l.valor_total, 0))}): guardados na compra, sem contar no total.</p>}
    <div className="tablewrap"><table className="revisao">
      <thead><tr><th /><th>Item</th><th>Marca · embalagem</th><th className="r">Qtd × R$ unit.</th><th className="r">Desc.</th><th className="r">Total</th><th /></tr></thead>
      <tbody>{linhas.map((l) => (
        <tr key={l.id} className={l.fora_rancho ? "fora" : ""}>
          <td className="acao"><button className="btn ghost" style={{ whiteSpace: "nowrap" }} onClick={() => alternarFora(l)} disabled={ocupado}>
            {l.fora_rancho ? "Contar de novo" : "Fora do rancho"}</button></td>
          <td>{prod.get(l.produto_id)?.nome}{l.fora_rancho && <div className="note">fora do rancho</div>}</td>
          <td>{[l.marca, l.embalagem].filter(Boolean).join(" · ") || "—"}</td>
          <td className="r money">{num(l.quantidade)} × {brl(l.valor_unitario)}</td>
          <td className="r money">{l.desconto > 0 ? "− " + brl(l.desconto) : "—"}</td>
          <td className="r money">{brl(l.valor_total)}</td>
          <td className="r">{excluindo === l.id
            ? <span className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => excluir(l)} disabled={ocupado}>Confirmar</button>
                <button className="btn ghost" onClick={() => setExcluindo(null)} disabled={ocupado}>Cancelar</button></span>
            : <button className="sair" onClick={() => setExcluindo(l.id)} disabled={ocupado}>Excluir</button>}</td>
        </tr>))}</tbody>
    </table></div>
    </>
  );
}

/* ---------- Exportar planilha: mês inteiro ou período livre (até hoje) ---------- */
const doisDig = (n) => String(n).padStart(2, "0");
const isoDe = (d) => `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;
const ultimoDia = (aaaamm) => { const [a, m] = aaaamm.split("-").map(Number); return `${aaaamm}-${doisDig(new Date(a, m, 0).getDate())}`; };
const menosDias = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDe(d); };

function Exportar({ precos, mesAtualTela, exportar, fechar }) {
  const hoje = hojeIso();
  const mesHoje = hoje.slice(0, 7);
  const [modo, setModo] = useState("mes");
  const [mesEsc, setMesEsc] = useState(mesAtualTela > mesHoje ? mesHoje : mesAtualTela);
  const [de, setDe] = useState(`${mesHoje}-01`);
  const [ate, setAte] = useState(hoje);

  // mês inteiro vai do dia 1 ao último dia; nunca passa de hoje
  const faixa = modo === "mes"
    ? [`${mesEsc}-01`, ultimoDia(mesEsc) > hoje ? hoje : ultimoDia(mesEsc)]
    : [de, ate > hoje ? hoje : ate];
  const erro = !faixa[0] || !faixa[1] ? "Escolha as datas." : faixa[0] > faixa[1] ? "A data inicial está depois da final." : faixa[0] > hoje ? "A data inicial não pode passar de hoje." : null;
  const qtd = erro ? 0 : precos.filter((r) => r.origem === "compra" && r.data >= faixa[0] && r.data <= faixa[1]).length;
  const dias = erro ? 0 : Math.round((new Date(faixa[1]) - new Date(faixa[0])) / 86400000) + 1;
  const atalho = (d, a) => { setModo("periodo"); setDe(d); setAte(a); };

  function baixar() {
    const nome = modo === "mes" ? `compras-${mesEsc}.csv` : `compras-${faixa[0]}-a-${faixa[1]}.csv`;
    exportar(faixa[0], faixa[1], nome);
    fechar();
  }

  return (
    <div className="panel exportar">
      <h2>Exportar planilha</h2>
      <div className="opcoes" role="group" aria-label="Como escolher o período">
        <button type="button" aria-pressed={modo === "mes"} onClick={() => setModo("mes")}><b>Mês inteiro</b><small>Do dia 1 ao último dia do mês</small></button>
        <button type="button" aria-pressed={modo === "periodo"} onClick={() => setModo("periodo")}><b>Período</b><small>De uma data até outra, quantos dias quiser</small></button>
      </div>
      {modo === "mes" ? (
        <label className="campo-c">Mês<input type="month" value={mesEsc} max={mesHoje} onChange={(e) => e.target.value && setMesEsc(e.target.value)} /></label>
      ) : (
        <div className="grade-campos">
          <label className="campo-c">De<input type="date" value={de} max={hoje} onChange={(e) => setDe(e.target.value)} /></label>
          <label className="campo-c">Até<input type="date" value={ate} min={de} max={hoje} onChange={(e) => setAte(e.target.value)} /></label>
        </div>
      )}
      <div className="row atalhos">
        <span className="lbl">Atalhos</span>
        <button type="button" className="chip" onClick={() => { setModo("mes"); setMesEsc(mesHoje); }}>Este mês</button>
        <button type="button" className="chip" onClick={() => { setModo("mes"); setMesEsc(somarMesIso(mesHoje, -1)); }}>Mês passado</button>
        <button type="button" className="chip" onClick={() => atalho(menosDias(6), hoje)}>Últimos 7 dias</button>
        <button type="button" className="chip" onClick={() => atalho(menosDias(29), hoje)}>Últimos 30 dias</button>
        <button type="button" className="chip" onClick={() => atalho(menosDias(89), hoje)}>Últimos 90 dias</button>
        <button type="button" className="chip" onClick={() => atalho(precos.filter((r) => r.origem === "compra").reduce((m, r) => (r.data < m ? r.data : m), hoje), hoje)}>Tudo</button>
      </div>
      {erro ? <div className="erro">{erro}</div> : (
        <p className="note">De <b>{dataBR(faixa[0])}</b> a <b>{dataBR(faixa[1])}</b> · {dias} {dias === 1 ? "dia" : "dias"} · <b>{qtd}</b> {qtd === 1 ? "item comprado" : "itens comprados"}.
          {modo === "mes" && faixa[1] === hoje && ultimoDia(mesEsc) > hoje && " O mês ainda não acabou: vai até hoje."}</p>
      )}
      <div className="row">
        <button className="btn" type="button" onClick={baixar} disabled={!!erro || !qtd}>Baixar planilha</button>
        <button className="btn ghost" type="button" onClick={fechar}>Cancelar</button>
      </div>
      <p className="note">A planilha abre direto no Excel. Itens marcados como fora do rancho não entram.</p>
    </div>
  );
}

const hojeIso = () => isoDe(new Date());
const somarMesIso = (aaaamm, delta) => { const [a, m] = aaaamm.split("-").map(Number); const d = new Date(a, m - 1 + delta, 1); return `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}`; };
