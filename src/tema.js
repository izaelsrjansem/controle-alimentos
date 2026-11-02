// Tema da tela: "escuro", "claro" ou "auto" (claro das 6h às 18h, escuro à noite). Fica guardado neste aparelho.
const CHAVE = "tema";
const COR_BARRA = { escuro: "#060a13", claro: "#eef3f9" };

export function lerPreferencia() {
  try { return localStorage.getItem(CHAVE) || "auto"; } catch { return "auto"; }
}

const temaDoHorario = () => { const h = new Date().getHours(); return h >= 6 && h < 18 ? "claro" : "escuro"; };

export function aplicarTema(pref = lerPreferencia()) {
  const tema = pref === "auto" ? temaDoHorario() : pref;
  document.documentElement.dataset.theme = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COR_BARRA[tema]);
  return tema;
}

export function salvarPreferencia(pref) {
  try { localStorage.setItem(CHAVE, pref); } catch { /* sem armazenamento: vale só nesta visita */ }
  return aplicarTema(pref);
}

// no modo automático, confere a hora a cada minuto
setInterval(() => { if (lerPreferencia() === "auto") aplicarTema("auto"); }, 60_000);
