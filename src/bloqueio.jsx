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
    if (ler(CHAVE_TRAVADO)) return true;
    const ultima = Number(ler(CHAVE_ATIVIDADE));
    return c.segundos > 0 && c.acao === "bloquear" && ultima > 0 && Date.now() - ultima > c.segundos * 1000;
  });
  const ultima = useRef(Date.now());

  useEffect(() => {
    const f = () => setCfg(lerBloqueio());
    addEventListener("bloqueio-mudou", f);
    return () => removeEventListener("bloqueio-mudou", f);
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

  const liberar = (como) => { guardar(CHAVE_TRAVADO, null); guardar(CHAVE_ATIVIDADE, String(Date.now())); ultima.current = Date.now(); setTravado(false); registrar(como); };

  if (!travado) return null;
  return <TelaBloqueada email={email} credencial={cfg.credencial} liberar={liberar} />;
}

function TelaBloqueada({ email, credencial, liberar }) {
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const tentou = useRef(false);

  const comBiometria = useCallback(async () => {
    setMsg(null);
    try { await confirmarBiometria(credencial); liberar("desbloqueou com Face ID / digital"); }
    catch { setMsg("Não foi possível confirmar pelo Face ID. Tente de novo ou use a senha."); }
  }, [credencial, liberar]);

  // abre o Face ID sozinho na primeira vez (alguns aparelhos exigem um toque; aí o botão resolve)
  useEffect(() => { if (credencial && !tentou.current) { tentou.current = true; comBiometria(); } }, [credencial, comBiometria]);

  async function comSenha(e) {
    e.preventDefault();
    if (!senha) return setMsg("Digite a senha.");
    setOcupado(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setOcupado(false);
    if (error) return setMsg("Senha incorreta.");
    liberar("desbloqueou com senha");
  }

  return (
    <div className="tela-bloqueio" role="dialog" aria-modal="true" aria-labelledby="titulo-bloqueio">
      <div className="panel">
        <div className="logo"><Logo /><div><small>Despensa e Preços</small><h1 id="titulo-bloqueio">Tela bloqueada</h1></div></div>
        <p className="note">Bloqueada por tempo sem uso. {email}</p>
        {credencial && <button className="btn grande" type="button" onClick={comBiometria}>
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
