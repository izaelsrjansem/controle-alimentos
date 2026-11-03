// Ícones de traço (24×24) usados nas abas e no cabeçalho.
const Icone = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const ICONES = {
  resumo: <Icone><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 6-6" /><circle cx="20" cy="8" r="1" /></Icone>,
  itens: <Icone><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></Icone>,
  lista: <Icone><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></Icone>,
  comparar: <Icone><path d="M12 3v18" /><path d="M5 7h14" /><path d="M5 7l-3 7a3 3 0 0 0 6 0z" /><path d="M19 7l-3 7a3 3 0 0 0 6 0z" /></Icone>,
  lancar: <Icone><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></Icone>,
  ajustes: <Icone><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Icone>,
  instalar: <Icone><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></Icone>,
};

// Marca: pote de despensa de vidro com camadas de alimentos, tampa, folha e etiqueta de preço (igual ao ícone do app)
export const Logo = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <defs>
      <linearGradient id="lg-marca" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#a78bfa" />
      </linearGradient>
      <clipPath id="lg-pote"><rect x="11.4" y="18.4" width="21.2" height="22.4" rx="3.6" /></clipPath>
    </defs>
    <g clipPath="url(#lg-pote)">
      <path d="M8 25.4q2 -1 4 0t4 0 4 0 4 0 4 0 4 0 4 0V31H8z" fill="#facc15" />
      <path d="M8 30.2q2 1 4 0t4 0 4 0 4 0 4 0 4 0 4 0V36H8z" fill="#fb923c" />
      <path d="M8 35.5q2 -1 4 0t4 0 4 0 4 0 4 0 4 0 4 0V42H8z" fill="#4ade80" />
    </g>
    <rect x="9" y="15.5" width="26" height="27" rx="5.5" fill="rgba(240,249,255,.08)" stroke="url(#lg-marca)" strokeWidth="2.4" />
    <path d="M13.5 22v11" stroke="rgba(240,249,255,.6)" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="10.5" y="7.2" width="23" height="6.8" rx="1.8" fill="url(#lg-marca)" />
    <path d="M16 8.8v3.6M20 8.8v3.6M24 8.8v3.6M28 8.8v3.6" stroke="rgba(15,23,42,.3)" strokeWidth=".8" strokeLinecap="round" />
    <ellipse cx="14.5" cy="5.6" rx="4.6" ry="2" transform="rotate(-31 14.5 5.6)" fill="#4ade80" />
    <path d="M31.5 12.5l4.7 3.7" stroke="#f0f9ff" strokeWidth=".9" />
    <g transform="rotate(26 39.5 19.5)">
      <path d="M34.6 19.5l2.4-3.6h8.4a1.2 1.2 0 0 1 1.2 1.2v4.8a1.2 1.2 0 0 1-1.2 1.2h-8.4z" fill="#f0f9ff" />
      <circle cx="36.3" cy="19.5" r=".9" fill="#1e1b4b" />
      <path d="M38.6 18.2h4.8M38.6 20.9h3" stroke="#a78bfa" strokeWidth="1" strokeLinecap="round" />
    </g>
  </svg>
);
