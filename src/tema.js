// Aparência: claro/escuro/automático + tema (cores e desenhos de fundo). Tudo fica guardado neste aparelho.
const CHAVE = "tema";
const COR_BARRA = { escuro: "#060a13", claro: "#eef3f9" };

export function lerPreferencia() {
  try { return localStorage.getItem(CHAVE) || "auto"; } catch { return "auto"; }
}
const temaDoHorario = () => { const h = new Date().getHours(); return h >= 6 && h < 18 ? "claro" : "escuro"; };

/* ---------- Desenhos de fundo (traço em grade de 24) ---------- */
export const FIGURAS = {
  maca: ["Maçã", "M12 7c-3-2-8 0-7.5 5 .5 4.5 3.5 8 5.5 8 1 0 1.2-.6 2-.6s1 .6 2 .6c2 0 5-3.5 5.5-8C20 7 15 5 12 7zM12 7c0-2 1-3.5 3-4"],
  cenoura: ["Cenoura", "M6 20l4-10 5 5zM12 10l1-4M14 12l4-1M13 11l4-4"],
  banana: ["Banana", "M4 14c4 5 12 4 15-6M4 14c1.5-1 3-1 4 .5M19 8l.5-3"],
  morango: ["Morango", "M12 21c-4-2-7-6-6-10 2-2 10-2 12 0 1 4-2 8-6 10zM9 8l3-3 3 3M10 14h.01M14 14h.01M12 17h.01"],
  uva: ["Uva", "M12 9a2 2 0 1 0 .01 0M9 12a2 2 0 1 0 .01 0M15 12a2 2 0 1 0 .01 0M12 15a2 2 0 1 0 .01 0M12 18a2 2 0 1 0 .01 0M12 7V4l2-1"],
  folha: ["Folha", "M5 19c1-8 7-13 14-13-1 8-6 13-14 13zM5 19c4-4 7-7 10-9"],
  tomate: ["Tomate", "M12 7a6 6 0 1 1-.01 0zM9.5 6.5L12 8l2.5-1.5M12 8V5"],
  pao: ["Pão", "M4 13a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v5H4zM9 10v8M15 10v8"],
  panela: ["Panela", "M4 11h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 11h2M20 11h2M9 8h6M12 8V6"],
  talheres: ["Talheres", "M7 3v18M5 3v5a2 2 0 0 0 4 0V3M16 21V3c2 1 3 4 3 7h-3"],
  xicara: ["Xícara", "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 11h2a2 2 0 0 1 0 4h-2M8 4v3M11 3v4"],
  casa: ["Casa", "M4 11l8-7 8 7v9H4zM10 20v-5h4v5"],
  carrinho: ["Carrinho", "M3 4h2l2.5 11h10l2-8H6.5M9 19h.01M17 19h.01"],
  sacola: ["Sacola", "M5 8h14l-1.4 12H6.4zM9 8V6a3 3 0 0 1 6 0v2"],
  cupom: ["Cupom", "M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21zM9 8h6M9 12h6M9 16h3"],
  cifrao: ["Cifrão", "M12 3v18M16 7c-1-1.5-2.5-2-4-2-2.5 0-4 1.3-4 3s1.5 2.6 4 3 4 1.4 4 3.2S14.5 17 12 17c-1.7 0-3.3-.6-4.3-2"],
  moeda: ["Moeda", "M12 5a7 7 0 1 0 .01 0zM12 8.5v7M10 10.5h3a1 1 0 0 1 0 2h-2a1 1 0 0 0 0 2h3"],
  cofrinho: ["Cofrinho", "M5 12a7 6 0 0 1 13-2l2-1v4l-2 1a7 6 0 0 1-3 4v2h-2v-1.5h-3V20H8v-2.5A6 6 0 0 1 5 12zM15 11h.01M10 8h4"],
  grafico: ["Gráfico", "M4 20V4M4 20h16M8 16l4-5 3 3 5-6"],
  flor: ["Flor", "M12 10a2 2 0 1 0 .01 0M12 4a2.5 2.5 0 0 1 0 4M16.5 9.5a2.5 2.5 0 0 1-3 2.5M15 15a2.5 2.5 0 0 1-3-2M9 15a2.5 2.5 0 0 1 3-2M7.5 9.5a2.5 2.5 0 0 1 3 2.5M12 14v7"],
  coracao: ["Coração", "M12 20c-6-4.5-9-7.5-9-11a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 3.5-3 6.5-9 11z"],
  cupcake: ["Cupcake", "M6 12h12l-2 8H8zM6 12a6 5 0 0 1 12 0M12 7V5"],
  estrela: ["Estrela", "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.6 6.7 19.4l1.2-6L3.4 9.3l6-.7z"],
};

