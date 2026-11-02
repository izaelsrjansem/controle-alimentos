import { useEffect, useState } from "react";
import { supabase, configurado } from "./supabase.js";
import { useDados } from "./dados.js";
import Login, { NovaSenha } from "./telas/Login.jsx";
import Resumo from "./telas/Resumo.jsx";
import Itens from "./telas/Itens.jsx";
import Lista from "./telas/Lista.jsx";
import Comparar from "./telas/Comparar.jsx";
import Lancar from "./telas/Lancar.jsx";

const ABAS = [
  ["resumo", "Mês"], ["itens", "Itens"], ["lista", "Lista de compras"],
  ["comparar", "Comparar mercados"], ["lancar", "Lançar compra"],
];

export default function App() {
  const [sessao, setSessao] = useState(undefined);
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  useEffect(() => {
    if (!configurado) return;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === "PASSWORD_RECOVERY") setTrocandoSenha(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (trocandoSenha) return <NovaSenha aoConcluir={() => setTrocandoSenha(false)} />;

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
  return <Painel email={sessao.user.email} />;
}

function Painel({ email }) {
  const dados = useDados();
  const inicial = location.hash.slice(1);
  const [aba, setAba] = useState(ABAS.some(([k]) => k === inicial) ? inicial : "resumo");
  const ir = (k) => { setAba(k); history.replaceState(null, "", "#" + k); };

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brand">
            <h1>Despensa e Preços</h1>
            <span className="status">{email} · <button className="sair" onClick={() => supabase.auth.signOut()}>Sair</button></span>
          </div>
          <nav className="tabs" role="tablist" aria-label="Seções">
            {ABAS.map(([k, rotulo]) => (
              <button key={k} role="tab" aria-selected={aba === k} onClick={() => ir(k)}>{rotulo}</button>
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
            </>
          )}
        </section>
      </main>
    </>
  );
}
