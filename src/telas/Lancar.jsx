import { useMemo, useState } from "react";
import { supabase } from "../supabase.js";
import { brl, dataBR, hoje, prepararFoto, mesmaCompra, CATEGORIAS, TIPO_DA_CATEGORIA } from "../util.js";

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const linhaVazia = () => ({ chave: crypto.randomUUID(), nome: "", marca: "", categoria: "Mercearia", tipo: "alimento", embalagem: "",
  tamanho: 1, medida: "un", quantidade: 1, valor_unitario: "", desconto: 0, valor_total: 0, duvida: false, descricao_cupom: "" });

export default function Lancar({ dados, aoSalvar }) {
  const [modo, setModo] = useState("foto");
  return (
    <>
      <div className="row" role="tablist" aria-label="Como lançar">
        {[["foto", "Foto do cupom (leitura automática)"], ["colar", "Colar leitura do Claude"], ["manual", "Digitar a compra"], ["preco", "Anotar preço visto"]].map(([k, r]) => (
          <button key={k} className={"btn" + (modo === k ? "" : " ghost")} onClick={() => setModo(k)} aria-pressed={modo === k}>{r}</button>))}
      </div>
      {modo === "colar" && <Colar dados={dados} aoSalvar={aoSalvar} />}
      {modo === "foto" && <PorFoto dados={dados} aoSalvar={aoSalvar} />}
      {modo === "manual" && <Revisao dados={dados} inicial={{ mercado: "", data: hoje(), pagamento: "", itens: [linhaVazia(), linhaVazia(), linhaVazia()] }} origem="manual" aoSalvar={aoSalvar} />}
      {modo === "preco" && <AnotarPreco dados={dados} />}
    </>
  );
}

/* ---------- Foto -> IA -> conferência ---------- */
function PorFoto({ dados, aoSalvar }) {
  const [etapa, setEtapa] = useState("escolher");
  const [previas, setPrevias] = useState([]);
  const [erro, setErro] = useState(null);
  const [leitura, setLeitura] = useState(null);

  async function ler(arquivos) {
    if (!arquivos.length) return;
    setErro(null); setEtapa("enviando");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const partes = [];
      for (const a of arquivos) partes.push(...await prepararFoto(a));
      if (partes.length > 6) throw new Error("São partes demais. Envie no máximo 6 fotos (ou corte o cupom em menos pedaços).");
      setPrevias(partes.map((b) => URL.createObjectURL(b)));
      const lote = Date.now();
      const caminhos = [];
      for (const [i, b] of partes.entries()) {
        const caminho = `${user.id}/${lote}-${i + 1}.jpg`;
        const { error } = await supabase.storage.from("cupons").upload(caminho, b, { contentType: "image/jpeg" });
        if (error) throw new Error("Falha ao enviar a foto: " + error.message);
        caminhos.push(caminho);
      }
      setEtapa("lendo");
      const { data, error } = await supabase.functions.invoke("ler-cupom", { body: { caminhos } });
      if (error) {
        let texto = error.message;
        try { texto = (await error.context.json()).erro ?? texto; } catch { /* resposta sem corpo JSON */ }
        throw new Error(texto);
      }
      setLeitura({ ...data, caminhos });
      setEtapa("conferir");
    } catch (e) { setErro(e.message); setEtapa("escolher"); }
  }

  if (etapa === "conferir" && leitura) {
    return (
      <>
        <AvisoConferencia leitura={leitura} />
        {previas.length > 0 && <div className="fotos">{previas.map((u) => <img key={u} src={u} alt="Parte do cupom enviada" />)}</div>}
        <Revisao dados={dados} origem="foto" fotos={leitura.caminhos} aoSalvar={aoSalvar} inicial={inicialDaLeitura(leitura)} />
      </>
    );
  }

  return (
    <div className="panel">
      <h2>Foto do cupom</h2>
      <div className="drop">
        {etapa === "escolher" && <>
          <p style={{ margin: 0 }}>Fotografe o cupom <b>em pé</b>, preenchendo a tela, com boa luz. Cupom comprido: tire 2 ou 3 fotos, de cima para baixo, repetindo um pedaço entre elas.</p>
          <label className="btn" style={{ display: "inline-block" }}>
            Escolher ou tirar foto
            <input type="file" accept="image/*" multiple hidden onChange={(e) => ler([...e.target.files])} />
          </label>
        </>}
        {etapa === "enviando" && <p className="carregando">Preparando e enviando a foto…</p>}
        {etapa === "lendo" && <p className="carregando">Lendo os itens do cupom. Isso leva de 20 segundos a 1 minuto e meio…</p>}
        {previas.length > 0 && etapa !== "escolher" && <div className="fotos">{previas.map((u) => <img key={u} src={u} alt="Parte do cupom" />)}</div>}
      </div>
      {erro && <div className="erro">{erro}</div>}
      <p className="note">Nada é salvo antes de você conferir. A foto fica guardada junto com a compra, como comprovante.</p>
    </div>
  );
}

