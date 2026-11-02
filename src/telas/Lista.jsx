import { useState } from "react";
import { brl, num, medidaTxt, baixarCSV } from "../util.js";
import { Chips, descr } from "./Itens.jsx";

// "Já peguei" vale só para esta ida ao mercado: fica no aparelho, não no banco.
const lerPegos = () => { try { return new Set(JSON.parse(localStorage.getItem("pegos") || "[]")); } catch { return new Set(); } };
const gravarPegos = (s) => { try { localStorage.setItem("pegos", JSON.stringify([...s])); } catch { /* sem armazenamento local */ } };

export default function Lista({ dados }) {
  const [pegos, setPegos] = useState(lerPegos);
  const itens = dados.itens.filter((g) => ["comprar", "acabando"].includes(dados.situacao[g.id]));
  const trocarPego = (id) => { const s = new Set(pegos); s.has(id) ? s.delete(id) : s.add(id); setPegos(s); gravarPegos(s); };

  let estimativa = 0, economia = 0;
  const linhas = itens.map((g) => {
    const u = g.ultima ?? g.ultimoReg;
    const qtd = g.ultima ? g.qtdUlt : 1;
    const custo = g.ultima ? g.totUlt : u.valor_unitario;
    estimativa += custo;
    let melhor = null;
    if (g.melhor && g.melhor.mercado !== u.mercado && g.melhor.preco_referencia < u.preco_referencia) {
      melhor = g.melhor;
      economia += Math.max(0, custo - g.melhor.preco_referencia * u.tamanho * qtd);
    }
    return { g, u, qtd, custo, melhor };
  });
  const porCat = Object.entries(linhas.reduce((m, l) => ((m[l.g.categoria] ??= []).push(l), m), {})).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));

  function exportar() {
    baixarCSV("lista-de-compras.csv", ["Item", "Categoria", "Situação", "Quantidade", "Último preço", "Último mercado", "Estimativa", "Melhor mercado", "Melhor preço por medida"],
      linhas.map((l) => [l.g.nome, l.g.categoria, dados.situacao[l.g.id], l.qtd, l.u.valor_unitario, l.u.mercado, Math.round(l.custo * 100) / 100,
        l.melhor?.mercado ?? l.u.mercado, Math.round((l.melhor ?? l.u).preco_referencia * 100) / 100]));
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi main"><span className="lbl">Estimativa da lista</span><span className="money">{brl(estimativa)}</span><span style={{ fontSize: ".8rem" }}>{itens.length} itens · pelo último preço pago</span></div>
        <div className="kpi"><span className="lbl">Economia possível</span><span className="money">{brl(economia)}</span><span className="note">comprando cada item onde estava mais barato</span></div>
        <div className="kpi"><span className="lbl">Já no carrinho</span><span className="money">{itens.filter((g) => pegos.has(g.id)).length} de {itens.length}</span><span className="note">marcados nesta ida</span></div>
      </div>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>O que comprar</h2>
          <div className="row">
            <button className="btn ghost" onClick={exportar} disabled={!itens.length}>Exportar lista</button>
            <button className="btn ghost" onClick={() => { setPegos(new Set()); gravarPegos(new Set()); }}>Desmarcar o que já peguei</button>
          </div>
        </div>
        <p className="note">Toque no item para marcar que já está no carrinho. A estimativa repete a quantidade e o último preço pago; em verde, o mercado onde você viu o menor preço.</p>
        {!itens.length && <p className="empty">A lista está vazia. Na aba Itens, marque como <b>Acabando</b> ou <b>Comprar</b> o que precisa repor.</p>}
        {porCat.map(([cat, ls]) => (
          <section key={cat} className="grupo-lista">
            <div className="lbl">{cat} · {ls.length}</div>
            <div className="cartoes">
              {ls.map(({ g, u, qtd, custo, melhor }) => {
                const pego = pegos.has(g.id);
                return (
                  <article className={"cartao" + (pego ? " pego" : "") + (dados.situacao[g.id] === "comprar" ? " urgente" : "")} key={g.id}>
                    <label className="cartao-topo">
                      <input type="checkbox" id={"pego-" + g.id} checked={pego} onChange={() => trocarPego(g.id)} aria-label={`${g.nome}: já está no carrinho`} />
                      <span className="marca-pego" aria-hidden="true" />
                      <span className="cartao-nome"><b>{g.nome}</b><small>{descr(u)}</small></span>
                    </label>
                    <div className="cartao-preco">
                      <span className="money">{brl(custo)}</span>
                      <span className="ref">{num(qtd)} × {brl(u.valor_unitario)} · {u.mercado}</span>
                    </div>
                    {melhor && <div className="tag good">Mais barato: {melhor.mercado} · {brl(melhor.preco_referencia)}/{medidaTxt[g.medida]}</div>}
                    <Chips item={g} dados={dados} />
                  </article>);
              })}
            </div>
          </section>))}
      </div>
    </>
  );
}
