// Botão "Instalar app": usa o convite do navegador (Android/Chrome/Edge) ou explica o passo a passo no iPhone.
import { useEffect, useRef, useState } from "react";
import { ICONES } from "./icones.jsx";

const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// o evento pode chegar antes do React montar: guarda desde já
let convite = null;
const ouvintes = new Set();
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); convite = e; ouvintes.forEach((f) => f(e)); });
addEventListener("appinstalled", () => { convite = null; ouvintes.forEach((f) => f(null)); });

export default function InstalarApp() {
  const [evento, setEvento] = useState(convite);
  const [jaInstalado, setJaInstalado] = useState(instalado);
  const dialogo = useRef(null);

  useEffect(() => {
    const f = (e) => { setEvento(e); if (!e) setJaInstalado(true); };
    ouvintes.add(f);
    return () => ouvintes.delete(f);
  }, []);

  if (jaInstalado) return null;

  async function instalar() {
    if (evento) {
      evento.prompt();
      const { outcome } = await evento.userChoice;
      if (outcome === "accepted") { convite = null; setEvento(null); }
      return;
    }
    dialogo.current?.showModal();
  }

  return (
    <>
      <button type="button" className="instalar" onClick={instalar}>{ICONES.instalar}Instalar app</button>
      <dialog ref={dialogo} aria-labelledby="titulo-instalar" onClick={(e) => e.target === dialogo.current && dialogo.current.close()}>
        <div className="hd">
          <h2 id="titulo-instalar">Instalar no celular</h2>
          <button type="button" className="x" aria-label="Fechar" onClick={() => dialogo.current.close()}>×</button>
        </div>
        <div className="bd">
          {ehIOS() ? (
            <ol className="passos">
              <li>Abra este site no <b>Safari</b>.</li>
              <li>Toque no botão <b>Compartilhar</b> (o quadrado com a seta para cima), na barra de baixo.</li>
              <li>Role e toque em <b>Adicionar à Tela de Início</b>, depois em <b>Adicionar</b>.</li>
            </ol>
          ) : (
            <ol className="passos">
              <li>Abra este site no <b>Chrome</b> do celular.</li>
              <li>Toque no menu <b>⋮</b>, no canto de cima.</li>
              <li>Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>) e confirme.</li>
            </ol>
          )}
          <p className="note">O ícone aparece junto com os outros aplicativos e abre em tela cheia, sem a barra do navegador.</p>
        </div>
      </dialog>
    </>
  );
}
