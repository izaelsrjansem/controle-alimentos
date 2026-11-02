// Tema da tela: "escuro", "claro" ou "auto" (claro das 6h às 18h, escuro à noite). Fica guardado neste aparelho.
const CHAVE = "tema";
const COR_BARRA = { escuro: "#060a13", claro: "#eef3f9" };

export function lerPreferencia() {
  try { return localStorage.getItem(CHAVE) || "auto"; } catch { return "auto"; }
}

const temaDoHorario = () => { const h = new Date().getHours(); return h >= 6 && h < 18 ? "claro" : "escuro"; };

// Paleta de cores com desenho de fundo: padrao, masculino, feminino, comida, casa
export const PALETAS = [
  ["padrao", "Padrão", "Ciano e violeta", ["#22d3ee", "#a78bfa"]],
  ["masculino", "Masculino", "Azul e grafite", ["#60a5fa", "#94a3b8"]],
  ["feminino", "Feminino", "Rosa e lilás, com flores", ["#f472b6", "#c084fc"]],
  ["comida", "Comida", "Laranja e tomate, com frutas", ["#fb923c", "#ef4444"]],
  ["casa", "Casa", "Verde e terracota, com casinhas", ["#4ade80", "#d97706"]],
];
export function lerPaleta() {
  try { return localStorage.getItem("paleta") || "padrao"; } catch { return "padrao"; }
}
export function salvarPaleta(p) {
  try { localStorage.setItem("paleta", p); } catch { /* vale só nesta visita */ }
  aplicarTema();
}

export function aplicarTema(pref = lerPreferencia()) {
  const tema = pref === "auto" ? temaDoHorario() : pref;
  document.documentElement.dataset.theme = tema;
  document.documentElement.dataset.paleta = lerPaleta();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COR_BARRA[tema]);
  return tema;
}

export function salvarPreferencia(pref) {
  try { localStorage.setItem(CHAVE, pref); } catch { /* sem armazenamento: vale só nesta visita */ }
  return aplicarTema(pref);
}

// no modo automático, confere a hora a cada minuto
setInterval(() => { if (lerPreferencia() === "auto") aplicarTema("auto"); }, 60_000);
