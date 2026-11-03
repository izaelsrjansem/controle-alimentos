// Bloqueio por inatividade: depois do tempo escolhido sem uso, a tela fecha e pede Face ID / digital
// (WebAuthn do próprio aparelho) ou a senha; ou, se preferir, faz logout. Tudo vale só para este aparelho.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { CampoSenha } from "./telas/Login.jsx";
import { Logo } from "./icones.jsx";

const CHAVE = "bloqueio";            // { segundos, acao: "bloquear" | "sair", credencial }
const CHAVE_ATIVIDADE = "ultima-atividade";
const CHAVE_TRAVADO = "travado";

export function lerBloqueio() {
  try { return { segundos: 0, acao: "bloquear", credencial: null, ...JSON.parse(localStorage.getItem(CHAVE) || "{}") }; }
  catch { return { segundos: 0, acao: "bloquear", credencial: null }; }
}
export function salvarBloqueio(c) {
  try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch { /* sem armazenamento */ }
  dispatchEvent(new Event("bloqueio-mudou"));
}
const guardar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// ao sair da conta: o próximo login começa do zero (sem tela travada nem tempo antigo)
export function limparBloqueio() { guardar(CHAVE_TRAVADO, null); guardar(CHAVE_ATIVIDADE, null); }

// Esta abertura do app já foi liberada (senha ou Face ID); vale até fechar o app
export function marcarAberto() { try { sessionStorage.setItem("aberto-ok", "1"); } catch { /* sem armazenamento */ } }
const jaAberto = () => { try { return !!sessionStorage.getItem("aberto-ok"); } catch { return true; } };
// Com Face ID ativo: abrir o app sempre começa travado
const pedeAoAbrir = (c) => !!c.credencial && c.aoAbrir !== false && !jaAberto();
// "Bloquear" do topo: trava na hora, sem sair da conta
export function bloquearAgora() { guardar(CHAVE_TRAVADO, "1"); dispatchEvent(new Event("bloquear-agora")); }

const registrar = (acao) => supabase.rpc("registrar", { p_acao: acao, p_descricao: null }).then(() => {}, () => {});

/* ---------- Face ID / digital (WebAuthn com o autenticador do aparelho) ---------- */
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function biometriaDisponivel() {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch { return false; }
}

export async function cadastrarBiometria(email) {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: aleatorio(32),
    rp: { name: "Despensa e Preços", id: location.hostname },
    user: { id: aleatorio(16), name: email, displayName: email },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
    timeout: 60000, attestation: "none",
  } });
  return b64(cred.rawId);
}

async function confirmarBiometria(credencial) {
  await navigator.credentials.get({ publicKey: {
    challenge: aleatorio(32), rpId: location.hostname, timeout: 60000, userVerification: "required",
    allowCredentials: [{ type: "public-key", id: deB64(credencial), transports: ["internal"] }],
  } });
}

