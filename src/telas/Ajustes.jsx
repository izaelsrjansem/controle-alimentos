import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { lerPreferencia, salvarPreferencia } from "../tema.js";
import { CampoSenha } from "./Login.jsx";

const quando = (iso) => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca";
const registrar = (acao, descricao) => supabase.rpc("registrar", { p_acao: acao, p_descricao: descricao ?? null }).then(() => {}, () => {});

export default function Ajustes({ membro, email }) {
  return (
    <>
      <MinhaConta membro={membro} email={email} />
      <Aparencia />
      {membro?.papel === "admin" && <Administracao />}
    </>
  );
}

/* ---------- Minha conta: trocar a senha e sair ---------- */
function MinhaConta({ membro, email }) {
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ atual: "", nova: "", repetir: "" });
  const [msg, setMsg] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });

  async function trocar(e) {
    e.preventDefault();
    if (!f.atual) return setMsg({ tipo: "erro", texto: "Digite a senha atual." });
    if (f.nova.length < 8) return setMsg({ tipo: "erro", texto: "A senha nova precisa de pelo menos 8 caracteres." });
    if (f.nova !== f.repetir) return setMsg({ tipo: "erro", texto: "A confirmação não é igual à senha nova." });
    if (f.nova === f.atual) return setMsg({ tipo: "erro", texto: "A senha nova precisa ser diferente da atual." });
    setSalvando(true); setMsg(null);
    // confere a senha atual antes de trocar
    const { error: e1 } = await supabase.auth.signInWithPassword({ email, password: f.atual });
    if (e1) { setSalvando(false); return setMsg({ tipo: "erro", texto: "A senha atual está incorreta." }); }
    const { error } = await supabase.auth.updateUser({ password: f.nova });
    setSalvando(false);
    if (error) return setMsg({ tipo: "erro", texto: "Não consegui trocar a senha: " + error.message });
    try { if (window.PasswordCredential) await navigator.credentials.store(new window.PasswordCredential({ id: email, password: f.nova, name: email })); } catch { /* sem gerenciador */ }
    registrar("trocou a própria senha");
    setF({ atual: "", nova: "", repetir: "" }); setAberto(false);
    setMsg({ tipo: "ok", texto: "Senha alterada. Use a senha nova da próxima vez que entrar." });
  }

  return (
    <div className="panel">
      <h2>Minha conta</h2>
      <div className="conta">
        <div><b>{membro?.nome || email.split("@")[0]}</b><div className="note">{email} · {membro?.papel === "admin" ? "administrador" : "membro"}</div></div>
      </div>
      {msg && <div className={msg.tipo} role="alert">{msg.texto}</div>}
      {aberto ? (
        <form className="trocar-senha" onSubmit={trocar} noValidate>
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <div className="campo"><label className="lbl" htmlFor="senha-atual">Senha atual</label>
            <CampoSenha id="senha-atual" valor={f.atual} aoMudar={set("atual")} autoComplete="current-password" /></div>
          <div className="campo"><label className="lbl" htmlFor="senha-nova">Senha nova</label>
            <CampoSenha id="senha-nova" valor={f.nova} aoMudar={set("nova")} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" /></div>
          <div className="campo"><label className="lbl" htmlFor="senha-repetir">Repita a senha nova</label>
            <CampoSenha id="senha-repetir" valor={f.repetir} aoMudar={set("repetir")} autoComplete="new-password" /></div>
          <div className="row">
            <button className="btn" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar senha nova"}</button>
            <button className="btn ghost" type="button" onClick={() => { setAberto(false); setMsg(null); setF({ atual: "", nova: "", repetir: "" }); }}>Cancelar</button>
          </div>
        </form>
      ) : (
        <div className="row">
          <button className="btn ghost" type="button" onClick={() => { setAberto(true); setMsg(null); }}>Alterar minha senha</button>
          <button className="btn ghost" type="button" onClick={() => supabase.auth.signOut()}>Sair</button>
          <button className="sair" type="button" onClick={() => supabase.auth.signOut({ scope: "global" })}>Sair de todos os aparelhos</button>
        </div>
      )}
    </div>
  );
}

