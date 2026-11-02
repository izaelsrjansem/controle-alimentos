// Formatação, exportação e preparo das fotos.

export const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const num = (v, casas = 3) => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: casas });
export const dataBR = (iso) => { if (!iso) return ""; const [a, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${a.slice(2)}`; };
export const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const mesAtual = () => hoje().slice(0, 7);
export const nomeMes = (aaaamm) => {
  const [a, m] = aaaamm.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};
export const medidaTxt = { kg: "kg", L: "litro", un: "un." };
export const NAO_ALIMENTO = new Set(["limpeza", "higiene", "utilidade"]);
export const CATEGORIAS = [
  "Carnes e aves", "Hortifruti", "Mercearia", "Laticínios", "Padaria", "Congelados",
  "Doces e biscoitos", "Temperos e molhos", "Bebidas", "Limpeza", "Higiene", "Utilidades", "Outros",
];
export const TIPO_DA_CATEGORIA = { Limpeza: "limpeza", Higiene: "higiene", Utilidades: "utilidade" };
export const ORIGEM_TXT = { importacao: "Importada", foto: "Leitura do cupom", manual: "Digitada" };

// Mesma data, mesmo mercado e mesmo total pago: quase certamente o mesmo cupom lançado duas vezes
export const mesmaCompra = (a, b) => a.data === b.data && Math.abs(a.total_pago - b.total_pago) < 0.02
  && a.mercado.trim().toLowerCase() === b.mercado.trim().toLowerCase();

/* ---------- CSV que o Excel brasileiro abre direto (; e vírgula decimal) ---------- */
export function baixarCSV(nomeArquivo, cabecalho, linhas) {
  const cel = (v) => {
    if (typeof v === "number") return String(v).replace(".", ",");
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texto = "﻿" + [cabecalho, ...linhas].map((l) => l.map(cel).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nomeArquivo });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Fotos: reduz o peso e corta cupom muito comprido em partes ---------- */
function carregarImagem(arquivo) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error("Não consegui abrir a imagem. Use uma foto JPG ou PNG."));
    img.src = URL.createObjectURL(arquivo);
  });
}
function paraJpeg(canvas) {
  return new Promise((ok) => canvas.toBlob((b) => ok(b), "image/jpeg", 0.86));
}

// Devolve uma lista de Blobs JPEG. Cupom com proporção maior que 2,2:1 é dividido
// ao longo do comprimento em partes que se sobrepõem 10%, para a IA ler cada trecho nítido.
export async function prepararFoto(arquivo, ladoMax = 2000) {
  const img = await carregarImagem(arquivo);
  const w = img.naturalWidth, h = img.naturalHeight;
  const vertical = h >= w;
  const longo = vertical ? h : w, curto = vertical ? w : h;
  const partes = [];
  if (longo / curto > 2.2) {
    const passo = curto * 1.6, sobra = passo * 0.1;
    for (let ini = 0; ini < longo; ini += passo - sobra) {
      const fim = Math.min(longo, ini + passo);
      partes.push([ini, fim]);
      if (fim >= longo) break;
    }
  } else partes.push([0, longo]);

  const saida = [];
  for (const [ini, fim] of partes) {
    const sw = vertical ? w : fim - ini, sh = vertical ? fim - ini : h;
    const escala = Math.min(1, ladoMax / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.round(sw * escala); c.height = Math.round(sh * escala);
    c.getContext("2d").drawImage(img, vertical ? 0 : ini, vertical ? ini : 0, sw, sh, 0, 0, c.width, c.height);
    saida.push(await paraJpeg(c));
  }
  URL.revokeObjectURL(img.src);
  return saida;
}
