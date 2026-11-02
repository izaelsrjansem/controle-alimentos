import { useState } from "react";
import { supabase } from "../supabase.js";
import { Logo } from "../icones.jsx";

const TEXTOS = {
  entrar: { titulo: "Entrar", botao: "Entrar" },
  criar: { titulo: "Criar conta", botao: "Criar conta" },
  esqueci: { titulo: "Recuperar senha", botao: "Enviar link por e-mail" },
};

export default function Login() {
  const [modo, setModo] = useState("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setMsg(null); setEnviando(true);
    let r;
    if (modo === "entrar") r = await supabase.auth.signInWithPassword({ email, password: senha });
    else if (modo === "criar") r = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin } });
    else r = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    setEnviando(false);
    if (r.error) return setMsg({ tipo: "erro", texto: traduzir(r.error.message) });
    if (modo === "criar" && !r.data.session) setMsg({ tipo: "ok", texto: `Conta criada. Abra o e-mail enviado para ${email} e clique no link de confirmação; depois entre aqui.` });
    if (modo === "esqueci") setMsg({ tipo: "ok", texto: `Se ${email} tiver conta, chega em instantes um link para criar uma senha nova.` });
  }

  return (
    <div className="login wrap">
      <form className="panel" onSubmit={enviar}>
        <div className="logo"><Logo /><div><small>Despensa e Preços</small><h1>{TEXTOS[modo].titulo}</h1></div></div>
        <label className="form" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="lbl">E-mail</span>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {modo !== "esqueci" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="lbl">Senha</span>
            <input id="senha" type="password" minLength={8} required autoComplete={modo === "criar" ? "new-password" : "current-password"}
              value={senha} onChange={(e) => setSenha(e.target.value)} />
            {modo === "criar" && <span className="note">Mínimo de 8 caracteres.</span>}
          </label>
        )}
        {msg && <div className={msg.tipo}>{msg.texto}</div>}
        <button className="btn" disabled={enviando}>{enviando ? "Aguarde…" : TEXTOS[modo].botao}</button>
        <div className="row" style={{ justifyContent: "space-between" }}>
          {modo !== "entrar" && <button type="button" className="sair" onClick={() => { setModo("entrar"); setMsg(null); }}>Já tenho conta</button>}
          {modo !== "criar" && <button type="button" className="sair" onClick={() => { setModo("criar"); setMsg(null); }}>Criar conta</button>}
          {modo !== "esqueci" && <button type="button" className="sair" onClick={() => { setModo("esqueci"); setMsg(null); }}>Esqueci a senha</button>}
        </div>
      </form>
    </div>
  );
}

export function NovaSenha({ aoConcluir, convite = false }) {
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState(null);
  async function salvar(e) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) return setMsg(traduzir(error.message));
    aoConcluir();
  }
  return (
    <div className="login wrap">
      <form className="panel" onSubmit={salvar}>
        <div className="logo"><Logo /><div><small>Despensa e Preços</small><h1>{convite ? "Bem-vindo(a)! Crie sua senha" : "Criar senha nova"}</h1></div></div>
        {convite && <p className="note">Você foi convidado(a) para a casa. Depois de criar a senha, já entra com as compras, itens e preços compartilhados.</p>}
        <input id="nova-senha" type="password" minLength={8} required autoComplete="new-password" placeholder="Nova senha (mínimo 8 caracteres)"
          value={senha} onChange={(e) => setSenha(e.target.value)} />
        {msg && <div className="erro">{msg}</div>}
        <button className="btn">Salvar senha</button>
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
  return m;
}