/* ---------- Aparência: vale para este aparelho ---------- */
function Aparencia() {
  const [pref, setPref] = useState(lerPreferencia);
  const escolher = (p) => { salvarPreferencia(p); setPref(p); };
  return (
    <div className="panel">
      <h2>Aparência</h2>
      <div className="opcoes" role="group" aria-label="Tema da tela">
        {[["auto", "Automática", "Clara de dia (6h às 18h), escura à noite"], ["escuro", "Escura", "Sempre escura"], ["claro", "Clara", "Sempre clara"]].map(([k, t, d]) => (
          <button key={k} type="button" aria-pressed={pref === k} onClick={() => escolher(k)}><b>{t}</b><small>{d}</small></button>))}
      </div>
      <p className="note">A escolha fica guardada neste aparelho.</p>
    </div>
  );
}

/* ---------- Administração: só para o administrador da casa ---------- */
async function chamar(corpo) {
  const { data, error } = await supabase.functions.invoke("admin-usuarios", { body: corpo });
  if (error) {
    let texto = error.message;
    try { texto = (await error.context.json()).erro ?? texto; } catch { /* resposta sem JSON */ }
    throw new Error(texto);
  }
  return data;
}

function Administracao() {
  const [usuarios, setUsuarios] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [link, setLink] = useState(null);

  const listar = useCallback(async () => {
    try { setUsuarios((await chamar({ acao: "listar" })).usuarios); }
    catch (e) { setAviso({ tipo: "erro", texto: e.message }); }
  }, []);
  useEffect(() => { listar(); }, [listar]);

  async function executar(corpo) {
    setAviso(null); setLink(null);
    try {
      const r = await chamar(corpo);
      if (r.link) setLink({ url: r.link, texto: r.aviso });
      else if (r.aviso) setAviso({ tipo: "ok", texto: r.aviso });
      listar();
      return true;
    } catch (e) { setAviso({ tipo: "erro", texto: e.message }); return false; }
  }

  return (
    <>
      {aviso && <div className={aviso.tipo}>{aviso.texto}</div>}
      {link && <LinkParaCopiar {...link} />}
      <Usuarios usuarios={usuarios} executar={executar} />
      <Convidar executar={executar} />
      <Auditoria usuarios={usuarios} />
    </>
  );
}

function LinkParaCopiar({ url, texto }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => { try { await navigator.clipboard.writeText(url); setCopiado(true); } catch { /* o usuário copia à mão */ } };
  const whats = "https://wa.me/?text=" + encodeURIComponent("Seu acesso ao Despensa e Preços: abra o link e crie sua senha.\n" + url);
  return (
    <div className="panel">
      <h2>Link gerado</h2>
      <p className="note">{texto ?? "Mande este link para a pessoa. Ao abrir, ela cria a senha e já entra na casa."} O link vale por 24 horas e só funciona uma vez.</p>
      <div className="link-copiar"><input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link" />
        <button className="btn" type="button" onClick={copiar}>{copiado ? "Copiado" : "Copiar"}</button></div>
      <div className="row"><a className="btn ghost" href={whats} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Mandar pelo WhatsApp</a></div>
    </div>
  );
}

function Usuarios({ usuarios, executar }) {
  const [senhaDe, setSenhaDe] = useState(null);
  const [senha, setSenha] = useState("");
  const [excluindo, setExcluindo] = useState(null);

  if (!usuarios) return <div className="panel"><h2>Usuários da casa</h2><p className="carregando">Carregando…</p></div>;
  return (
    <div className="panel">
      <h2>Usuários da casa</h2>
      <p className="note">Todos os usuários veem e alteram as mesmas compras, itens, preços e despensa.</p>
      <div className="list">{usuarios.map((u) => (
        <div className="usuario" key={u.user_id}>
          <div>
            <div className="nm">{u.nome || u.email.split("@")[0]} {u.eu && <span className="tag">você</span>} <span className={"tag" + (u.papel === "admin" ? " good" : "")}>{u.papel === "admin" ? "administrador" : "membro"}</span></div>
            <div className="note">{u.email}</div>
            <div className="note">{u.ultimo_login ? <>Último login: {quando(u.ultimo_login)} · última atividade: {quando(u.ultima_atividade)}</> : "Ainda não criou a senha (convite pendente)"}</div>
          </div>
          <div />
          {!u.eu && <div className="acoes">
            {senhaDe === u.user_id ? (
              <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await executar({ acao: "senha", user_id: u.user_id, senha })) { setSenhaDe(null); setSenha(""); } }}>
                <input type="password" minLength={8} required autoComplete="new-password" placeholder="Nova senha (mín. 8)" value={senha} onChange={(e) => setSenha(e.target.value)} style={{ width: 200 }} />
                <button className="btn">Salvar senha</button>
                <button className="btn ghost" type="button" onClick={() => { setSenhaDe(null); setSenha(""); }}>Cancelar</button>
              </form>
            ) : excluindo === u.user_id ? (
              <span className="row">Excluir {u.email}? As compras lançadas continuam.
                <button className="btn" onClick={async () => { await executar({ acao: "remover", user_id: u.user_id }); setExcluindo(null); }}>Confirmar exclusão</button>
                <button className="btn ghost" onClick={() => setExcluindo(null)}>Cancelar</button></span>
            ) : (<>
              <button className="btn ghost" onClick={() => setSenhaDe(u.user_id)}>Definir senha</button>
              <button className="btn ghost" onClick={() => executar({ acao: "link_senha", user_id: u.user_id })}>Gerar link de nova senha</button>
              <button className="btn ghost" onClick={() => executar({ acao: "link_senha", user_id: u.user_id, enviar: true })}>Enviar nova senha por e-mail</button>
              <button className="btn ghost" onClick={() => executar({ acao: "papel", user_id: u.user_id, papel: u.papel === "admin" ? "membro" : "admin" })}>
                {u.papel === "admin" ? "Tirar de administrador" : "Tornar administrador"}</button>
              <button className="sair" onClick={() => setExcluindo(u.user_id)}>Excluir usuário</button>
            </>)}
          </div>}
        </div>))}</div>
    </div>
  );
}

