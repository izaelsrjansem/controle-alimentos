import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { lerPreferencia, salvarPreferencia, PALETAS, lerPaleta, salvarPaleta, FIGURAS, gerarFundo,
  lerPersonalizado, salvarPersonalizado, lerFotoFundo, salvarFotoFundo, prepararFotoFundo, vibrar } from "../tema.js";
import { CampoSenha } from "./Login.jsx";
import { lerBloqueio, salvarBloqueio, biometriaDisponivel, cadastrarBiometria } from "../bloqueio.jsx";

const quando = (iso) => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca";
const registrar = (acao, descricao) => supabase.rpc("registrar", { p_acao: acao, p_descricao: descricao ?? null }).then(() => {}, () => {});

const ICONE = {
  conta: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  seguranca: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  aparencia: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.4-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 11.5h.01M10.5 7.5h.01M15.5 7.5h.01",
  usuarios: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  convidar: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M19 8v6M16 11h6",
  auditoria: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 12h8M8 16h5",
};

// Item do menu de Ajustes: só mostra o conteúdo quando tocado
function Secao({ id, titulo, desc, aberta, alternar, children }) {
  return (
    <section className={"secao" + (aberta ? " aberta" : "")}>
      <button type="button" className="secao-titulo" onClick={() => { vibrar(); alternar(id); }} aria-expanded={aberta} aria-controls={"sec-" + id}>
        <span className="secao-icone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONE[id]} /></svg></span>
        <span className="secao-texto"><b>{titulo}</b><small>{desc}</small></span>
        <span className="secao-seta" aria-hidden="true">›</span>
      </button>
      {aberta && <div className="secao-corpo" id={"sec-" + id}>{children}</div>}
    </section>
  );
}

export default function Ajustes({ membro, email }) {
  const [aberta, setAberta] = useState(null);
  const alternar = (id) => setAberta((a) => (a === id ? null : id));
  const secao = (id, titulo, desc, conteudo) => (
    <Secao key={id} id={id} titulo={titulo} desc={desc} aberta={aberta === id} alternar={alternar}>{conteudo}</Secao>);
  return (
    <div className="menu-ajustes">
      {secao("conta", "Minha conta", "Alterar senha, sair", <MinhaConta membro={membro} email={email} />)}
      {secao("seguranca", "Segurança deste aparelho", "Bloqueio por tempo e Face ID", <Seguranca email={email} />)}
      {secao("aparencia", "Aparência e temas", "Claro, escuro, temas e o seu tema", <Aparencia />)}
      {membro?.papel === "admin" && <Administracao secao={secao} />}
    </div>
  );
}

/* ---------- Segurança deste aparelho: bloqueio por inatividade e Face ID ---------- */
const TEMPOS = [[0, "Desligado"], [30, "30 s"], [60, "1 min"], [90, "1 min 30"], [120, "2 min"], [300, "5 min"], [600, "10 min"],
  [900, "15 min"], [1800, "30 min"], [3600, "1 hora"], [7200, "2 horas"]];
const formatarTempo = (s) => s >= 3600 ? `${+(s / 3600).toFixed(2)} h` : s >= 60 ? `${+(s / 60).toFixed(2)} min` : `${s} s`;