function AvisoConferencia({ leitura }) {
  const c = leitura.conferencia;
  return (
    <div className={c.bate_total && c.bate_desconto ? "ok" : "banner"}>
      {c.bate_total && c.bate_desconto
        ? `A soma dos ${leitura.itens.length} itens bate com o cupom: ${brl(leitura.total_bruto)} − ${brl(leitura.desconto_total)} de desconto = ${brl(leitura.total_pago)}.`
        : `Atenção: a soma dos itens lidos (${brl(c.soma_itens)}) não bate com o total do cupom (${brl(leitura.total_bruto)}). Confira as linhas em amarelo antes de salvar.`}
      {leitura.observacoes && <div style={{ marginTop: 6 }}>{leitura.observacoes}</div>}
    </div>
  );
}

const inicialDaLeitura = (l) => ({ mercado: l.mercado, data: l.data || hoje(), pagamento: l.pagamento,
  itens: l.itens.map((i) => ({ ...linhaVazia(), ...i })) });

/* ---------- Texto colado do Claude (mesmo formato da função ler-cupom) -> conferência ---------- */
// Aceita 7.99, "7,99" ou "R$ 1.069,36"
function numero(v) {
  if (typeof v === "number") return v;
  let t = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  return Number(t) || 0;
}

export function interpretarLeitura(texto) {
  const ini = texto.indexOf("{"), fim = texto.lastIndexOf("}");
  if (ini < 0 || fim < ini) throw new Error("Não encontrei a leitura no texto colado. Copie a resposta inteira do Claude.");
  let c;
  try { c = JSON.parse(texto.slice(ini, fim + 1)); } catch { throw new Error("O texto colado está incompleto ou foi alterado. Copie de novo a resposta do Claude."); }
  if (!Array.isArray(c.itens) || !c.itens.length) throw new Error("A leitura colada não tem itens.");

  const itens = c.itens.map((i) => {
    const categoria = CATEGORIAS.includes(i.categoria) ? i.categoria : "Outros";
    const quantidade = numero(i.quantidade) || 1, valor_unitario = numero(i.valor_unitario), desconto = numero(i.desconto);
    return { nome: String(i.nome ?? "").trim(), marca: i.marca ?? "", categoria,
      tipo: ["alimento", "limpeza", "higiene", "utilidade"].includes(i.tipo) ? i.tipo : (TIPO_DA_CATEGORIA[categoria] ?? "alimento"),
      embalagem: i.embalagem ?? "", tamanho: numero(i.tamanho) || 1, medida: ["kg", "L", "un"].includes(i.medida) ? i.medida : "un",
      quantidade, valor_unitario, desconto,
      valor_total: i.valor_total == null || i.valor_total === "" ? r2(quantidade * valor_unitario - desconto) : numero(i.valor_total),
      duvida: !!i.duvida, descricao_cupom: i.descricao_cupom ?? "" };
  });
  const soma = itens.reduce((s, i) => s + i.valor_total + i.desconto, 0);
  const descontos = itens.reduce((s, i) => s + i.desconto, 0);
  const total_bruto = numero(c.total_bruto) || r2(soma), desconto_total = numero(c.desconto_total);
  return { mercado: c.mercado ?? "", data: /^\d{4}-\d{2}-\d{2}$/.test(c.data ?? "") ? c.data : "", pagamento: c.pagamento ?? "",
    total_bruto, desconto_total, total_pago: numero(c.total_pago) || r2(total_bruto - desconto_total), observacoes: c.observacoes ?? "", itens,
    conferencia: { soma_itens: r2(soma), soma_descontos: r2(descontos),
      bate_total: Math.abs(soma - total_bruto) < 0.02, bate_desconto: Math.abs(descontos - desconto_total) < 0.02 } };
}

