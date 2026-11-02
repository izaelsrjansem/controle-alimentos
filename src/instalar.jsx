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

const IconeCompartilhar = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-3px" }}>
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);

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
          {ehIOS() && /CriOS|EdgiOS|FxiOS/.test(navigator.userAgent) ? (
            <ol className="passos">
              <li>Toque no botão <b>Compartilhar</b> <IconeCompartilhar />, que fica <b>na barra do endereço</b>, ao lado do nome do site (no Firefox, no menu <b>☰</b>).</li>
              <li>Role a lista para baixo e toque em <b>Adicionar à Tela de Início</b>.</li>
              <li>Confira o nome <b>Despensa</b> e toque em <b>Adicionar</b>.</li>
            </ol>
          ) : ehIOS() ? (
            <ol className="passos">
              <li>Toque no botão <b>Compartilhar</b> <IconeCompartilhar />, na barra de baixo do Safari.</li>
              <li>Role a lista para baixo e toque em <b>Adicionar à Tela de Início</b>.</li>
              <li>Confira o nome <b>Despensa</b> e toque em <b>Adicionar</b>.</li>
            </ol>
          ) : (
            <ol className="passos">
              <li>Abra este site no <b>Chrome</b> do celular.</li>
              <li>Toque no menu <b>⋮</b>, no canto de cima.</li>
              <li>Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>) e confirme.</li>
            </ol>
          )}
          <p className="note">O ícone do Despensa aparece junto com os outros aplicativos. Ao tocar nele, o sistema abre em tela cheia, sem a barra de endereço do navegador, e você continua conectado.</p>
          {ehIOS() && <p className="note">Se não aparecer "Adicionar à Tela de Início", atualize o iPhone (iOS 16.4 ou mais novo) ou abra o site no Safari.</p>}
        </div>
      </dialog>
    </>
  );
}