/* ---------- Vigia da inatividade + tela de bloqueio ---------- */
export default function Bloqueio({ email }) {
  const [cfg, setCfg] = useState(lerBloqueio);
  const [travado, setTravado] = useState(() => {
    const c = lerBloqueio();
    if (ler(CHAVE_TRAVADO) || pedeAoAbrir(c)) return true;
    const ultima = Number(ler(CHAVE_ATIVIDADE));
    return c.segundos > 0 && c.acao === "bloquear" && ultima > 0 && Date.now() - ultima > c.segundos * 1000;
  });
  const ultima = useRef(Date.now());

  useEffect(() => {
    const f = () => setCfg(lerBloqueio());
    const travar = () => setTravado(true);
    addEventListener("bloqueio-mudou", f);
    addEventListener("bloquear-agora", travar);
    return () => { removeEventListener("bloqueio-mudou", f); removeEventListener("bloquear-agora", travar); };
  }, []);

  const disparar = useCallback(() => {
    if (cfg.acao === "sair") { registrar("saiu por inatividade"); guardar(CHAVE_ATIVIDADE, null); supabase.auth.signOut(); return; }
    guardar(CHAVE_TRAVADO, "1"); setTravado(true); registrar("tela bloqueada por inatividade");
  }, [cfg.acao]);

  useEffect(() => {
    if (!cfg.segundos || travado) return;
    const marcar = () => { ultima.current = Date.now(); guardar(CHAVE_ATIVIDADE, String(ultima.current)); };
    // ao voltar para o app depois de um tempo fora, confere antes de qualquer outra coisa
    const conferir = () => { if (Date.now() - ultima.current > cfg.segundos * 1000) disparar(); };
    const aoVoltar = () => { if (document.visibilityState === "visible") conferir(); else guardar(CHAVE_ATIVIDADE, String(ultima.current)); };
    const salvo = Number(ler(CHAVE_ATIVIDADE));
    if (salvo > 0 && Date.now() - salvo > cfg.segundos * 1000) { disparar(); return; }
    marcar();
    const eventos = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"];
    eventos.forEach((e) => addEventListener(e, marcar, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", aoVoltar);
    const t = setInterval(conferir, 1000);
    return () => { eventos.forEach((e) => removeEventListener(e, marcar, { capture: true })); document.removeEventListener("visibilitychange", aoVoltar); clearInterval(t); };
  }, [cfg.segundos, travado, disparar]);

  const liberar = (como) => { marcarAberto(); guardar(CHAVE_TRAVADO, null); guardar(CHAVE_ATIVIDADE, String(Date.now())); ultima.current = Date.now(); setTravado(false); registrar(como); };

  if (!travado) return null;
  return <TelaBloqueada email={email} credencial={cfg.credencial} liberar={liberar} />;
}

function TelaBloqueada({ email, credencial, liberar }) {
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [comSenhaAberta, setComSenhaAberta] = useState(!credencial);
  const pedindo = useRef(false);
  const tentou = useRef(false);

  const comBiometria = useCallback(async (silencioso = false) => {
    if (pedindo.current) return;
    pedindo.current = true; setMsg(null);
    try { await confirmarBiometria(credencial); liberar("entrou com Face ID / digital"); }
    catch { if (!silencioso) setMsg("Não deu para confirmar pelo Face ID. Toque de novo ou use a senha."); }
    pedindo.current = false;
  }, [credencial, liberar]);

  // tenta abrir o Face ID sozinho; o iPhone costuma exigir um toque, e aí qualquer toque na tela serve
  useEffect(() => { if (credencial && !tentou.current) { tentou.current = true; comBiometria(true); } }, [credencial, comBiometria]);

  async function comSenha(e) {
    e.preventDefault();
    if (!senha) return setMsg("Digite a senha.");
    setOcupado(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setOcupado(false);
    if (error) return setMsg("Senha incorreta.");
    liberar("desbloqueou com senha");
  }

  if (credencial && !comSenhaAberta) {
    return (
      <div className="tela-bloqueio tocar" role="button" tabIndex={0} aria-label="Toque para entrar com Face ID"
        onClick={() => comBiometria()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && comBiometria()}>
        <div className="tocar-centro">
          <Logo />
          <svg className="rosto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M9 9v1M15 9v1M12 9v4h-1M9.5 16a4 4 0 0 0 5 0" /></svg>
          <b>Toque na tela para entrar</b>
          <span className="note">Despensa e Preços · {email}</span>
          {msg && <div className="erro" role="alert">{msg}</div>}
        </div>
        <button className="sair usar-senha" type="button" onClick={(e) => { e.stopPropagation(); setComSenhaAberta(true); }}>Usar a senha</button>
      </div>
    );
  }

  return (
    <div className="tela-bloqueio" role="dialog" aria-modal="true" aria-labelledby="titulo-bloqueio">
      <div className="panel">
        <div className="logo"><Logo /><div><small>Despensa e Preços</small><h1 id="titulo-bloqueio">Entrar</h1></div></div>
        <p className="note">Entre com a senha. {email}</p>
        {credencial && <button className="btn grande" type="button" onClick={() => comBiometria()}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" style={{ verticalAlign: "-5px", marginRight: 8 }}>
            <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M9 9v1M15 9v1M12 9v4h-1M9.5 16a4 4 0 0 0 5 0" /></svg>
          Desbloquear com Face ID</button>}
        <form onSubmit={comSenha} noValidate className="campo">
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <label className="lbl" htmlFor="senha-bloqueio">{credencial ? "Ou use a senha" : "Senha"}</label>
          <CampoSenha id="senha-bloqueio" valor={senha} aoMudar={setSenha} autoComplete="current-password" />
          <button className={credencial ? "btn ghost" : "btn"} type="submit" disabled={ocupado} style={{ marginTop: 8 }}>{ocupado ? "Conferindo…" : "Desbloquear com senha"}</button>
        </form>
        {msg && <div className="erro" role="alert">{msg}</div>}
        <button className="sair" type="button" onClick={() => { guardar(CHAVE_TRAVADO, null); supabase.auth.signOut(); }}>Sair e entrar com outra conta</button>
      </div>
    </div>
  );
}

/* ---------- Oferta única: depois de entrar com a senha, ativar o Face ID para as próximas vezes ---------- */
export function OfertaFaceId({ email }) {
  const [mostrar, setMostrar] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let recusou = false;
    try { recusou = localStorage.getItem("oferta-faceid") === "nao"; } catch { /* sem armazenamento */ }
    if (recusou || lerBloqueio().credencial) return;
    biometriaDisponivel().then(setMostrar);
  }, []);
  if (!mostrar) return null;

  async function ativar() {
    setMsg(null);
    try {
      const credencial = await cadastrarBiometria(email);
      const c = lerBloqueio();
      salvarBloqueio({ ...c, credencial, acao: "bloquear", aoAbrir: true });
      marcarAberto(); registrar("ativou entrada com Face ID / digital");
      setMostrar(false);
    } catch (e) { setMsg(e?.name === "NotAllowedError" ? "Cancelado. Você pode ativar depois em Ajustes → Segurança." : "Este aparelho não deixou usar o Face ID."); }
  }
  const agoraNao = () => { try { localStorage.setItem("oferta-faceid", "nao"); } catch { /* sem armazenamento */ } setMostrar(false); };

  return (
    <div className="oferta-faceid" role="dialog" aria-labelledby="titulo-oferta">
      <div className="panel">
        <svg className="rosto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M9 9v1M15 9v1M12 9v4h-1M9.5 16a4 4 0 0 0 5 0" /></svg>
        <h2 id="titulo-oferta">Entrar com Face ID nas próximas vezes?</h2>
        <p className="note">Sem digitar senha: ao abrir o app, é só olhar para o celular (ou usar a digital).</p>
        {msg && <div className="erro">{msg}</div>}
        <button className="btn grande" type="button" onClick={ativar}>Ativar Face ID</button>
        <button className="sair" type="button" onClick={agoraNao}>Agora não</button>
      </div>
    </div>
  );
}
