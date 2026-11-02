import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { aplicarTema } from "./tema.js";

aplicarTema();

createRoot(document.getElementById("root")).render(<App />);

// Service worker só no site publicado (no `npm run dev` atrapalharia o recarregamento)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { /* sem SW o site funciona igual */ }));
}