function Seguranca({ email }) {
  const [cfg, setCfg] = useState(lerBloqueio);
  const [temBio, setTemBio] = useState(null);
  const [pers, setPers] = useState({ valor: "", unidade: "60" });
  const [escolhendoPers, setEscolhendoPers] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { biometriaDisponivel().then(setTemBio); }, []);

  const mudar = (novo) => { const c = { ...cfg, ...novo }; setCfg(c); salvarBloqueio(c); };
  const personalizado = cfg.segundos > 0 && !TEMPOS.some(([s]) => s === cfg.segundos);

  function aplicarPersonalizado(e) {
    e.preventDefault();
    const s = Math.round(Number(String(pers.valor).replace(",", ".")) * Number(pers.unidade));
    if (!s || s < 30) return setMsg({ tipo: "erro", texto: "O tempo mínimo é 30 segundos." });
    if (s > 24 * 3600) return setMsg({ tipo: "erro", texto: "O tempo máximo é 24 horas." });
    vibrar(); setEscolhendoPers(false);
    mudar({ segundos: s }); setMsg({ tipo: "ok", texto: `Bloqueio depois de ${formatarTempo(s)} sem uso.` });
  }

  async function ativarBio() {
    setMsg(null);
    try {
      const credencial = await cadastrarBiometria(email);
      mudar({ credencial, acao: "bloquear", segundos: cfg.segundos || 60 });
      registrar("ativou Face ID / digital neste aparelho");
      setMsg({ tipo: "ok", texto: "Face ID / digital ativado neste aparelho." });
    } catch (e) {
      setMsg({ tipo: "erro", texto: e?.name === "NotAllowedError" ? "Cadastro cancelado." : "Este navegador não deixou usar o Face ID: " + (e?.message ?? "erro desconhecido") });
    }
  }

  return (
    <div className="panel">
      <h2>Segurança deste aparelho</h2>
      <p className="note">Depois do tempo escolhido sem mexer no app, a tela fecha e pede o Face ID (ou a digital) ou a senha. Também vale quando você sai do app e volta depois.</p>

      <label className="campo-c" htmlFor="tempo-bloqueio">Fechar a tela depois de
        <select id="tempo-bloqueio" className="lista-grande" value={personalizado || escolhendoPers ? "pers" : String(cfg.segundos)}
          onChange={(e) => {
            vibrar(); setMsg(null);
            if (e.target.value === "pers") { setEscolhendoPers(true); setTimeout(() => document.getElementById("tempo-pers")?.focus(), 50); return; }
            setEscolhendoPers(false); mudar({ segundos: Number(e.target.value) });
          }}>
          {TEMPOS.map(([s, t]) => <option key={s} value={s}>{s ? t + " sem uso" : t}</option>)}
          <option value="pers">{personalizado ? `Personalizado: ${formatarTempo(cfg.segundos)}` : "Personalizado…"}</option>
        </select>
      </label>
      {(personalizado || escolhendoPers) && <form className="row" onSubmit={aplicarPersonalizado} noValidate>
        <input id="tempo-pers" type="number" inputMode="decimal" min="0" step="any" placeholder="Ex.: 45" value={pers.valor} onChange={(e) => setPers({ ...pers, valor: e.target.value })} style={{ width: 110 }} aria-label="Tempo personalizado" />
        <select value={pers.unidade} onChange={(e) => { vibrar(); setPers({ ...pers, unidade: e.target.value }); }} style={{ width: "auto" }} aria-label="Unidade">
          <option value="1">segundos</option><option value="60">minutos</option><option value="3600">horas</option></select>
        <button className="btn ghost" type="submit">Usar este tempo</button>
      </form>}

      <div className="lbl">Quando o tempo acabar</div>
      <div className="opcoes" role="group" aria-label="O que fazer">
        <button type="button" aria-pressed={cfg.acao === "bloquear"} onClick={() => { vibrar(); mudar({ acao: "bloquear" }); }}><b>Bloquear a tela</b><small>Libera com Face ID, digital ou senha</small></button>
        <button type="button" aria-pressed={cfg.acao === "sair"} onClick={() => { vibrar(); mudar({ acao: "sair" }); }}><b>Sair da conta</b><small>Faz logout; para voltar, e-mail e senha</small></button>
      </div>

      <div className="lbl">Face ID / digital</div>
      {temBio === false ? <p className="note">Este aparelho ou navegador não oferece Face ID nem digital para sites. O desbloqueio será pela senha.</p>
        : cfg.credencial ? (
          <div className="row"><span className="tag good">ativado neste aparelho</span>
            <button className="btn ghost" type="button" onClick={ativarBio}>Cadastrar de novo</button>
            <button className="sair" type="button" onClick={() => { mudar({ credencial: null }); registrar("desativou Face ID / digital neste aparelho"); }}>Desativar</button></div>
        ) : (
          <div className="row"><button className="btn" type="button" onClick={ativarBio} disabled={temBio === null}>Ativar Face ID / digital</button>
            <span className="note">O celular pede o rosto ou a digital para confirmar.</span></div>
        )}
      {msg && <div className={msg.tipo} role="alert">{msg.texto}</div>}
      <p className="note">Estas escolhas valem só para este aparelho. Cada pessoa configura o seu.</p>
    </div>
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
  const [paleta, setPaleta] = useState(lerPaleta);
  const escolher = (p) => { vibrar(); salvarPreferencia(p); setPref(p); };
  const escolherTema = (k) => { vibrar(); salvarPaleta(k); setPaleta(k); };
  return (
    <div className="panel">
      <h2>Aparência</h2>
      <div className="lbl">Claro ou escuro</div>
      <div className="opcoes" role="group" aria-label="Claro ou escuro">
        {[["auto", "Automática", "Clara de dia (6h às 18h), escura à noite"], ["escuro", "Escura", "Sempre escura"], ["claro", "Clara", "Sempre clara"]].map(([k, t, d]) => (
          <button key={k} type="button" aria-pressed={pref === k} onClick={() => escolher(k)}><b>{t}</b><small>{d}</small></button>))}
      </div>
      <div className="lbl">Tema</div>
      <div className="temas" role="group" aria-label="Tema">
        {PALETAS.map(([k, t, d, [c1, c2], figuras]) => {
          const pers = k === "personalizado" ? lerPersonalizado() : null;
          const fundo = gerarFundo(pers ? pers.figuras : figuras, pers ? pers.cor1 : c1, 0.55, 0.5);
          return (
            <button key={k} type="button" className="tema" aria-pressed={paleta === k} onClick={() => escolherTema(k)}>
              <span className="tema-amostra" aria-hidden="true"
                style={{ backgroundImage: `${fundo === "none" ? "" : fundo + ","}linear-gradient(135deg, ${pers ? pers.cor1 : c1}33, ${pers ? pers.cor2 : c2}55)` }}>
                <i style={{ background: `linear-gradient(135deg, ${pers ? pers.cor1 : c1}, ${pers ? pers.cor2 : c2})` }} />
              </span>
              <b>{t}</b><small>{d}</small>
            </button>);
        })}
      </div>
      {paleta === "personalizado" && <MeuTema />}
      <p className="note">A escolha fica guardada neste aparelho. Cada pessoa da casa pode usar um tema diferente.</p>
    </div>
  );
}