// posições do ladrilho (em unidades de 140×140), com giro, para o desenho não parecer grade
const POSICOES = [[14, 14, -14], [84, 30, 12], [44, 74, -6], [104, 96, 18], [10, 110, 8], [70, 118, -16]];

export function gerarFundo(figuras, cor, opacidade = 0.13, escala = 1) {
  if (!figuras?.length) return "none";
  const t = Math.round(140 * escala);
  const g = POSICOES.map(([x, y, r], i) => {
    const d = FIGURAS[figuras[i % figuras.length]]?.[1];
    return d ? `<g transform='translate(${x * escala} ${y * escala}) scale(${escala}) rotate(${r} 12 12)'><path d='${d}'/></g>` : "";
  }).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${t}' height='${t}'><g fill='none' stroke='${cor}' stroke-opacity='${opacidade}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>${g}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/* ---------- Temas prontos ---------- */
// [chave, nome, descrição, [cor1, cor2], figuras]
export const PALETAS = [
  ["limpo", "Sem tema", "Tela limpa, sem desenhos", ["#818cf8", "#94a3b8"], []],
  ["padrao", "Padrão", "Ciano suave, cor única e limpa", ["#22d3ee", "#a5f3fc"], []],
  ["masculino", "Masculino", "Azul-marinho e grafite, cores sólidas; carrinho, cupom, cifrão", ["#60a5fa", "#94a3b8"], ["carrinho", "cupom", "cifrao", "grafico", "sacola", "moeda"]],
  ["feminino", "Feminino", "Rosa e lilás; morango, flor, cupcake", ["#f472b6", "#c084fc"], ["morango", "flor", "cupcake", "coracao", "uva", "estrela"]],
  ["feira", "Feira", "Verde e laranja; frutas e legumes", ["#4ade80", "#fb923c"], ["maca", "cenoura", "banana", "folha", "uva", "tomate"]],
  ["comida", "Cozinha", "Laranja e tomate; panela, talheres, pão", ["#fb923c", "#ef4444"], ["panela", "talheres", "tomate", "pao", "xicara", "maca"]],
  ["casa", "Casa", "Verde-água e terracota; casa e xícara", ["#2dd4bf", "#d97706"], ["casa", "xicara", "folha", "sacola", "carrinho", "panela"]],
  ["economia", "Economia", "Verde-dinheiro e dourado; cofrinho e moedas", ["#34d399", "#facc15"], ["cifrao", "moeda", "cofrinho", "grafico", "cupom", "carrinho"]],
  ["vidro", "Vidro jateado", "Fundo sólido, tudo transparente por cima", ["#94a3b8", "#cbd5e1"], []],
  ["foto", "Minha foto", "Sua foto no fundo, com vidro jateado", ["#94a3b8", "#e2e8f0"], []],
  ["personalizado", "Meu tema", "Você escolhe cores, desenhos e foto", ["#22d3ee", "#f472b6"], []],
];

const ler = (k, padrao) => { try { return localStorage.getItem(k) ?? padrao; } catch { return padrao; } };
const gravar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* vale só nesta visita */ } };

export const lerPaleta = () => ler("paleta", "padrao");
export function salvarPaleta(p) { gravar("paleta", p); aplicarTema(); }

const PERS_PADRAO = { cor1: "#22d3ee", cor2: "#f472b6", figuras: ["maca", "carrinho", "cifrao", "folha"], intensidade: 0.14, escala: 1 };
export function lerPersonalizado() {
  try { return { ...PERS_PADRAO, ...JSON.parse(ler("tema-personalizado", "{}")) }; } catch { return { ...PERS_PADRAO }; }
}
export function salvarPersonalizado(p) { gravar("tema-personalizado", JSON.stringify(p)); aplicarTema(); }
export const lerFotoFundo = () => ler("tema-foto", null);
export function salvarFotoFundo(dataUrl) {
  try { dataUrl ? localStorage.setItem("tema-foto", dataUrl) : localStorage.removeItem("tema-foto"); }
  catch { throw new Error("A foto é grande demais para guardar neste aparelho. Escolha outra."); }
  aplicarTema();
}

// foto escolhida vira um JPEG leve, para caber no armazenamento do aparelho
export async function prepararFotoFundo(arquivo) {
  const url = URL.createObjectURL(arquivo);
  const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = falha; i.src = url; });
  const escala = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * escala); c.height = Math.round(img.naturalHeight * escala);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.72);
}

