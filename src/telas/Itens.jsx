import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase.js";
import { definirSituacao } from "../dados.js";
import { brl, num, dataBR, medidaTxt, NAO_ALIMENTO, CATEGORIAS, TIPO_DA_CATEGORIA } from "../util.js";

const SITUACOES = [["tenho", "Tenho"], ["acabando", "Acabando"], ["comprar", "Comprar"]];

export function Chips({ item, dados }) {
  const atual = dados.situacao[item.id] ?? "";
  const [erro, setErro] = useState(false);
  async function trocar(s) {
    const nova = atual === s ? "" : s;
    setErro(false);
    dados.setSituacaoLocal(item.id, nova);
    const { error } = await definirSituacao(item.id, nova);
    if (error) { dados.setSituacaoLocal(item.id, atual); setErro(true); }
  }
  return (
    <>
      <span className="chips" role="group" aria-label="Situação em casa">
        {SITUACOES.map(([s, r]) => <button key={s} type="button" data-s={s} aria-pressed={atual === s} onClick={() => trocar(s)}>{r}</button>)}
      </span>
      {erro && <span className="tag bad">não salvou, tente de novo</span>}
    </>
  );
}

export const descr = (r) => [r.marca, r.embalagem].filter(Boolean).join(" · ");

export function VarTag({ v }) {
  if (v == null || Math.abs(v) < 0.005) return null;
  return <span className={"tag " + (v > 0 ? "bad" : "good")}>{v > 0 ? "▲" : "▼"} {Math.abs(v * 100).toFixed(0)}%</span>;
}

const porCategoria = (lista) => Object.entries(lista.reduce((m, g) => ((m[g.categoria] ??= []).push(g), m), {}))
  .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));

