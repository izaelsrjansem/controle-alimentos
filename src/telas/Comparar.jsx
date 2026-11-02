import { brl, dataBR, medidaTxt } from "../util.js";

export default function Comparar({ dados, ir }) {
  const itens = dados.itens.filter((g) => g.porMercado.size >= 2);
  const mercados = [...new Set(itens.flatMap((g) => [...g.porMercado.keys()]))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const vitorias = new Map(mercados.map((m) => [m, 0]));
  for (const g of itens) vitorias.set(g.melhor.mercado, vitorias.get(g.melhor.mercado) + 1);
  const maior = Math.max(0, ...vitorias.values());

  if (!itens.length) {
    const todos = [...new Set(dados.precos.map((r) => r.mercado))];
    return (
      <div className="panel">
        <h2>Menor preço por mercado</h2>
        <div className="banner">Por enquanto há preços de {todos.length === 1 ? "um só mercado" : `${todos.length} mercados sem itens em comum`} ({todos.join(", ") || "nenhum"}).
          A comparação aparece quando o mesmo item tiver preço em dois mercados.</div>
        <div className="row"><button className="btn" onClick={() => ir("lancar")}>Anotar preços de outro mercado</button></div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Menor preço por mercado</h2>
      <p className="note">Comparação pelo preço por kg, litro ou unidade, para que embalagens diferentes fiquem na mesma régua. Vale o preço mais recente de cada mercado; em verde, o mais barato.</p>
      <div className="row">{mercados.map((m) => (
        <span key={m} className={"tag" + (vitorias.get(m) === maior ? " good" : "")}>{m}: mais barato em {vitorias.get(m)} de {itens.length}</span>))}</div>
      <div className="tablewrap"><table>
        <thead><tr><th>Item</th>{mercados.map((m) => <th key={m} className="r">{m}</th>)}<th className="r">Diferença</th></tr></thead>
        <tbody>{itens.map((g) => {
          const vals = [...g.porMercado.values()].map((r) => r.preco_referencia);
          const mn = Math.min(...vals), mx = Math.max(...vals);
          return (
            <tr key={g.id}>
              <td>{g.nome}<div className="note">por {medidaTxt[g.medida]}</div></td>
              {mercados.map((m) => { const r = g.porMercado.get(m); return r
                ? <td key={m} className={"r money" + (r.preco_referencia === mn ? " best" : "")}>{brl(r.preco_referencia)}<div className="note">{dataBR(r.data)}</div></td>
                : <td key={m} className="r note">—</td>; })}
              <td className="r money">{mx ? Math.round((mx - mn) / mx * 100) : 0}%</td>
            </tr>); })}</tbody>
      </table></div>
    </div>
  );
}