/* ---------- Meu tema: cores, desenhos de fundo e foto ---------- */
function MeuTema() {
  const [c, setC] = useState(lerPersonalizado);
  const [foto, setFoto] = useState(lerFotoFundo);
  const [msg, setMsg] = useState(null);
  const mudar = (novo) => { const n = { ...c, ...novo }; setC(n); salvarPersonalizado(n); };
  const alternarFigura = (f) => { vibrar(); mudar({ figuras: c.figuras.includes(f) ? c.figuras.filter((x) => x !== f) : [...c.figuras, f] }); };

  async function escolherFoto(e) {
    const a = e.target.files?.[0]; e.target.value = "";
    if (!a) return;
    setMsg(null);
    try { const d = await prepararFotoFundo(a); salvarFotoFundo(d); setFoto(d); vibrar(); }
    catch (erro) { setMsg(erro.message || "Não consegui usar essa foto."); }
  }

  return (
    <div className="meu-tema">
      <div className="lbl">Cores</div>
      <div className="row">
        <label className="cor"><input type="color" value={c.cor1} onChange={(e) => mudar({ cor1: e.target.value })} /> Principal</label>
        <label className="cor"><input type="color" value={c.cor2} onChange={(e) => mudar({ cor2: e.target.value })} /> Secundária</label>
      </div>
      <div className="lbl">Desenhos de fundo <span className="note">({c.figuras.length} escolhidos)</span></div>
      <div className="figuras">
        {Object.entries(FIGURAS).map(([k, [nome, d]]) => (
          <button key={k} type="button" className="figura" aria-pressed={c.figuras.includes(k)} onClick={() => alternarFigura(k)} title={nome}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
            <small>{nome}</small>
          </button>))}
      </div>
      <div className="grade-campos">
        <label className="campo-c">Intensidade
          <input type="range" min="0.05" max="0.3" step="0.01" value={c.intensidade} onChange={(e) => mudar({ intensidade: Number(e.target.value) })} /></label>
        <label className="campo-c">Tamanho dos desenhos
          <input type="range" min="0.6" max="1.6" step="0.1" value={c.escala} onChange={(e) => { vibrar(); mudar({ escala: Number(e.target.value) }); }} /></label>
      </div>
      <div className="lbl">Foto de fundo (opcional)</div>
      <div className="row">
        <label className="btn ghost" style={{ display: "inline-flex" }}>{foto ? "Trocar foto" : "Escolher foto"}
          <input type="file" accept="image/*" hidden onChange={escolherFoto} /></label>
        {foto && <><img src={foto} alt="Foto de fundo escolhida" className="mini-foto" />
          <button className="sair" type="button" onClick={() => { salvarFotoFundo(null); setFoto(null); }}>Tirar a foto</button></>}
      </div>
      <p className="note">A foto fica com um véu por cima para os textos continuarem fáceis de ler.</p>
      {msg && <div className="erro">{msg}</div>}
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

function Administracao({ secao }) {
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
      {secao("usuarios", "Usuários da casa", usuarios ? `${usuarios.length} ${usuarios.length === 1 ? "pessoa" : "pessoas"} · senhas e permissões` : "Quem usa o sistema", <Usuarios usuarios={usuarios} executar={executar} />)}
      {secao("convidar", "Convidar alguém", "Link pelo WhatsApp ou e-mail", <Convidar executar={executar} />)}
      {secao("auditoria", "Auditoria", "Quem entrou e o que fez", <Auditoria usuarios={usuarios} />)}
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