function Colar({ dados, aoSalvar }) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState(null);
  const [leitura, setLeitura] = useState(null);

  if (leitura) {
    return (
      <>
        <AvisoConferencia leitura={leitura} />
        <Revisao dados={dados} origem="foto" aoSalvar={aoSalvar} inicial={inicialDaLeitura(leitura)} />
        <button className="btn ghost" type="button" onClick={() => setLeitura(null)}>Colar outro texto</button>
      </>
    );
  }

  function conferir() {
    try { setErro(null); setLeitura(interpretarLeitura(texto)); } catch (e) { setErro(e.message); }
  }

  return (
    <div className="panel">
      <h2>Colar leitura do Claude</h2>
      <p style={{ marginTop: 0 }}>Mande a foto do cupom no seu Projeto "Cupons de mercado" no Claude, toque em <b>copiar</b> na resposta e cole aqui.</p>
      <textarea id="colar-texto" rows={10} style={{ width: "100%", fontFamily: "monospace" }} value={texto}
        onChange={(e) => setTexto(e.target.value)} placeholder='{"mercado": "Atacadão", "data": "2026-11-02", ...}' />
      <div className="row">
        <button className="btn" type="button" onClick={conferir} disabled={!texto.trim()}>Conferir itens</button>
      </div>
      {erro && <div className="erro">{erro}</div>}
      <p className="note">Nada é salvo antes de você conferir.</p>
    </div>
  );
}

