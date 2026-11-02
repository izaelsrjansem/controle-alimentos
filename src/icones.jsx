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
  instalar: <Icone><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></Icone>,
};

// Marca: hexágono com a "lista do cupom" dentro
export const Logo = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <defs>
      <linearGradient id="lg-marca" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#a78bfa" />
      </linearGradient>
    </defs>
    <path d="M24 3l18 10.5v21L24 45 6 34.5v-21z" fill="rgba(34,211,238,.08)" stroke="url(#lg-marca)" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M16 18h16M16 24h11M16 30h7" stroke="url(#lg-marca)" strokeWidth="3" strokeLinecap="round" />
    <circle cx="32" cy="30" r="2.6" fill="#22d3ee" />
  </svg>
);
