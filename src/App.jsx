import { useEffect, useState } from "react";
import { supabase, configurado } from "./supabase.js";
import { useDados } from "./dados.js";
import Login, { NovaSenha } from "./telas/Login.jsx";
import Resumo from "./telas/Resumo.jsx";
import Itens from "./telas/Itens.jsx";
import Lista from "./telas/Lista.jsx";
import Comparar from "./telas/Comparar.jsx";
import Lancar from "./telas/Lancar.jsx";
import Ajustes from "./telas/Ajustes.jsx";
import InstalarApp from "./instalar.jsx";
import { ICONES, Logo } from "./icones.jsx";

// [chave, rótulo, rótulo curto da barra inferior do celular]
const ABAS = [
  ["resumo", "Mês", "Mês"], ["itens", "Itens", "Itens"], ["lista", "Lista de compras", "Lista"],
  ["comparar", "Comparar mercados", "Comparar"], ["lancar", "Lançar compra", "Lançar"], ["ajustes", "Ajustes", "Ajustes"],
];

// Quem chega pelo link de convite cai aqui com "#...type=invite": lido antes do Supabase limpar o endereço
const VEIO_DE_CONVITE = new URLSearchParams(location.hash.slice(1)).get("type") === "invite";

// Auditoria: telas abertas e entradas no app (falha aqui nunca atrapalha o uso)
const registrar = (acao, descricao) => supabase?.rpc("registrar", { p_acao: acao, p_descricao: descricao ?? null }).then(() => {}, () => {});
let entrouRegistrado = false;

export default function App() {
  const [sessao, setSessao] = useState(undefined);
  const [trocandoSenha, setTrocandoSenha] = useState(VEIO_DE_CONVITE ? "convite" : false);

  useEffect(() => {
    if (!configurado) return;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === "PASSWORD_RECOVERY") setTrocandoSenha(true);
      // o Supabase repete SIGNED_IN ao renovar a sessão: registra uma vez por abertura
      if (evento === "SIGNED_IN" && !entrouRegistrado) { entrouRegistrado = true; registrar("entrou no app"); }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (trocandoSenha && sessao) return <NovaSenha convite={trocandoSenha === "convite"} aoConcluir={() => { registrar(trocandoSenha === "convite" ? "aceitou o convite" : "trocou a senha"); setTrocandoSenha(false); }} />;

  if (!configurado) {
    return (
      <div className="login wrap"><div className="panel">
        <h1>Falta configurar</h1>
        <p>Cadastre <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> nas variáveis de ambiente (arquivo <code>.env.local</code> ou painel da Vercel) e publique de novo.</p>
      </div></div>
    );
  }
  if (sessao === undefined) return <p className="carregando">Abrindo…</p>;
  if (!sessao) return <Login />;
  return <Painel email={sessao.user.email} userId={sessao.user.id} />;
}

function Painel({ email, userId }) {
  const dados = useDados();
  const inicial = location.hash.slice(1);
  const [aba, setAba] = useState(ABAS.some(([k]) => k === inicial) ? inicial : "resumo");
  const [membro, setMembro] = useState(null);
  const ir = (k) => { setAba(k); history.replaceState(null, "", "#" + k); };

  useEffect(() => {
    supabase.from("membros").select("papel,nome").eq("user_id", userId).maybeSingle().then(({ data }) => setMembro(data));
  }, [userId]);
  useEffect(() => { registrar("abriu a tela", ABAS.find(([k]) => k === aba)?.[1]); }, [aba]);

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brand">
            <div className="logo"><Logo /><div><small>Sistema de compras</small><h1>Despensa e Preços</h1></div></div>
            <span className="status"><InstalarApp /><span className="pulso" aria-hidden="true" />{membro?.nome || email} ·<button className="sair" onClick={() => supabase.auth.signOut()}>Sair</button></span>
          </div>
          <nav className="tabs" role="tablist" aria-label="Seções">
            {ABAS.map(([k, rotulo, curto]) => (
              <button key={k} role="tab" aria-selected={aba === k} aria-label={rotulo} onClick={() => ir(k)}>
                {ICONES[k]}<span className="longo">{rotulo}</span><span className="curto">{curto}</span></button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        <section className="wrap">
          {dados.erro && <div className="erro">Não consegui ler seus dados: {dados.erro}</div>}
          {dados.carregando ? <p className="carregando">Carregando suas compras…</p> : (
            <>
              {aba === "resumo" && <Resumo dados={dados} ir={ir} />}
              {aba === "itens" && <Itens dados={dados} />}
              {aba === "lista" && <Lista dados={dados} />}
              {aba === "comparar" && <Comparar dados={dados} ir={ir} />}
              {aba === "lancar" && <Lancar dados={dados} aoSalvar={() => { dados.recarregar(); ir("resumo"); }} />}
              {aba === "ajustes" && <Ajustes membro={membro} />}
            </>
          )}
        </section>
      </main>
    </>
  );
}
