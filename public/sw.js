// Service worker: deixa o app instalável e abre a casca do app mesmo com internet ruim.
// Os dados (Supabase) nunca passam pelo cache: sempre vêm da rede.
const CACHE = "despensa-v4";
const CASCA = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;

  // páginas: rede primeiro (sempre a versão nova), cache se estiver sem internet
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put("/", copia)); return r; })
      .catch(() => caches.match("/")));
    return;
  }
  // arquivos com hash no nome (/assets/...) nunca mudam: cache primeiro
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then((achou) => achou || fetch(req).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
      return r;
    })));
  }
});
