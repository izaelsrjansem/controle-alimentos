import { useState } from "react";
import { supabase } from "../supabase.js";
import { Logo } from "../icones.jsx";

const TEXTOS = {
  entrar: { titulo: "Entrar", botao: "Entrar" },
  criar: { titulo: "Criar conta", botao: "Criar conta" },
  esqueci: { titulo: "Recuperar senha", botao: "Enviar link por e-mail" },
};
const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CHAVE_EMAIL = "ultimo-email";

const lembrado = () => { try { return localStorage.getItem(CHAVE_EMAIL) || ""; } catch { return ""; } };

// Pede ao navegador para guardar o login (Chrome/Android mostra "Salvar senha?"; iPhone usa as Senhas do iCloud pelo próprio formulário)
async function guardarNoNavegador(email, senha) {
  try { localStorage.setItem(CHAVE_EMAIL, email); } catch { /* sem armazenamento */ }
  try {
    if (window.PasswordCredential) await navigator.credentials.store(new window.PasswordCredential({ id: email, password: senha, name: email }));
  } catch { /* navegador recusou: segue sem guardar */ }
}

// Campo de senha com o "olhinho" para mostrar ou esconder
export function CampoSenha({ id, valor, aoMudar, autoComplete, placeholder }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="campo-senha">
      <input id={id} name="password" type={ver ? "text" : "password"} autoComplete={autoComplete} placeholder={placeholder}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} value={valor} onChange={(e) => aoMudar(e.target.value)} />
      <button type="button" className="olho" onClick={() => setVer(!ver)} aria-label={ver ? "Esconder a senha" : "Mostrar a senha"} aria-pressed={ver}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
          {ver && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  );
}

export default function Login() {
  const [modo, setModo] = useState("entrar");
  const [email, setEmail] = useState(lembrado);
  const [senha, setSenha] = useState("");
  const [salvar, setSalvar] = useState(true);
  const [msg, setMsg] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    const mail = email.trim().toLowerCase();
    // validação nossa, com mensagem visível (alguns celulares não mostram o aviso do navegador)
    if (!EMAIL_OK.test(mail)) return setMsg({ tipo: "erro", texto: "Confira o e-mail digitado." });
    if (modo !== "esqueci" && !senha) return setMsg({ tipo: "erro", texto: "Digite a senha." });
    if (modo === "criar" && senha.length < 8) return setMsg({ tipo: "erro", texto: "A senha precisa de pelo menos 8 caracteres." });

    setMsg(null); setEnviando(true);
    let r;
    try {
      // entrando com senha: esta abertura já está liberada (marcado antes, porque o app abre assim que o login confirma)
      if (modo === "entrar") { try { sessionStorage.setItem("aberto-ok", "1"); } catch { /* sem armazenamento */ } }
      if (modo === "entrar") r = await supabase.auth.signInWithPassword({ email: mail, password: senha });
      else if (modo === "criar") r = await supabase.auth.signUp({ email: mail, password: senha, options: { emailRedirectTo: location.origin } });
      else r = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: location.origin });
    } catch (erro) {
      r = { error: { message: /fetch|network/i.test(erro.message) ? "Sem conexão com a internet. Tente de novo." : erro.message } };
    }
    setEnviando(false);
    if (r.error) return setMsg({ tipo: "erro", texto: traduzir(r.error.message) });
    if (modo !== "esqueci" && salvar) await guardarNoNavegador(mail, senha);
    if (modo === "criar" && !r.data.session) setMsg({ tipo: "ok", texto: `Conta criada. Abra o e-mail enviado para ${mail} e clique no link de confirmação; depois entre aqui.` });
    if (modo === "esqueci") setMsg({ tipo: "ok", texto: `Se ${mail} tiver conta, chega em instantes um link para criar uma senha nova.` });
  }

  const trocar = (m) => { setModo(m); setMsg(null); };
  return (
    <div className="login wrap">
      <form className="panel" onSubmit={enviar} noValidate method="post" action="#">
        <div className="logo"><Logo /><div><small>Despensa e Preços</small><h1>{TEXTOS[modo].titulo}</h1></div></div>
        <label className="campo">
          <span className="lbl">E-mail</span>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {modo !== "esqueci" && (
          <div className="campo">
            <label className="lbl" htmlFor="senha">Senha</label>
            <CampoSenha id="senha" valor={senha} aoMudar={setSenha} autoComplete={modo === "criar" ? "new-password" : "current-password"} />
            {modo === "criar" && <span className="note">Mínimo de 8 caracteres.</span>}
          </div>
        )}
        {modo !== "esqueci" && (
          <label className="lembrar"><input type="checkbox" checked={salvar} onChange={(e) => setSalvar(e.target.checked)} />
            Salvar e-mail e senha neste aparelho</label>
        )}
        {msg && <div className={msg.tipo} role="alert">{msg.texto}</div>}
        <button className="btn" type="submit" disabled={enviando}>{enviando ? "Aguarde…" : TEXTOS[modo].botao}</button>
        <div className="row" style={{ justifyContent: "space-between" }}>
          {modo !== "entrar" && <button type="button" className="sair" onClick={() => trocar("entrar")}>Já tenho conta</button>}
          {modo !== "criar" && <button type="button" className="sair" onClick={() => trocar("criar")}>Criar conta</button>}
          {modo !== "esqueci" && <button type="button" className="sair" onClick={() => trocar("esqueci")}>Esqueci a senha</button>}
        </div>
      </form>
    </div>
  );
}

export function NovaSenha({ aoConcluir, convite = false }) {
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState(null);
  const [enviando, setEnviando] = useState(false);
  async function salvar(e) {
    e.preventDefault();
    if (senha.length < 8) return setMsg("A senha precisa de pelo menos 8 caracteres.");
    setEnviando(true);
    const { data, error } = await supabase.auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) return setMsg(traduzir(error.message));
    if (data.user?.email) await guardarNoNavegador(data.user.email, senha);
    aoConcluir();
  }
  return (
    <div className="login wrap">
      <form className="panel" onSubmit={salvar} noValidate method="post" action="#">
        <div className="logo"><Logo /><div><small>Despensa e Preços</small><h1>{convite ? "Bem-vindo(a)! Crie sua senha" : "Criar senha nova"}</h1></div></div>
        {convite && <p className="note">Você foi convidado(a) para a casa. Depois de criar a senha, já entra com as compras, itens e preços compartilhados.</p>}
        <div className="campo">
          <label className="lbl" htmlFor="nova-senha">Nova senha</label>
          <CampoSenha id="nova-senha" valor={senha} aoMudar={setSenha} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" />
        </div>
        {msg && <div className="erro" role="alert">{msg}</div>}
        <button className="btn" type="submit" disabled={enviando}>{enviando ? "Salvando…" : "Salvar senha"}</button>
      </form>
    </div>
  );
}

function traduzir(m) {
  if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(m)) return "Confirme o e-mail pelo link que enviamos antes de entrar.";
  if (/already registered/i.test(m)) return "Este e-mail já tem conta. Use “Já tenho conta”.";
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas seguidas. Aguarde alguns minutos.";
  if (/password should be/i.test(m)) return "A senha é fraca demais. Use pelo menos 8 caracteres.";
  if (/same.*password|different from the old/i.test(m)) return "A senha nova precisa ser diferente da atual.";
  return m;
}