function Convidar({ executar }) {
  const [f, setF] = useState({ nome: "", email: "", papel: "membro" });
  const [enviando, setEnviando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function ir(enviar) {
    if (!f.email.trim()) return;
    setEnviando(true);
    if (await executar({ acao: "convidar", ...f, enviar })) setF({ nome: "", email: "", papel: "membro" });
    setEnviando(false);
  }
  return (
    <form className="panel" onSubmit={(e) => { e.preventDefault(); ir(false); }}>
      <h2>Convidar alguém para a casa</h2>
      <div className="form">
        <label>Nome<input value={f.nome} onChange={set("nome")} placeholder="Maria" /></label>
        <label>E-mail<input type="email" required value={f.email} onChange={set("email")} placeholder="maria@gmail.com" /></label>
        <label>Papel<select value={f.papel} onChange={set("papel")}><option value="membro">Membro</option><option value="admin">Administrador</option></select></label>
      </div>
      <div className="row">
        <button className="btn" disabled={enviando}>Gerar link de convite</button>
        <button className="btn ghost" type="button" disabled={enviando} onClick={() => ir(true)}>Enviar convite por e-mail</button>
      </div>
      <p className="note">O link você manda pelo WhatsApp e sempre funciona. O e-mail sai pelo serviço gratuito do Supabase, que só entrega para endereços autorizados e poucas vezes por hora; se falhar, use o link.</p>
    </form>
  );
}

function Auditoria({ usuarios }) {
  const [linhas, setLinhas] = useState(null);
  const [quem, setQuem] = useState("");
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let q = supabase.from("auditoria").select("id,user_id,email,acao,descricao,criado_em").order("criado_em", { ascending: false }).limit(300);
    if (quem) q = q.eq("user_id", quem);
    q.then(({ data, error }) => { if (error) setErro(error.message); else setLinhas(data); });
  }, [quem]);

  const nome = (l) => usuarios?.find((u) => u.user_id === l.user_id)?.nome || l.email || "usuário excluído";
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Auditoria</h2>
        <select value={quem} onChange={(e) => setQuem(e.target.value)} aria-label="Filtrar por usuário" style={{ width: "auto" }}>
          <option value="">Todos os usuários</option>
          {(usuarios ?? []).map((u) => <option key={u.user_id} value={u.user_id}>{u.nome || u.email}</option>)}
        </select>
      </div>
      <p className="note">Entradas no app, telas abertas, compras lançadas ou apagadas, itens excluídos ou marcados fora do rancho, preços anotados e mudanças de usuários. Últimos 300 registros.</p>
      {erro && <div className="erro">{erro}</div>}
      {!linhas ? <p className="carregando">Carregando…</p> : !linhas.length ? <p className="empty">Nada registrado ainda.</p> : (
        <div className="list">{linhas.map((l) => (
          <div className="log" key={l.id}>
            <time dateTime={l.criado_em}>{quando(l.criado_em)}</time>
            <div><b>{l.acao}</b>{l.descricao && <> · {l.descricao}</>}<div className="quem">{nome(l)}</div></div>
          </div>))}</div>
      )}
    </div>
  );
}
