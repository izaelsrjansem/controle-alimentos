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

// Marca: hexágono com a "lista do cupom" dentro
export const Logo = () => (
  // Sacola de compras (a despensa) com uma folha brotando (alimento) e as linhas do cupom dentro
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <defs>
      <linearGradient id="lg-marca" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#a78bfa" />
      </linearGradient>
      <linearGradient id="lg-folha" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#a3e635" />
      </linearGradient>
    </defs>
    <path d="M17 17v-3a7 7 0 0 1 14 0v3" fill="none" stroke="url(#lg-marca)" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M9 17h30l-2.4 23.2a3 3 0 0 1-3 2.8H14.4a3 3 0 0 1-3-2.8z" fill="rgba(34,211,238,.10)" stroke="url(#lg-marca)" strokeWidth="2.6" strokeLinejoin="round" />
    <path d="M17 26h14M17 32h9" stroke="url(#lg-marca)" strokeWidth="2.8" strokeLinecap="round" />
    <circle cx="31" cy="32" r="2.4" fill="#22d3ee" />
    <path d="M33 13c1-6 6-9 11-8-.5 5.5-4.5 9.5-11 8z" fill="url(#lg-folha)" />
    <path d="M33.6 12.4c2.2-2.6 4.6-4.2 7.4-5.2" stroke="rgba(4,19,13,.45)" strokeWidth="1" strokeLinecap="round" fill="none" />
  </svg>
);
