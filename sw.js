// Alzare il numero di versione a OGNI modifica dei file dell'app.
const CACHE_NAME = "festenov26-shell-v6";
const SHELL_FILES = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  // Non mettere MAI in cache le chiamate ai dati Google Sheets: devono essere sempre live.
  if (url.includes("docs.google.com")) return;
  if (event.request.method !== "GET") return;

  // Prima la rete (così le modifiche arrivano subito), la cache solo se si è offline.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