/* ---------- Tabela editável, usada pela foto e pela digitação ---------- */
function Revisao({ dados, inicial, origem, fotos = [], aoSalvar }) {
  const [cab, setCab] = useState({ mercado: inicial.mercado, data: inicial.data, pagamento: inicial.pagamento });
  const [itens, setItens] = useState(inicial.itens);
  const [msg, setMsg] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [repetida, setRepetida] = useState(null);

  const porNome = useMemo(() => new Map(dados.itens.map((g) => [g.nome.toLowerCase(), g])), [dados.itens]);
  const mercados = [...new Set(dados.precos.map((r) => r.mercado))];

  const mudar = (chave, campo, valor) => setItens((ls) => ls.map((l) => {
    if (l.chave !== chave) return l;
    const n = { ...l, [campo]: valor };
    if (campo === "categoria") n.tipo = TIPO_DA_CATEGORIA[valor] ?? "alimento";
    if (["quantidade", "valor_unitario", "desconto"].includes(campo)) n.valor_total = r2(n.quantidade * n.valor_unitario - n.desconto);
    return n;
  }));
  // Item que já existe: puxa categoria, medida e o último preço
  const completar = (chave) => setItens((ls) => ls.map((l) => {
    const g = l.chave === chave && porNome.get(l.nome.trim().toLowerCase());
    if (!g) return l;
    const u = g.ultima ?? g.ultimoReg;
    const n = { ...l, nome: g.nome, categoria: g.categoria, tipo: g.tipo, medida: g.medida,
      marca: l.marca || u.marca || "", embalagem: l.embalagem || u.embalagem || "", tamanho: l.embalagem ? l.tamanho : u.tamanho,
      valor_unitario: l.valor_unitario === "" ? u.valor_unitario : l.valor_unitario };
    n.valor_total = r2(n.quantidade * n.valor_unitario - n.desconto);
    return n;
  }));

  const validos = itens.filter((l) => l.nome.trim() && Number(l.quantidade) > 0 && l.valor_unitario !== "");
  const total = validos.reduce((s, l) => s + Number(l.valor_total), 0);
  const descontos = validos.reduce((s, l) => s + Number(l.desconto || 0), 0);

  async function salvar(mesmoRepetida = false) {
    if (!cab.mercado.trim() || !cab.data) return setMsg("Informe o mercado e a data da compra.");
    if (!validos.length) return setMsg("Inclua pelo menos um item com nome, quantidade e preço.");
    const igual = dados.compras.find((c) => mesmaCompra(c, { data: cab.data, mercado: cab.mercado, total_pago: total }));
    if (igual && !mesmoRepetida) return setRepetida(igual);
    setSalvando(true); setMsg(null); setRepetida(null);
    const { error } = await supabase.rpc("salvar_compra", { p: {
      mercado: cab.mercado.trim(), data: cab.data, pagamento: cab.pagamento || null, origem, foto_paths: fotos,
      itens: validos.map((l) => ({ nome: l.nome.trim(), categoria: l.categoria, tipo: l.tipo, medida: l.medida,
        descricao_cupom: l.descricao_cupom, marca: l.marca, embalagem: l.embalagem, tamanho: Number(l.tamanho) || 1,
        quantidade: Number(l.quantidade), valor_unitario: Number(l.valor_unitario), desconto: Number(l.desconto) || 0, valor_total: Number(l.valor_total) })),
    } });
    setSalvando(false);
    if (error) return setMsg("Não consegui salvar: " + error.message);
    aoSalvar();
  }

  const campo = (l, k, props = {}) => <input id={`${k}-${l.chave}`} value={l[k]} onChange={(e) => mudar(l.chave, k, props.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} {...props} />;

  return (
    <div className="panel">
      <h2>Conferir e salvar</h2>
      <div className="form">
        <label>Mercado<input id="r-mercado" list="lista-mercados" value={cab.mercado} onChange={(e) => setCab({ ...cab, mercado: e.target.value })} placeholder="Atacadão" /></label>
        <label>Data<input id="r-data" type="date" value={cab.data} onChange={(e) => setCab({ ...cab, data: e.target.value })} /></label>
        <label>Pagamento<input id="r-pag" value={cab.pagamento ?? ""} onChange={(e) => setCab({ ...cab, pagamento: e.target.value })} placeholder="Cartão de crédito" /></label>
      </div>
      <datalist id="lista-mercados">{mercados.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="lista-itens">{dados.itens.map((g) => <option key={g.id} value={g.nome} />)}</datalist>

      <div className="tablewrap"><table className="revisao">
        <thead><tr><th>Item</th><th>Marca</th><th>Categoria</th><th>Embalagem</th><th className="r">Tam.</th><th>Medida</th><th className="r">Qtd</th><th className="r">R$ unit.</th><th className="r">Desc.</th><th className="r">Total</th><th /></tr></thead>
        <tbody>{itens.map((l) => (
          <tr key={l.chave} className={l.duvida ? "duvida" : ""}>
            <td style={{ minWidth: 170 }}>{campo(l, "nome", { list: "lista-itens", onBlur: () => completar(l.chave), placeholder: "Arroz tipo 1" })}
              {l.descricao_cupom && <div className="note">{l.descricao_cupom}</div>}</td>
            <td style={{ minWidth: 100 }}>{campo(l, "marca")}</td>
            <td><select id={`cat-${l.chave}`} value={l.categoria} onChange={(e) => mudar(l.chave, "categoria", e.target.value)}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select></td>
            <td style={{ minWidth: 90 }}>{campo(l, "embalagem", { placeholder: "1 kg" })}</td>
            <td style={{ width: 70 }}>{campo(l, "tamanho", { type: "number", step: "0.001", min: "0" })}</td>
            <td><select id={`med-${l.chave}`} value={l.medida} onChange={(e) => mudar(l.chave, "medida", e.target.value)}><option value="kg">kg</option><option value="L">L</option><option value="un">un.</option></select></td>
            <td style={{ width: 70 }}>{campo(l, "quantidade", { type: "number", step: "0.001", min: "0" })}</td>
            <td style={{ width: 80 }}>{campo(l, "valor_unitario", { type: "number", step: "0.01", min: "0" })}</td>
            <td style={{ width: 70 }}>{campo(l, "desconto", { type: "number", step: "0.01", min: "0" })}</td>
            <td className="r money">{brl(l.valor_total)}</td>
            <td><button className="x" type="button" aria-label="Remover item" onClick={() => setItens((ls) => ls.filter((x) => x.chave !== l.chave))}>×</button></td>
          </tr>))}</tbody>
      </table></div>
      <p className="note">Tamanho na medida escolhida: pacote de 500 g = 0,5 kg; garrafa de 900 ml = 0,9 L; fardo com 12 = 12 un. A granel: tamanho 1, medida kg e a quantidade é o peso (0,750).</p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn ghost" type="button" onClick={() => setItens([...itens, linhaVazia()])}>+ Adicionar item</button>
        <div className="row">
          <span className="note">{validos.length} itens · desconto {brl(descontos)} · total <b className="money">{brl(total)}</b></span>
          <button className="btn" onClick={() => salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar compra"}</button>
        </div>
      </div>
      {repetida && <div className="banner">
        Esta compra já foi lançada: {repetida.mercado}, {dataBR(repetida.data)}, {brl(repetida.total_pago)}. Salvar de novo vai contar tudo em dobro.
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ghost" type="button" onClick={() => setRepetida(null)}>Não salvar</button>
          <button className="btn" type="button" onClick={() => salvar(true)} disabled={salvando}>É outra compra, salvar mesmo assim</button>
        </div>
      </div>}
      {msg && <div className="erro">{msg}</div>}
    </div>
  );
}

/* ---------- Preço visto, sem compra ---------- */
function AnotarPreco({ dados }) {
  const vazio = { nome: "", marca: "", mercado: "", data: hoje(), preco: "", tamanho: "", medida: "kg", embalagem: "" };
  const [f, setF] = useState(vazio);
  const [msg, setMsg] = useState(null);
  const porNome = new Map(dados.itens.map((g) => [g.nome.toLowerCase(), g]));
  const mercados = [...new Set(dados.precos.map((r) => r.mercado))];

  function completar() {
    const g = porNome.get(f.nome.trim().toLowerCase());
    if (!g) return;
    const u = g.ultima ?? g.ultimoReg;
    setF({ ...f, nome: g.nome, medida: g.medida, marca: f.marca || u.marca || "", tamanho: f.tamanho || u.tamanho, embalagem: f.embalagem || u.embalagem || "" });
  }
  async function salvar(e) {
    e.preventDefault();
    const g = porNome.get(f.nome.trim().toLowerCase());
    const { error } = await supabase.rpc("anotar_preco", { p: { ...f, nome: f.nome.trim(), mercado: f.mercado.trim(),
      categoria: g?.categoria ?? "Outros", tipo: g?.tipo ?? "alimento", preco: Number(f.preco), tamanho: Number(f.tamanho) || 1 } });
    if (error) return setMsg({ tipo: "erro", texto: "Não consegui salvar: " + error.message });
    setMsg({ tipo: "ok", texto: `Preço de ${f.nome} no ${f.mercado} salvo: ${brl(f.preco)}.` });
    setF({ ...vazio, mercado: f.mercado, data: f.data });
    dados.recarregar();
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <form className="panel" onSubmit={salvar}>
      <h2>Anotar preço visto no mercado</h2>
      <p className="note">Para comparar sem comprar: viu o preço na prateleira, anota aqui.</p>
      <div className="form">
        <label>Item<input id="p-nome" list="lista-itens-p" required value={f.nome} onChange={set("nome")} onBlur={completar} placeholder="Arroz tipo 1" /></label>
        <label>Marca<input id="p-marca" value={f.marca} onChange={set("marca")} placeholder="Biju" /></label>
        <label>Mercado<input id="p-merc" list="lista-mercados-p" required value={f.mercado} onChange={set("mercado")} placeholder="Atacadão" /></label>
        <label>Data<input id="p-data" type="date" required value={f.data} onChange={set("data")} /></label>
        <label>Preço (R$)<input id="p-preco" type="number" step="0.01" min="0" required value={f.preco} onChange={set("preco")} placeholder="5,49" /></label>
        <label>Tamanho<input id="p-tam" type="number" step="0.001" min="0" required value={f.tamanho} onChange={set("tamanho")} placeholder="1" /></label>
        <label>Medida<select id="p-med" value={f.medida} onChange={set("medida")}><option value="kg">kg</option><option value="L">litro</option><option value="un">unidade</option></select></label>
        <label style={{ justifyContent: "flex-end" }}><button className="btn">Salvar preço</button></label>
      </div>
      <datalist id="lista-itens-p">{dados.itens.map((g) => <option key={g.id} value={g.nome} />)}</datalist>
      <datalist id="lista-mercados-p">{mercados.map((m) => <option key={m} value={m} />)}</datalist>
      {msg && <div className={msg.tipo}>{msg.texto}</div>}
    </form>
  );
}