export default function Itens({ dados }) {
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("");
  const [tipo, setTipo] = useState("alimento");
  const [aberto, setAberto] = useState(null);

  const q = busca.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const norm = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const cats = [...new Set(dados.itens.map((g) => g.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const lista = dados.itens.filter((g) =>
    (tipo !== "alimento" || !NAO_ALIMENTO.has(g.tipo)) && (tipo !== "outros" || NAO_ALIMENTO.has(g.tipo)) &&
    (!cat || g.categoria === cat) && (!q || norm(g.nome).includes(q) || g.regs.some((r) => norm(r.marca).includes(q))));

  return (
    <div className="panel">
      <div className="row">
        <div className="grow"><input id="busca" type="search" placeholder="Buscar item ou marca (ex.: arroz, Ninho)" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar item" /></div>
        <div style={{ flex: "0 1 200px" }}><select id="cat" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>{cats.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div style={{ flex: "0 1 170px" }}><select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="alimento">Só alimentos</option><option value="">Tudo</option><option value="outros">Limpeza e higiene</option></select></div>
      </div>
      <p className="note">Toque no nome para ver o histórico de preços. Marque como está em casa: <b>Tenho</b>, <b>Acabando</b> ou <b>Comprar</b>. O que estiver em Acabando ou Comprar vai para a Lista de compras.</p>
      {!lista.length && <p className="empty">Nenhum item encontrado com esse filtro.</p>}
      {porCategoria(lista).map(([categoria, itens]) => (
        <section key={categoria} className="grupo-lista">
          <div className="lbl">{categoria} · {itens.length}</div>
          <div className="cartoes">
            {itens.map((g) => { const u = g.ultima ?? g.ultimoReg; return (
              <article className="cartao" data-s={dados.situacao[g.id] ?? ""} key={g.id}>
                <button className="cartao-topo cartao-abrir" type="button" onClick={() => setAberto(g.id)} aria-label={`${g.nome}: ver histórico de preços`}>
                  <span className="cartao-nome"><b>{g.nome}</b><small>{descr(u) || "sem marca"}</small></span>
                  <span className="cartao-seta" aria-hidden="true">›</span>
                </button>
                <div className="cartao-preco">
                  <span className="money">{brl(u.valor_unitario)}</span>
                  <span className="ref">{brl(u.preco_referencia)}/{medidaTxt[g.medida]} · {g.ultima
                    ? `comprou ${num(g.qtdUlt)} em ${dataBR(u.data)}, ${u.mercado}`
                    : `preço visto em ${dataBR(u.data)}, ${u.mercado}`}</span>
                </div>
                {((g.variacao != null && Math.abs(g.variacao) >= 0.005) || (g.porMercado.size > 1 && g.melhor)) && <div className="row" style={{ gap: 6 }}>
                  <VarTag v={g.variacao} />
                  {g.porMercado.size > 1 && g.melhor && <span className="tag good">Mais barato: {g.melhor.mercado}</span>}
                </div>}
                <Chips item={g} dados={dados} />
              </article>); })}
          </div>
        </section>))}
      {aberto && <Historico item={dados.itens.find((g) => g.id === aberto)} dados={dados} fechar={() => setAberto(null)} />}
    </div>
  );
}

function Historico({ item, dados, fechar }) {
  const ref = useRef(null);
  const [form, setForm] = useState({ nome: item.nome, categoria: item.categoria, tipo: item.tipo, medida: item.medida });
  const [msg, setMsg] = useState(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const menor = Math.min(...item.regs.map((r) => r.preco_referencia ?? Infinity));

  async function salvar() {
    const { error } = await supabase.from("produtos").update(form).eq("id", item.id);
    if (error) return setMsg({ tipo: "erro", texto: /duplicate/.test(error.message) ? "Já existe outro item com esse nome." : error.message });
    setMsg({ tipo: "ok", texto: "Item atualizado." }); dados.recarregar();
  }

  return (
    <dialog ref={ref} onClose={fechar} onClick={(e) => e.target === ref.current && ref.current.close()} aria-labelledby="hist-titulo">
      <div className="hd"><div><div className="lbl">{item.categoria}</div><h2 id="hist-titulo">{item.nome}</h2></div>
        <button className="x" type="button" onClick={() => ref.current.close()} aria-label="Fechar">×</button></div>
      <div className="bd">
        <div className="tablewrap"><table>
          <thead><tr><th>Data</th><th>Mercado</th><th>Marca · emb.</th><th className="r">Qtd</th><th className="r">Preço</th><th className="r">Por {medidaTxt[item.medida]}</th></tr></thead>
          <tbody>{item.regs.map((r) => (
            <tr key={r.origem + r.id}>
              <td className="num">{dataBR(r.data)}</td>
              <td>{r.mercado}{r.origem === "cotacao" && <div className="note">só preço visto</div>}</td>
              <td>{descr(r)}</td>
              <td className="r num">{r.quantidade != null ? num(r.quantidade) : "—"}</td>
              <td className="r money">{brl(r.valor_unitario)}{r.desconto > 0 && <div className="note">desc. {brl(r.desconto)}</div>}</td>
              <td className={"r money" + (r.preco_referencia === menor && item.regs.length > 1 ? " best" : "")}>{brl(r.preco_referencia)}</td>
            </tr>))}</tbody>
        </table></div>
        <div className="row"><Chips item={item} dados={dados} /></div>
        <details>
          <summary className="lbl" style={{ cursor: "pointer" }}>Corrigir nome, categoria ou medida</summary>
          <div className="form" style={{ marginTop: 10 }}>
            <label>Nome<input id="h-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
            <label>Categoria<select id="h-cat" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value, tipo: TIPO_DA_CATEGORIA[e.target.value] ?? (NAO_ALIMENTO.has(form.tipo) ? "alimento" : form.tipo) })}>
              {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>Medida do preço<select id="h-med" value={form.medida} onChange={(e) => setForm({ ...form, medida: e.target.value })}>
              <option value="kg">por kg</option><option value="L">por litro</option><option value="un">por unidade</option></select></label>
            <label style={{ justifyContent: "flex-end" }}><button className="btn" type="button" onClick={salvar}>Salvar</button></label>
          </div>
          {msg && <div className={msg.tipo} style={{ marginTop: 8 }}>{msg.texto}</div>}
        </details>
      </div>
    </dialog>
  );
}