/* ---------- Minha foto: a foto vira o fundo e dá as cores do sistema ---------- */
const FOTO_PADRAO = { cor1: "#38bdf8", cor2: "#f472b6", veu: 0.35 };
export function lerTemaFoto() {
  try { return { ...FOTO_PADRAO, ...JSON.parse(ler("tema-foto-cfg", "{}")) }; } catch { return { ...FOTO_PADRAO }; }
}
export function salvarTemaFoto(c) { gravar("tema-foto-cfg", JSON.stringify(c)); aplicarTema(); }
export const lerFotoTema = () => ler("tema-foto-vidro", null);
export function salvarFotoTema(dataUrl) {
  try { dataUrl ? localStorage.setItem("tema-foto-vidro", dataUrl) : localStorage.removeItem("tema-foto-vidro"); }
  catch { throw new Error("A foto é grande demais para guardar neste aparelho. Escolha outra."); }
  aplicarTema();
}

// tira duas cores vivas da foto: a média das partes mais coloridas e uma vizinha no círculo de cores
export async function coresDaFoto(dataUrl) {
  const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = falha; i.src = dataUrl; });
  const c = document.createElement("canvas"); c.width = 48; c.height = 48;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0, 48, 48);
  const px = g.getImageData(0, 0, 48, 48).data;
  let r = 0, gg = 0, b = 0, peso = 0;
  for (let i = 0; i < px.length; i += 4) {
    const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]);
    const sat = mx ? (mx - mn) / mx : 0, w = sat * sat + 0.02;
    r += px[i] * w; gg += px[i + 1] * w; b += px[i + 2] * w; peso += w;
  }
  const [h, , ] = rgbHsl(r / peso, gg / peso, b / peso);
  return { cor1: hslHex(h, 0.75, 0.6), cor2: hslHex((h + 45) % 360, 0.7, 0.65) };
}
function rgbHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function hslHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const hexRgb = (h) => { const n = parseInt(h.replace("#", ""), 16); return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`; };

export function aplicarTema(pref = lerPreferencia()) {
  const raiz = document.documentElement;
  const tema = pref === "auto" ? temaDoHorario() : pref;
  const paleta = lerPaleta();
  raiz.dataset.theme = tema;
  raiz.dataset.paleta = paleta;
  const p = PALETAS.find(([k]) => k === paleta) ?? PALETAS[1];
  const s = raiz.style;
  if (paleta === "foto") {
    const c = lerTemaFoto(), foto = lerFotoTema();
    s.setProperty("--acc-rgb", hexRgb(c.cor1)); s.setProperty("--acc2-rgb", hexRgb(c.cor2));
    s.setProperty("--padrao", "none");
    s.setProperty("--foto", foto ? `url("${foto}")` : "none");
    s.setProperty("--veu", tema === "claro" ? `rgb(255 255 255 / ${c.veu})` : `rgb(6 10 19 / ${c.veu + 0.1})`);
  } else if (paleta === "personalizado") {
    const c = lerPersonalizado();
    s.setProperty("--acc-rgb", hexRgb(c.cor1)); s.setProperty("--acc2-rgb", hexRgb(c.cor2));
    s.setProperty("--padrao", gerarFundo(c.figuras, c.cor1, c.intensidade, c.escala));
    const foto = lerFotoFundo();
    s.setProperty("--foto", foto ? `url("${foto}")` : "none");
    if (foto) s.removeProperty("--veu"); else s.setProperty("--veu", "transparent");
  } else {
    s.removeProperty("--acc-rgb"); s.removeProperty("--acc2-rgb");
    s.setProperty("--padrao", gerarFundo(p[4], p[3][0], tema === "claro" ? 0.16 : 0.13));
    s.setProperty("--foto", "none"); s.setProperty("--veu", "transparent");
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COR_BARRA[tema]);
  return tema;
}

export function salvarPreferencia(pref) {
  gravar(CHAVE, pref);
  return aplicarTema(pref);
}

// toquezinho de vibração ao mudar uma opção (Android; no iPhone com iOS 18+ pelo truque do interruptor)
let interruptor = null;
export function vibrar() {
  try {
    if (navigator.vibrate) { navigator.vibrate(12); return; }
    if (!interruptor) {
      const l = document.createElement("label"), i = document.createElement("input");
      i.type = "checkbox"; i.setAttribute("switch", ""); l.appendChild(i);
      l.style.cssText = "position:fixed;left:-99px;top:0;opacity:0;pointer-events:none";
      document.body.appendChild(l); interruptor = l;
    }
    interruptor.click();
  } catch { /* aparelho sem vibração */ }
}

// no modo automático, confere a hora a cada minuto
setInterval(() => { if (lerPreferencia() === "auto") aplicarTema("auto"); }, 60_000);
